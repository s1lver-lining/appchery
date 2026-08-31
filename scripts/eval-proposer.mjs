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
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
/** How much the picture is reduced before detection. Four is what the app uses. */
const SCALE = Number(process.argv.includes('--scale') ? process.argv[process.argv.indexOf('--scale') + 1] : 4);
const ANCHOR_RADII = { '5-ring': 0.6 };
const ANCHOR = 0.8;
const anchorsAt = (r) => [[r, 0], [0, r], [-r, 0], [0, -r]];
/** How close a proposal must be to a labelled impact to count as that arrow, in face radii. */
const MATCH = 0.05;

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
const tune = JSON.parse(option('tune', '{}'));
const modelPath = option('model', null);
const model = modelPath ? JSON.parse(await readFile(resolve(modelPath), 'utf8')) : null;
const verbose = args.includes('--verbose');
const cropped = args.includes('--crop');
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
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
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
	const labelled = new Map();
	const consider = (index, arrows) => {
		const fit = label.frames?.[String(index)];
		if (!fit || fit.skip || !fit.handles || !(fit.touched ?? true)) return;
		if (!arrows || arrows.length !== count) return;
		labelled.set(index, { handles: fit.handles, arrows });
	};
	consider(label.arrowFrame, label.arrows);
	for (const [index, arrows] of Object.entries(label.frameArrows ?? {})) consider(Number(index), arrows);

	for (const [index, { handles, arrows }] of [...labelled].sort((a, b) => a[0] - b[0])) {
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
		cache.push({ video: name.slice(-24), index, small, corners, arrows, kind });
	}
}

/** One setting, over every cached frame. */
const byRing = Array.from({ length: 10 }, () => [0, 0]);
/** Why each missed arrow was missed, which is the question a recall figure cannot answer. */
const reasons = new Map();
/** Real arrow pairs closer than the tracker's own apart distance, and how often one frame sees both. */
let closePairs = 0;
let bothSeen = 0;
let oneSeen = 0;
function run(options, weights) {
	let found = 0;
	let wanted = 0;
	let offered = 0;
	const errors = [];
	const perKind = new Map();
	const rows = [];
	const costs = [];
	for (const shot of cache) {
		const started = performance.now();
		const rejected = [];
		const proposals = propose(shot.small, shot.corners, 1, options, weights, rejected);
		costs.push(performance.now() - started);
		offered += proposals.length;
		const taken = new Set();
		let hit = 0;
		for (const arrow of shot.arrows) {
			let best = -1;
			let near = MATCH;
			proposals.forEach((p, i) => {
				if (taken.has(i)) return;
				// Both already in face coordinates, which is the one space the two agree in.
				const d = Math.hypot(p.x - arrow.x, p.y - arrow.y);
				if (d < near) { near = d; best = i; }
			});
			if (best >= 0) { taken.add(best); hit += 1; errors.push(near); }
			// Where on the face the ones it cannot see are sitting, which is the shape of the problem.
			byRing[Math.min(9, Math.floor(Math.hypot(arrow.x, arrow.y) * 10))][best >= 0 ? 0 : 1] += 1;
			if (best < 0) {
				// What became of it: the nearest run that was found and dropped, or nothing found at all.
				let why = 'never found';
				let near = MATCH * 2;
				for (const r of rejected) {
					const d = Math.hypot(r.x - arrow.x, r.y - arrow.y);
					if (d < near) { near = d; why = r.why; }
				}
				reasons.set(why, (reasons.get(why) ?? 0) + 1);
			}
		}
		/*
		 * Pairs of real arrows sitting closer than the tracker will ever put two marks, and whether the
		 * proposer told them apart within this one frame. If it did, then one frame is enough evidence
		 * that there are two arrows there, and the tracker's distance rule is throwing away an answer it
		 * was given rather than one it never had.
		 */
		for (let i = 0; i < shot.arrows.length; i++) {
			for (let j = i + 1; j < shot.arrows.length; j++) {
				const a = shot.arrows[i];
				const b = shot.arrows[j];
				if (Math.hypot(a.x - b.x, a.y - b.y) >= 0.1) continue;
				closePairs += 1;
				const hitA = proposals.some((p) => Math.hypot(p.x - a.x, p.y - a.y) < MATCH);
				const hitB = proposals.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < MATCH);
				if (hitA && hitB) bothSeen += 1;
				else if (hitA || hitB) oneSeen += 1;
			}
		}

		found += hit;
		wanted += shot.arrows.length;
		const k = perKind.get(shot.kind) ?? { found: 0, wanted: 0, offered: 0, frames: 0 };
		k.found += hit;
		k.wanted += shot.arrows.length;
		k.offered += proposals.length;
		k.frames += 1;
		perKind.set(shot.kind, k);
		rows.push(`  ${shot.video} frame ${String(shot.index).padStart(2)}  ${hit}/${shot.arrows.length} found, ${proposals.length} offered`);
	}
	return { found, wanted, offered, errors, perKind, rows, costs };
}

/*
 * A sweep of settings, all over the same frames, so the differences between them are the settings.
 * Each entry is a name and the options to merge over the defaults.
 */
const sweep = JSON.parse(option('sweep', 'null'));
if (sweep) {
	console.log(`${cache.length} labelled frames, ${cache.reduce((n, s) => n + s.arrows.length, 0)} arrows\n`);
	console.log(`  ${'setting'.padEnd(28)}  found        proposals  right`);
	for (const [label, options] of Object.entries(sweep)) {
		const r = run({ ...tune, ...options }, model);
		console.log(
			`  ${label.padEnd(28)}  ${String(r.found).padStart(3)}/${r.wanted} (${pct(r.found, r.wanted).padStart(3)})` +
			`  ${String(r.offered).padStart(5)}      ${pct(r.found, r.offered).padStart(4)}`
		);
	}
	process.exit(0);
}

const { found, wanted, offered, errors, perKind, rows, costs } = run(tune, model);
if (verbose) for (const row of rows) console.log(row);

console.log(`\nproposer on single labelled frames, given the archer's own fit`);
console.log(`  detector          ${model ? 'learned' : 'classical'}`);
console.log(`  frames            ${[...perKind.values()].reduce((n, k) => n + k.frames, 0)}`);
console.log(`  arrows found      ${found}/${wanted} (${pct(found, wanted)})`);
console.log(`  proposals         ${offered} in all, ${(offered / Math.max(1, wanted / 6)).toFixed(1)} per frame of six arrows`);
console.log(`  of those, right   ${pct(found, offered)}`);
const sorted = errors.sort((a, b) => a - b);
const q = (s) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * s))] ?? 0;
console.log(`  impact error      ${(q(0.5) * 100).toFixed(1)}% median, ${(q(0.9) * 100).toFixed(1)}% at p90, of face radius`);
const timed = [...costs].sort((a, b) => a - b);
const t = (share) => timed[Math.min(timed.length - 1, Math.floor(timed.length * share))] ?? 0;
console.log(`  cost a frame      ${t(0.5).toFixed(1)}ms median, ${t(0.9).toFixed(1)}ms at p90, on this machine`);
const area = cache.reduce((n, s) => n + s.small.width * s.small.height, 0) / cache.length;
console.log(`  pixels looked at  ${(area / 1000).toFixed(0)}k a frame${cropped ? ', cropped to the face' : ''}`);
/*
 * Missed arrows by where they sit on the paper, in tenths of the radius from the middle out.
 *
 * The rings are printed in pairs of colours, and two of those pairs are dark. A shaft is found by
 * being darker than the paper around it, so where the paper is already black there is nothing to be
 * darker than. If that is what is happening, the misses will not be spread evenly: they will pile up
 * at the radii where the black is.
 */
console.log('\n  by ring, middle outwards (each tenth of the radius):');
console.log(`    ring     ${byRing.map((_, i) => String(i + 1).padStart(5)).join('')}`);
console.log(`    found    ${byRing.map((b) => String(b[0]).padStart(5)).join('')}`);
console.log(`    missed   ${byRing.map((b) => String(b[1]).padStart(5)).join('')}`);
console.log(`    seen     ${byRing.map((b) => (b[0] + b[1] > 0 ? `${Math.round((b[0] / (b[0] + b[1])) * 100)}%` : '-').padStart(5)).join('')}`);

console.log(`\n  real arrows closer than a ring apart: ${closePairs} pairs over these frames`);
console.log(`    both told apart in that one frame  ${bothSeen} (${pct(bothSeen, closePairs)})`);
console.log(`    only one of the two seen           ${oneSeen} (${pct(oneSeen, closePairs)})`);
console.log(`    neither seen                       ${closePairs - bothSeen - oneSeen}`);

console.log('\n  why the missed ones were missed:');
for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
	console.log(`    ${why.padEnd(24)} ${String(n).padStart(4)}  ${pct(n, wanted - found)}`);
}

console.log('\n  by face:');
for (const [kind, k] of [...perKind].sort()) {
	console.log(`    ${kind.padEnd(8)} ${String(k.frames).padStart(3)} frames  ${k.found}/${k.wanted} (${pct(k.found, k.wanted)})  ${(k.offered / k.frames).toFixed(1)} proposals a frame`);
}

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
