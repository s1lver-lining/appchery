#!/usr/bin/env node
/**
 * Holds one frame in front of the scanner and asks what it makes of it as the passes pile up.
 *
 * The archer noticed this by leaving the labelling tool's player running past the end of a recording,
 * where the video element goes on handing out its last frame: the marks kept improving and the wrong
 * ones went away, with nothing new being shown to the detector at all. That should not happen. The
 * tracker's whole argument is agreement across viewpoints, and a held frame is one viewpoint, so
 * anything it gains here it is gaining from something other than the evidence it says it is using.
 *
 *   node scripts/eval-hold.mjs [--passes 60] [--video NAME] [--every 150]
 *
 * Reported as a curve rather than a total, because the question is what changes with time rather than
 * where it ends up.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
const passes = Number(option('passes', 60));
const SCALE = Number(option('scale', 4));
const everyMs = Number(option('every', 0));
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

const { Sweep, toFaceCoords, DETECT_EVERY_MS } = await load();

/** What was true after each pass, summed over every recording. */
const curve = Array.from({ length: passes + 1 }, () => ({ right: 0, wrong: 0, shown: 0 }));
/** How much the proposals themselves move between passes, which is what a held frame should not do. */
const drift = [];
let recordings = 0;
let wanted = 0;

for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	if (label.empty || !label.arrows?.length) continue;

	const fit = label.frames?.[String(label.arrowFrame)];
	// An untouched fit is a guess the tool made, not a label, so nothing may be measured against it.
	if (!fit || fit.skip || !(fit.touched ?? true)) continue;

	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const samples = (await readdir(folder)).filter((f) => f.startsWith('sample-')).sort();
	const file = join(folder, samples[label.arrowFrame]);
	if (!existsSync(file)) continue;
	const hand = homography(fit.handles, ANCHOR_RADII[label.faceType] ?? ANCHOR);
	if (!hand) continue;

	const pixels = await decode(file, meta.width, meta.height);
	const whole = { width: meta.width, height: meta.height, data: pixels };

	// The last pass is the one the labels are compared through, since the fit is still settling.
	const sweep = new Sweep(everyMs || DETECT_EVERY_MS, 30, passes - 1, {
		...tune,
		scale: SCALE,
		arrows: label.arrows.length
	});

	const seen = [];
	for (let i = 0; i < passes; i++) {
		// A fresh copy every pass: the scanner is handed buffers it is free to keep.
		const copy = { width: whole.width, height: whole.height, data: new Uint8ClampedArray(whole.data) };
		sweep.push(reduce(copy, SCALE));
		seen.push({
			arrows: sweep.scannerArrows().map((a) => ({ x: a.x, y: a.y })),
			proposals: sweep.lastProposals().map((p) => ({ x: p.x, y: p.y }))
		});
	}

	const result = sweep.result();
	if (!result.at) continue;
	recordings += 1;
	wanted += label.arrows.length;

	const targets = label.arrows.map((arrow) => {
		const point = project(hand, arrow.x, arrow.y);
		return toFaceCoords(result.at, point.x, point.y);
	});

	seen.forEach((state, i) => {
		const taken = new Set();
		let right = 0;
		for (const target of targets) {
			let best = -1;
			let near = MATCH;
			state.arrows.forEach((mark, k) => {
				if (taken.has(k)) return;
				const d = Math.hypot(mark.x - target.x, mark.y - target.y);
				if (d < near) {
					near = d;
					best = k;
				}
			});
			if (best >= 0) {
				taken.add(best);
				right += 1;
			}
		}
		curve[i].right += right;
		curve[i].wrong += state.arrows.length - taken.size;
		curve[i].shown += state.arrows.length;
	});

	/*
	 * Whether the proposer answers the same thing twice when shown the same thing twice.
	 *
	 * If it does, then nothing the tracker gains over a held frame can be agreement, because there is
	 * only one thing being agreed with. If it does not, the fit is still moving under it, and the
	 * movement is doing the work of a second viewpoint.
	 */
	for (let i = 1; i < seen.length; i++) {
		const before = seen[i - 1].proposals;
		const now = seen[i].proposals;
		if (before.length === 0 && now.length === 0) continue;
		let moved = 0;
		for (const p of now) {
			let near = Infinity;
			for (const q of before) near = Math.min(near, Math.hypot(p.x - q.x, p.y - q.y));
			if (Number.isFinite(near)) moved = Math.max(moved, near);
		}
		drift.push({ pass: i, count: now.length, moved });
	}
}

const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(0)}%`;
console.log(`one frame held in front of the scanner, ${recordings} recordings, ${wanted} arrows`);
console.log(`  pass   right        wrong   shown`);
for (let i = 0; i < curve.length - 1; i++) {
	if (i > 0 && i % Math.max(1, Math.round(passes / 20)) !== 0) continue;
	const c = curve[i];
	console.log(
		`  ${String(i + 1).padStart(4)}   ${String(c.right).padStart(3)}/${wanted} (${pct(c.right, wanted).padStart(3)})` +
			`  ${String(c.wrong).padStart(5)}   ${String(c.shown).padStart(5)}`
	);
}

const early = drift.filter((d) => d.pass <= 5);
const late = drift.filter((d) => d.pass > passes / 2);
const q = (list, share) => {
	const v = list.map((d) => d.moved).sort((a, b) => a - b);
	return v.length ? v[Math.floor((v.length - 1) * share)] : 0;
};
console.log(`\n  how far a proposal moves from one pass to the next, on the same picture, in face radii`);
console.log(`    first five passes   median ${q(early, 0.5).toFixed(3)}  p90 ${q(early, 0.9).toFixed(3)}`);
console.log(`    second half         median ${q(late, 0.5).toFixed(3)}  p90 ${q(late, 0.9).toFixed(3)}`);
console.log(`    passes where nothing moved at all  ${drift.filter((d) => d.moved < 1e-6).length}/${drift.length}`);

function reduce(frame, factor) {
	const width = Math.floor(frame.width / factor);
	const height = Math.floor(frame.height / factor);
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (let dy = 0; dy < factor; dy++) {
				for (let dx = 0; dx < factor; dx++) {
					const p = ((y * factor + dy) * frame.width + (x * factor + dx)) * 4;
					r += frame.data[p];
					g += frame.data[p + 1];
					b += frame.data[p + 2];
				}
			}
			const n = factor * factor;
			const at = (y * width + x) * 4;
			data[at] = r / n;
			data[at + 1] = g / n;
			data[at + 2] = b / n;
			data[at + 3] = 255;
		}
	}
	return { width, height, data };
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
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
		}
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

function decode(file, width, height) {
	return new Promise((good, bad) => {
		const child = spawn('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {
			stdio: ['ignore', 'pipe', 'inherit']
		});
		const bits = [];
		child.stdout.on('data', (b) => bits.push(b));
		child.on('close', () => {
			const data = Buffer.concat(bits);
			if (data.length < width * height * 4) return bad(new Error(`short read for ${file}`));
			good(new Uint8ClampedArray(data.buffer, data.byteOffset, width * height * 4));
		});
	});
}
