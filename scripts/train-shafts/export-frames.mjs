#!/usr/bin/env node
/**
 * Measures the arrow proposer alone, on single frames, against the archer's own fit for that frame.
 *
 * Every other harness here measures the proposer through the tracker, and the tracker reads its
 * proposals through a fit that it maintained itself over a whole sweep. That makes a missed arrow
 * ambiguous: the proposer may have failed to see the shaft, or it may have seen it and reported it in
 * coordinates that had quietly turned. The two look identical in the totals and want completely
 * different work.
 *
 * So nothing here is followed and nothing is tracked. Only frames the archer labelled outright are
 * used: their own four handles, dragged onto the printed edge of that very frame, and every one of the
 * end's arrows clicked on that same picture. A frame whose arrows were carried over from another one
 * is not evidence about this frame and is left out, which is most of what a sweep contains.
 *
 *   node scripts/eval-proposer.mjs [--video NAME] [--tune '{...}'] [--model FILE] [--verbose]
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { hasLabel, readLabel } from '../lib/labels.mjs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = new URL("../..", import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
/** How much the picture is reduced before detection. Four is what the app uses. */
const SCALE = Number(process.argv.includes('--scale') ? process.argv[process.argv.indexOf('--scale') + 1] : 4);
const ANCHOR_RADII = { '5-ring': 0.6 };
const ANCHOR = 0.8;
const anchorsAt = (r) => [[r, 0], [0, r], [-r, 0], [0, -r]];
/** How close a proposal must be to a labelled impact to count as that arrow, in face radii. */
const MATCH = Number(process.env.MATCH ?? 0.05);

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
/** A JSON list of recording names to keep to, so a tuning run can leave a holdout out of it. */
const listed = option('list', null) ? new Set(JSON.parse(await readFile(resolve(option('list', null)), 'utf8'))) : null;
const tune = JSON.parse(option('tune', '{}'));
const modelPath = option('model', null);
const model = modelPath ? JSON.parse(await readFile(resolve(modelPath), 'utf8')) : null;
const verbose = args.includes('--verbose');
const cropped = args.includes('--crop');
/** A file to write every frame's labelled arrows, proposals and turned away runs to, for a closer look. */
const dumpTo = option('dump', null);
const dumped = [];
const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(0)}%`;

const { propose, downscale } = await load();

/**
 * Every labelled frame, decoded once and reduced once.
 *
 * The reduction is the detector's own, and the fit is reduced with it, so what is cached is exactly
 * what the detector would have been handed. Held in memory because tuning means running the same
 * sixty frames through twenty settings, and decoding them again each time is the whole cost.
 */
const cache = [];
for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	if (listed && !listed.has(name)) continue;
	const folder = join(WORK, name);
	if (!hasLabel(folder)) continue;
	const label = readLabel(folder);
	if (label.empty || !label.arrows?.length) continue;
	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const samples = (await readdir(folder)).filter((f) => f.startsWith('sample-')).sort();
	const radius = ANCHOR_RADII[label.faceType] ?? ANCHOR;
	const kind = label.faceType ?? 'unsaid';
	const count = label.arrows.length;

	/*
	 * The frames the archer actually looked at, each with its own fit and its own full set of arrows.
	 * A partial set is not a frame where the rest are absent, it is a frame that was not finished.
	 */
	// Every frame is matched on its own, as a set: arrow numbers are not the same shaft from frame to frame.
	const labelled = new Map();
	const consider = (index, arrows) => {
		const fit = label.frames?.[String(index)];
		if (!fit || fit.skip || !fit.handles || !(fit.touched ?? true)) return;
		// Arrows out of sight are accounted for, and a proposal on one is neither right nor wrong.
		const hidden = label.frameHidden?.[String(index)] ?? [];
		if (!arrows || arrows.length + hidden.length !== count) return;
		labelled.set(index, { handles: fit.handles, arrows, hidden });
	};
	consider(label.arrowFrame, label.arrows);
	for (const [index, arrows] of Object.entries(label.frameArrows ?? {})) consider(Number(index), arrows);

	for (const [index, { handles, arrows, hidden }] of [...labelled].sort((a, b) => a[0] - b[0])) {
		const hand = homography(handles, radius);
		if (!hand) continue;
		const file = join(folder, samples[index]);
		if (!existsSync(file)) continue;
		const pixels = await decode(file, meta.width, meta.height);
		const whole = { width: meta.width, height: meta.height, data: pixels };
		// The fit as four anchors at the radius the detector's own frame uses, in the original picture.
		const full = anchorsAt(ANCHOR).map(([u, v]) => {
			const p = project(hand, (u / ANCHOR) * radius, (v / ANCHOR) * radius);
			return [p.x, p.y];
		});

		/*
		 * Only the boss, at whatever reduction is being tried.
		 *
		 * Detection costs one pass over every pixel it is given, and most of the pixels in a frame are
		 * grass, feet and fence. The face is already known by the time arrows are looked for, so the
		 * rest of the picture is being searched for arrows that cannot be in it. Cutting to the face
		 * first is what makes looking at it closely affordable.
		 */
		const box = cropped ? boundsOf(hand, radius, meta) : { x: 0, y: 0, width: meta.width, height: meta.height };
		const cut = cropped ? cutOut(whole, box) : whole;
		const small = downscale(cut, SCALE);
		const corners = full.map(([x, y]) => [(x - box.x) / SCALE, (y - box.y) / SCALE]);
		// Each nock with its arrow's tip, both in face coordinates, which is a shaft whose line is known.
		const back = invert(hand);
		const shafts = (label.nocks?.[String(index)] ?? []).flatMap((nock) => {
			const tip = arrows.find((a, i) => (a.n ?? i) === nock.arrow);
			return tip ? [{ tip, nock: project(back, nock.x, nock.y) }] : [];
		});
		cache.push({ video: name, index, small, corners, kind, arrows: arrows.map((a) => { const p = project(hand, a.x, a.y); return { x: (p.x - box.x) / SCALE, y: (p.y - box.y) / SCALE, fx: a.x, fy: a.y, n: a.n }; }), hidden, shafts: (label.nocks?.[String(index)] ?? []).flatMap((nock) => { const tip = arrows.find((a, i) => (a.n ?? i) === nock.arrow); if (!tip) return []; const p = project(hand, tip.x, tip.y); return [{ tip: { x: (p.x - box.x) / SCALE, y: (p.y - box.y) / SCALE, fx: tip.x, fy: tip.y }, nock: { x: (nock.x - box.x) / SCALE, y: (nock.y - box.y) / SCALE }, cut: !!nock.cut }]; }), hand: hand.map((r) => r.slice()), box, radius });
	}
}
const { writeFileSync } = await import("node:fs");
const OUT = process.env.OUT;
const index = [];
cache.forEach((shot, i) => {
	writeFileSync(join(OUT, `f${i}.rgba`), Buffer.from(shot.small.data.buffer, shot.small.data.byteOffset, shot.small.data.length));
	index.push({ file: `f${i}.rgba`, width: shot.small.width, height: shot.small.height, video: shot.video, index: shot.index, corners: shot.corners, kind: shot.kind, arrows: shot.arrows, hidden: shot.hidden, shafts: shot.shafts, hand: shot.hand, box: shot.box, radius: shot.radius, scale: SCALE });
});
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(cache.length, 'frames', index.reduce((n, f) => n + f.shafts.length, 0), 'shafts');
/** The face's own square of the picture, with a little room round it for a shaft standing proud. */
function boundsOf(hand, radius, meta) {
	let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
	for (let i = 0; i < 64; i++) {
		const a = (i / 64) * Math.PI * 2;
		// Out past the printed edge, because an arrow in the outer ring is still on the paper and a
		// shaft leaning out of it is the thing the impact point is read from.
		const p = project(hand, Math.cos(a) * radius * 1.35, Math.sin(a) * radius * 1.35);
		left = Math.min(left, p.x); right = Math.max(right, p.x);
		top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
	}
	const x = Math.max(0, Math.floor(left));
	const y = Math.max(0, Math.floor(top));
	return {
		x,
		y,
		width: Math.min(meta.width - x, Math.ceil(right) - x),
		height: Math.min(meta.height - y, Math.ceil(bottom) - y)
	};
}

function cutOut(frame, box) {
	const data = new Uint8ClampedArray(box.width * box.height * 4);
	for (let row = 0; row < box.height; row++) {
		const from = ((box.y + row) * frame.width + box.x) * 4;
		data.set(frame.data.subarray(from, from + box.width * 4), row * box.width * 4);
	}
	return { width: box.width, height: box.height, data };
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
	return h && [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
}
function solve(rows) {
	const n = 8;
	for (let col = 0; col < n; col++) {
		let p = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[p][col])) p = r;
		if (Math.abs(rows[p][col]) < 1e-12) return null;
		[rows[col], rows[p]] = [rows[p], rows[col]];
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = rows[r][col] / rows[col][col];
			for (let c = col; c <= n; c++) rows[r][c] -= f * rows[col][c];
		}
	}
	return rows.map((row, i) => row[n] / row[i]);
}
function project(h, x, y) {
	const w = h[2][0] * x + h[2][1] * y + h[2][2];
	return { x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w, y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w };
}
async function load() {
	const directory = await mkdtemp(join(tmpdir(), 'appchery-vision-'));
	const outfile = join(directory, 'vision.mjs');
	await build({ entryPoints: [join(ROOT, 'src/lib/vision/proposer-entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile });
	const module = await import(outfile);
	setTimeout(() => rm(directory, { recursive: true, force: true }), 0).unref?.();
	return module;
}
function decode(file, width, height) {
	return new Promise((good, bad) => {
		const child = spawn('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
		const bits = [];
		child.stdout.on('data', (b) => bits.push(b));
		child.on('close', () => {
			const data = Buffer.concat(bits);
			if (data.length < width * height * 4) return bad(new Error(`short read for ${file}`));
			good(new Uint8ClampedArray(data.buffer, data.byteOffset, width * height * 4));
		});
	});
}
function invert(h) {
	const [[a, b, c], [d, e, f], [g, k, l]] = h;
	const det = a * (e * l - f * k) - b * (d * l - f * g) + c * (d * k - e * g);
	const m = [
		[(e * l - f * k) / det, (c * k - b * l) / det, (b * f - c * e) / det],
		[(f * g - d * l) / det, (a * l - c * g) / det, (c * d - a * f) / det],
		[(d * k - e * g) / det, (b * g - a * k) / det, (a * e - b * d) / det]
	];
	return m.map((row) => row.map((v) => v / m[2][2]));
}
