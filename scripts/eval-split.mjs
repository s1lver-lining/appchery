#!/usr/bin/env node
/**
 * Measures the one thing the replay cannot: what the app's split between page and worker costs.
 *
 * `video-entry.ts` drives a single `Scanner`, so a replay watches one fit of the face. The camera page
 * does not. Detection runs in a worker with a fit of its own, the page follows a second fit on every
 * frame for the overlay, and the two are only ever resynchronised when the number of faces changes,
 * which over a sweep is never. Every arrow the worker confirms is then rebased into the page's frame
 * by `LiveScanner.rebase`, through the picture: face coordinate to pixel through the worker's fit, and
 * pixel back to face coordinate through the page's.
 *
 * That is exact only if the two fits describe the same frame, and they do not. The worker's fit belongs
 * to the frame it was offered; the page's belongs to now. So the pixel is read at a moment when the
 * boss has moved, and the arrow lands wherever the boss has moved to. This reports how far that is.
 *
 *   node scripts/eval-split.mjs [--seconds 3] [--every 150]
 *
 * Reported in face radii, the same unit as impact error, so the two can be put beside each other.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { listRecordings, motionPath } from './lib/recordings.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
const seconds = Number(option('seconds', 3));
const SCALE = Number(option('scale', 4));

const { Sweep, toFaceCoords, toImageCoords, downscale, regionBox, refineFace, scoreAt, WA_10_RING, DETECT_EVERY_MS } = await load();
const everyMs = Number(option('every', DETECT_EVERY_MS));
/**
 * How long the worker takes to answer, in milliseconds, which is the whole of the error being measured.
 *
 * `LiveScanner.rebase` runs when the result lands, not on every frame after it, so the two fits are
 * exactly this far apart in time and no further. A pass costs about forty milliseconds on a laptop and
 * that times whatever a phone is slower by.
 */
const latencyMs = Number(option('latency', 40));
/** Whether the page takes the worker's fit back when its own has plainly lost the boss. */
const recover = !args.includes('--no-recover');

const rates = new Map();
async function frameRate(file) {
	if (rates.has(file)) return rates.get(file);
	const text = await new Promise((done) => {
		const child = spawn(
			'ffprobe',
			['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file],
			{ stdio: ['ignore', 'pipe', 'ignore'] }
		);
		let got = '';
		child.stdout.on('data', (c) => (got += c));
		child.on('close', () => done(got));
	});
	const stamps = text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '')
		.map(Number)
		.filter(Number.isFinite);
	const last = stamps[stamps.length - 1] ?? 0;
	const rate = stamps.length > 1 && last > 0 ? (stamps.length - 1) / last : 30;
	rates.set(file, rate);
	return rate;
}

async function fileOf(name) {
	const found = await listRecordings(VIDEOS);
	return found.find((r) => r.name === name)?.path ?? join(VIDEOS, name);
}

/** How far a mark moves when it is rebased, in face radii, over every pass of every recording. */
const moved = [];
/** How far the boss itself travelled in the picture between the two fits, in face radii. */
const travelled = [];
/** Whether the ring a mark scores changes when it is read through the page's fit instead. */
let rings = 0;
let ringsChanged = 0;
let ringsBy2 = 0;
let recordings = 0;

for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	if (label.empty || !label.arrows?.length) continue;
	const fit = label.frames?.[String(label.arrowFrame)];
	if (!fit || fit.skip || !(fit.touched ?? true)) continue;

	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const { width, height } = meta;
	const at = meta.chosen[label.arrowFrame];
	const file = await fileOf(name);
	const fps = await frameRate(file);
	const span = Math.round(seconds * fps);
	const first = Math.max(0, at - span);
	const limit = at + span;
	const motion = existsSync(motionPath(file))
		? (JSON.parse(await readFile(motionPath(file), 'utf8')).samples ?? null)
		: null;

	const sweep = new Sweep(everyMs, fps, at - first, { scale: SCALE, arrows: label.arrows.length, motion });

	/**
	 * The camera page's own side of the split, modelled exactly as `LiveScanner` runs it.
	 *
	 * It never searches. It takes the worker's faces only when the *number* of them changes, which after
	 * the first acquisition is almost never, and follows what it has on every frame. That is the whole
	 * of the page's geometry, and it is the half of the app no replay drives.
	 */
	let pageFaces = [];

	let index = 0;
	/** Passes whose answer has not yet come back, in the order they were offered. */
	const waiting = [];
	// The worker's answer arrives this many frames after the frame it was handed.
	const lag = Math.max(1, Math.round((latencyMs / 1000) * fps));
	for await (const frame of decode(file, width, height)) {
		if (index < first) {
			index += 1;
			continue;
		}
		if (index > limit) break;
		const whole = { width, height, data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length) };
		const small = downscale(whole, SCALE);
		const before = sweep.passesTaken();
		sweep.push(small, () => cut(whole, sweep.located, SCALE));
		// The page never searches; it only ever follows what it already has.

		const took = sweep.passesTaken() > before;
		/*
		 * The page adopts when a face has appeared or gone, and when its own fit has plainly lost the
		 * boss, exactly as `LiveScanner` does. `--no-recover` measures the version without the second.
		 */
		if (took) {
			const theirs = sweep.locatedAll();
			const lost = !recover ? false : pageFaces.some((ours, i) => {
				const other = theirs[i];
				if (!other) return false;
				const radius = Math.max(1, (ours.semiMajor + ours.semiMinor) / 2);
				return Math.hypot(ours.cx - other.cx, ours.cy - other.cy) / radius > 0.2;
			});
			if (pageFaces.length !== theirs.length || lost) pageFaces = theirs;
		}
		// And follows what it has on every frame, which is what keeps the overlay on the boss.
		if (pageFaces.length > 0) {
			pageFaces = pageFaces.map((face) => refineFace(small, face, false, sweep.upNow()));
		}
		/*
		 * A pass answers a few frames after the frame it was given, and the page rebases then.
		 *
		 * Not on every frame after it: `rebase` runs once, in the worker's message handler, and what it
		 * lands on is the page's fit at that moment. Measured on any other frame this reads the drift of
		 * two chains left alone for as long as one likes, which is not a thing the app ever does.
		 */
		if (took && sweep.located) waiting.push({ at: index + lag, face: { ...sweep.located } });
		// Queued rather than held one at a time: a pass slower than the interval would otherwise be
		// overwritten by the next before its answer was ever read, and the run reports nothing at all.
		const due = waiting.length > 0 && waiting[0].at <= index ? waiting.shift() : null;
		if (due) {
			const theirs = due.face;
			const ours = pageFaces[0] ?? null;
			if (ours) {
				for (const arrow of label.arrows) {
					const pixel = toImageCoords(theirs, arrow.x, arrow.y);
					const here = toFaceCoords(ours, pixel.x, pixel.y);
					moved.push(Math.hypot(here.x - arrow.x, here.y - arrow.y));
					// The number the archer would write down, read each way round.
					const found = scoreAt(WA_10_RING, arrow.x, arrow.y).value;
					const drawn = scoreAt(WA_10_RING, here.x, here.y).value;
					rings += 1;
					if (found !== drawn) ringsChanged += 1;
					if (Math.abs(found - drawn) >= 2) ringsBy2 += 1;
				}
				const radius = (ours.semiMajor + ours.semiMinor) / 2;
				travelled.push(Math.hypot(theirs.cx - ours.cx, theirs.cy - ours.cy) / Math.max(1, radius));
			}
		}
		index += 1;
	}
	recordings += 1;
	process.stderr.write(`  ${name.slice(-24)}  ${sweep.passesTaken()} passes\n`);
}

const q = (list, share) => {
	const v = [...list].sort((a, b) => a - b);
	return v.length ? v[Math.floor((v.length - 1) * share)] : 0;
};
const pct = (v) => `${(v * 100).toFixed(1)}%`;
console.log(`\nthe page's fit against the worker's ${latencyMs}ms later, over ${recordings} recordings, ${moved.length} readings`);
console.log(`  a mark moves when rebased    median ${pct(q(moved, 0.5))}  p90 ${pct(q(moved, 0.9))}  p99 ${pct(q(moved, 0.99))} of a face radius`);
console.log(`  the two fits sit apart by    median ${pct(q(travelled, 0.5))}  p90 ${pct(q(travelled, 0.9))}  p99 ${pct(q(travelled, 0.99))} of a face radius`);
console.log(`\n  the ring it would be scored changes on ${ringsChanged} of ${rings} readings (${((ringsChanged / Math.max(1, rings)) * 100).toFixed(1)}%)`);
console.log(`    by two rings or more on ${ringsBy2} (${((ringsBy2 / Math.max(1, rings)) * 100).toFixed(1)}%)`);
console.log(`\n  for comparison, a ring is 10% of a radius and the impact error is about 1.7% at the median`);

/** The camera page's own crop of the paper, averaged over each block as a canvas would. */
function cut(full, face, detectScale) {
	if (!face) return null;
	const box = regionBox(face, detectScale, full.width, full.height);
	if (!box) return null;
	const data = new Uint8ClampedArray(box.width * box.height * 4);
	for (let y = 0; y < box.height; y++) {
		for (let x = 0; x < box.width; x++) {
			let r = 0, g = 0, b = 0;
			for (let dy = 0; dy < box.scale; dy++) {
				for (let dx = 0; dx < box.scale; dx++) {
					const sx = Math.min(full.width - 1, box.x + x * box.scale + dx);
					const sy = Math.min(full.height - 1, box.y + y * box.scale + dy);
					const from = (sy * full.width + sx) * 4;
					r += full.data[from];
					g += full.data[from + 1];
					b += full.data[from + 2];
				}
			}
			const n = box.scale * box.scale;
			const to = (y * box.width + x) * 4;
			data[to] = r / n;
			data[to + 1] = g / n;
			data[to + 2] = b / n;
			data[to + 3] = 255;
		}
	}
	return { frame: { width: box.width, height: box.height, data }, x: box.x, y: box.y, scale: box.scale };
}

async function load() {
	const directory = await mkdtemp(join(tmpdir(), 'appchery-vision-'));
	const outfile = join(directory, 'vision.mjs');
	await build({
		entryPoints: [join(ROOT, 'src/lib/vision/sweep-entry.ts')],
		bundle: true,
		format: 'esm',
		platform: 'node',
		outfile
	});
	const module = await import(outfile);
	setTimeout(() => rm(directory, { recursive: true, force: true }), 0).unref?.();
	return module;
}

async function* decode(file, width, height) {
	const child = spawn(
		'ffmpeg',
		[
			'-v', 'error', '-i', resolve(file),
			'-vf', `scale=${width}:${height}:flags=area`,
			'-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
		],
		{ stdio: ['ignore', 'pipe', 'inherit'] }
	);
	const size = width * height * 4;
	let held = Buffer.alloc(0);
	try {
		for await (const chunk of child.stdout) {
			held = held.length === 0 ? chunk : Buffer.concat([held, chunk]);
			while (held.length >= size) {
				yield held.subarray(0, size);
				held = held.subarray(size);
			}
		}
	} finally {
		child.kill('SIGKILL');
	}
}
