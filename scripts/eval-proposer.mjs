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
const SCALE = 4;
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
		const small = downscale({ width: meta.width, height: meta.height, data: pixels }, SCALE);
		// The fit as four anchors at the radius the detector's own frame uses, in the reduced picture.
		const corners = anchorsAt(ANCHOR).map(([u, v]) => {
			const p = project(hand, (u / ANCHOR) * radius, (v / ANCHOR) * radius);
			return [p.x / SCALE, p.y / SCALE];
		});
		cache.push({ video: name.slice(-24), index, small, corners, arrows, kind });
	}
}

/** One setting, over every cached frame. */
function run(options, weights) {
	let found = 0;
	let wanted = 0;
	let offered = 0;
	const errors = [];
	const perKind = new Map();
	const rows = [];
	for (const shot of cache) {
		const proposals = propose(shot.small, shot.corners, 1, options, weights);
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
	return { found, wanted, offered, errors, perKind, rows };
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

const { found, wanted, offered, errors, perKind, rows } = run(tune, model);
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
console.log('\n  by face:');
for (const [kind, k] of [...perKind].sort()) {
	console.log(`    ${kind.padEnd(8)} ${String(k.frames).padStart(3)} frames  ${k.found}/${k.wanted} (${pct(k.found, k.wanted)})  ${(k.offered / k.frames).toFixed(1)} proposals a frame`);
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
