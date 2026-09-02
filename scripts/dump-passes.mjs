#!/usr/bin/env node
/**
 * Records what the proposer offered on every pass of every labelled sweep, once, to a file.
 *
 * Everything the tracker decides is downstream of these proposals, and running a recording to get them
 * costs a video decode and a few hundred detection passes. Tuning the tracker against that means
 * paying for the detector again for every question asked about the tracker, which is most of a working
 * day for a handful of answers. Written down once, a tracker can be tried in milliseconds, and a
 * different tracker altogether can be written and measured before lunch.
 *
 *   node scripts/dump-passes.mjs [--seconds 3] [--out test/datasets/passes.json]
 *
 * What is written is the proposals in the coordinates each pass reported them in, the labelled arrows
 * in the coordinates of the fit on the labelled frame, and how sharp each pass's frame was. That is
 * exactly what `eval-arrows-video.mjs` compares, so a tracker measured on this file is measured the
 * same way as one measured on the recordings.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
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
const seconds = Number(option('seconds', 3));
const SCALE = Number(option('scale', 4));
const out = resolve(option('out', join(ROOT, 'test/datasets/passes.json')));
const tune = JSON.parse(option('tune', '{}'));

const ANCHOR_RADII = { '5-ring': 0.6 };
const ANCHOR = 0.8;
const anchorsAt = (r) => [
	[r, 0],
	[0, r],
	[-r, 0],
	[0, -r]
];

const { Sweep, toFaceCoords, downscale, regionBox, DETECT_EVERY_MS } = await load();

/** Four decimals of a face radius, which is far finer than anything downstream can tell apart. */
const round = (v) => Math.round(v * 1e4) / 1e4;

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

const recordings = [];
for (const name of (await readdir(WORK)).sort()) {
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	if (label.empty || !label.arrows?.length) continue;
	const fit = label.frames?.[String(label.arrowFrame)];
	// An untouched fit is the tool's guess, not a label, so nothing may be measured against it.
	if (!fit || fit.skip || !(fit.touched ?? true)) continue;

	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const truth = homography(fit.handles, ANCHOR_RADII[label.faceType] ?? ANCHOR);
	if (!truth) continue;

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

	const sweep = new Sweep(DETECT_EVERY_MS, fps, at - first, {
		...tune,
		scale: SCALE,
		arrows: label.arrows.length,
		motion
	});

	let index = 0;
	// Decoded whole, because the proposer's crop and the search's frame are two reductions of one moment.
	for await (const frame of decode(file, width, height)) {
		if (index < first) {
			index += 1;
			continue;
		}
		if (index > limit) break;
		const whole = {
			width,
			height,
			data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
		};
		// Cut from the face the last frame left, as the camera page cuts it from the face it just followed.
		sweep.push(downscale(whole, SCALE), () => cut(whole, sweep.located, SCALE));
		index += 1;
	}

	const result = sweep.result();
	if (!result.at) {
		process.stderr.write(`  ${name.slice(-24)}  no face on the labelled frame, skipped\n`);
		continue;
	}

	const targets = label.arrows.map((arrow) => {
		const point = project(truth, arrow.x, arrow.y);
		const p = toFaceCoords(result.at, point.x, point.y);
		return [round(p.x), round(p.y)];
	});

	const byPass = [];
	for (let i = 0; i < result.passes; i++) byPass.push([]);
	for (const p of result.everything) {
		if (p.pass < 1 || p.pass > result.passes) continue;
		byPass[p.pass - 1].push([round(p.x), round(p.y), Math.round(p.area), p.face]);
	}

	recordings.push({
		video: name.slice(-24),
		expected: label.arrows.length,
		targets,
		sharpness: result.sharpness.map((s) => round(s)),
		passes: byPass
	});
	process.stderr.write(
		`  ${name.slice(-24)}  ${result.passes} passes, ${result.everything.length} proposals, ${targets.length} arrows\n`
	);
}

await writeFile(out, JSON.stringify({ seconds, scale: SCALE, everyMs: DETECT_EVERY_MS, recordings }));
console.log(
	`${recordings.length} recordings, ${recordings.reduce((n, r) => n + r.passes.length, 0)} passes, ` +
		`${recordings.reduce((n, r) => n + r.targets.length, 0)} arrows written to ${out}`
);

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

function homography(points, radius) {
	const rows = [];
	const anchors = anchorsAt(radius);
	for (let i = 0; i < 4; i++) {
		const [u, v] = anchors[i];
		const [x, y] = points[i];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}
	const h = solve(rows);
	return h && [
		[h[0], h[1], h[2]],
		[h[3], h[4], h[5]],
		[h[6], h[7], 1]
	];
}
function solve(rows) {
	const n = 8;
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
		if (Math.abs(rows[pivot][col]) < 1e-12) return null;
		[rows[col], rows[pivot]] = [rows[pivot], rows[col]];
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = rows[r][col] / rows[col][col];
			for (let c = col; c <= n; c++) rows[r][c] -= factor * rows[col][c];
		}
	}
	return rows.map((row, i) => row[n] / row[i]);
}
function project(h, x, y) {
	const w = h[2][0] * x + h[2][1] * y + h[2][2];
	return {
		x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
		y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w
	};
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
