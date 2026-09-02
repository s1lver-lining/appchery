#!/usr/bin/env node
/**
 * Asks whether some frames of a sweep are worth more than others, and whether it shows before the pass.
 *
 * The detector spends its passes on a clock. A sweep is made by a walking archer, so the frames that
 * clock lands on are not equally good: some are taken mid stride and smeared, and a shaft two pixels
 * wide does not survive that. If a blurred pass proposes mostly wrong places, then the clock is handing
 * the tracker noise it then has to be strict enough to reject, and the strictness is paid for by every
 * good pass as well.
 *
 * So this reports, over every detection pass of every labelled recording, how right its proposals were
 * against how sharp the paper looked on that frame. Sharpness is measured on the frame the detector was
 * handed, before it looks at it, so a policy could act on it.
 *
 *   node scripts/eval-passes.mjs [--seconds 3] [--video NAME]
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
const tune = JSON.parse(option('tune', '{}'));

const ANCHOR_RADII = { '5-ring': 0.6 };
const ANCHOR = 0.8;
const anchorsAt = (r) => [
	[r, 0],
	[0, r],
	[-r, 0],
	[0, -r]
];
const MATCH = 0.05;

const { Sweep, toFaceCoords, downscale, regionBox, DETECT_EVERY_MS } = await load();

const rates = new Map();
async function frameRate(file) {
	if (rates.has(file)) return rates.get(file);
	const out = await new Promise((done) => {
		const child = spawn(
			'ffprobe',
			['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file],
			{ stdio: ['ignore', 'pipe', 'ignore'] }
		);
		let text = '';
		child.stdout.on('data', (chunk) => (text += chunk));
		child.on('close', () => done(text));
	});
	const stamps = out
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

/** Every pass of every recording: how sharp its frame was, and how right what it proposed was. */
const passes = [];

for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	if (label.empty || !label.arrows?.length) continue;
	const fit = label.frames?.[String(label.arrowFrame)];
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
	if (!result.at) continue;

	const targets = label.arrows.map((arrow) => {
		const point = project(truth, arrow.x, arrow.y);
		return toFaceCoords(result.at, point.x, point.y);
	});

	// Sharpness is a property of the picture, so it is only comparable inside one recording.
	const seen = [...result.sharpness].sort((a, b) => a - b);
	const middle = seen[Math.floor(seen.length / 2)] || 1;

	const byPass = new Map();
	for (const p of result.everything) {
		if (!byPass.has(p.pass)) byPass.set(p.pass, []);
		byPass.get(p.pass).push(p);
	}
	for (let pass = 1; pass <= result.passes; pass++) {
		const offered = byPass.get(pass) ?? [];
		const taken = new Set();
		let right = 0;
		for (const target of targets) {
			let best = -1;
			let near = MATCH;
			offered.forEach((p, i) => {
				if (taken.has(i)) return;
				const d = Math.hypot(p.x - target.x, p.y - target.y);
				if (d < near) {
					near = d;
					best = i;
				}
			});
			if (best >= 0) {
				taken.add(best);
				right += 1;
			}
		}
		passes.push({
			video: name.slice(-24),
			sharp: (result.sharpness[pass - 1] ?? 0) / middle,
			offered: offered.length,
			right,
			wanted: targets.length
		});
	}
}

const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(0)}%`;
console.log(`${passes.length} detection passes over ${new Set(passes.map((p) => p.video)).size} recordings\n`);

/*
 * Passes grouped by how sharp their frame was against the middling frame of their own recording.
 *
 * Against their own, because sharpness is a number about a picture: a boss close up under a hard sun
 * reads several times what the same boss reads across a field in flat light, and nothing about that
 * comparison says which pass was worth taking.
 */
const bands = [
	['much blurrier (< 0.8)', (s) => s < 0.8],
	['blurrier (0.8 to 0.95)', (s) => s >= 0.8 && s < 0.95],
	['middling (0.95 to 1.05)', (s) => s >= 0.95 && s < 1.05],
	['sharper (1.05 to 1.2)', (s) => s >= 1.05 && s < 1.2],
	['much sharper (> 1.2)', (s) => s >= 1.2]
];
console.log(`  ${'how sharp the frame was'.padEnd(26)} passes  proposals  of those right  arrows seen`);
for (const [label, holds] of bands) {
	const list = passes.filter((p) => holds(p.sharp));
	if (list.length === 0) continue;
	const offered = list.reduce((n, p) => n + p.offered, 0);
	const right = list.reduce((n, p) => n + p.right, 0);
	const wanted = list.reduce((n, p) => n + p.wanted, 0);
	console.log(
		`  ${label.padEnd(26)} ${String(list.length).padStart(6)}  ${String(offered).padStart(9)}  ` +
			`${pct(right, offered).padStart(14)}  ${pct(right, wanted).padStart(11)}`
	);
}

/* The same question asked the other way round: of the passes that were worth something, how sharp? */
const useful = passes.filter((p) => p.right > 0);
const useless = passes.filter((p) => p.right === 0);
const q = (list, share) => {
	const v = list.map((p) => p.sharp).sort((a, b) => a - b);
	return v.length ? v[Math.floor((v.length - 1) * share)] : 0;
};
console.log(`\n  passes that placed at least one arrow  ${useful.length}  sharpness p10 ${q(useful, 0.1).toFixed(2)} median ${q(useful, 0.5).toFixed(2)} p90 ${q(useful, 0.9).toFixed(2)}`);
console.log(`  passes that placed none                ${useless.length}  sharpness p10 ${q(useless, 0.1).toFixed(2)} median ${q(useless, 0.5).toFixed(2)} p90 ${q(useless, 0.9).toFixed(2)}`);

/*
 * What a policy could have won. Passes are the scarce thing: one is offered every 150ms and the archer
 * sweeps for a few seconds, so about twenty of them decide the end. Spending them on the sharpest
 * frames instead of on whichever frame the clock lands on is free, because the sharpness of a frame is
 * known before the pass is taken.
 */
console.log('\n  if the clock could have chosen its frames:');
for (const share of [0.25, 0.5, 0.75]) {
	const kept = [...passes].sort((a, b) => b.sharp - a.sharp).slice(0, Math.round(passes.length * share));
	const offered = kept.reduce((n, p) => n + p.offered, 0);
	const right = kept.reduce((n, p) => n + p.right, 0);
	console.log(
		`    keeping the sharpest ${pct(share, 1).padStart(4)} of passes  ${pct(right, offered)} of proposals right ` +
			`(${right} right of ${offered})`
	);
}
const offeredAll = passes.reduce((n, p) => n + p.offered, 0);
const rightAll = passes.reduce((n, p) => n + p.right, 0);
console.log(`    every pass, as it is now              ${pct(rightAll, offeredAll)} of proposals right (${rightAll} right of ${offeredAll})`);

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
