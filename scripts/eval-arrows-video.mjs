#!/usr/bin/env node
/**
 * Measures the arrow detector on recorded scoring sessions, the way the app actually meets them.
 *
 * The still harness asks what a detector makes of one photograph. This asks the question the archer
 * asks: they walked up to the boss, swept the camera over it for a few seconds, and there were six
 * arrows in the paper. How many came back, how many things came back that were not arrows, and would
 * the score have been right.
 *
 *   node scripts/eval-arrows-video.mjs [--seconds 3] [--video <name>]
 *
 * Ground truth is the impacts placed by hand in scripts/label-arrows.mjs.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');
const SCALE = 4;
const ANCHOR = 0.8;
const ANCHORS = [
	[ANCHOR, 0],
	[0, ANCHOR],
	[-ANCHOR, 0],
	[0, -ANCHOR]
];
/** How close a detection must be to a labelled impact to count as that arrow, in face radii. */
const MATCH = 0.05;

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
/** Seconds of the recording to use, since an archer will not sweep for a minute. */
const seconds = Number(option('seconds', 0));
/**
 * Milliseconds between detection passes, which is how many looks a sweep gets.
 *
 * Zero means the app's own rate, taken from its module rather than written here: a harness offering
 * passes at a different rate from the phone measures a detector nobody has.
 */
const everyMs = Number(option('every', 0));
/**
 * Whether to tell the tracker how many arrows the end holds, as the app does when the round says so.
 *
 * On by default because that is the common case, but the other case is the one that shows what the
 * proposer is really doing: with no number to work to, nothing is capped, and every place that clears
 * the bar is offered. Measuring only the capped case hid a rise in false positives behind the cap.
 */
const counted = !args.includes('--uncounted');
/** Threshold overrides, so a sweep of them needs no code edit. */
const tune = JSON.parse(option('tune', '{}'));
/** Weights for the learned detector, measured through the same harness as the written one. */
const modelPath = option('model', null);
const model = modelPath ? JSON.parse(await readFile(resolve(modelPath), 'utf8')) : null;

const { Sweep, toFaceCoords, DETECT_EVERY_MS } = await load();

let found = 0;
let wanted = 0;
let spurious = 0;
let proposedEver = 0;
const errors = [];
const rows = [];
const wrong = [];
let doubles = 0;

for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	if (label.empty || !label.arrows?.length) continue;

	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const truth = homography(label.frames[String(label.arrowFrame)].handles);
	if (!truth) continue;

	const { width, height } = meta;
	const at = meta.chosen[label.arrowFrame];
	const small = { width: Math.floor(width / SCALE), height: Math.floor(height / SCALE) };
	// A sweep the archer would actually make: a few seconds either side of the labelled moment.
	const span = Math.round(seconds * 30);
	const first = seconds > 0 ? Math.max(0, at - span) : 0;
	const limit = seconds > 0 ? at + span : Infinity;
	// Counted from the first frame fed in, which is what the sweep sees.
	const sweep = new Sweep(everyMs || DETECT_EVERY_MS, 30, at - first, { ...tune, arrows: counted ? label.arrows.length : 0, model });

	let index = 0;
	for await (const frame of decode(join(VIDEOS, name), small.width, small.height, small)) {
		if (index < first) {
			index += 1;
			continue;
		}
		if (index > limit) break;
		sweep.push({
			width: small.width,
			height: small.height,
			data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
		});
		index += 1;
	}

	const result = sweep.result();
	if (!result.at) {
		rows.push(`${name.slice(-24)}  no face on the labelled frame`);
		wanted += label.arrows.length;
		continue;
	}

	/**
	 * The labels moved into the detector's own frame, by way of the picture. Both describe the same
	 * face, so a point drawn from one and read by the other is the only fair comparison there is.
	 */
	const targets = label.arrows.map((arrow) => {
		// Both in the video's own pixels: the sweep already put its fit back to full resolution.
		const point = project(truth, arrow.x, arrow.y);
		return toFaceCoords(result.at, point.x, point.y);
	});

	// Was it ever proposed at all, in any pass? That separates a proposer that cannot see an arrow
	// from a tracker that saw it and threw it away, and the two want completely different work.
	let everProposed = 0;
	for (const target of targets) {
		if (result.everything.some((p) => Math.hypot(p.x - target.x, p.y - target.y) < MATCH)) everProposed += 1;
	}
	proposedEver += everProposed;

	const taken = new Set();
	let hit = 0;
	for (const target of targets) {
		let best = -1;
		let near = MATCH;
		/**
	 * Wrong marks that sit on top of a right one: a second reading of a shaft already marked.
	 *
	 * Distance between two marks cannot say this on its own, because six arrows in a gold really are
	 * that close together. What says it is the labels: a mark that matched no arrow, sitting beside one
	 * that matched. Counted apart from the other wrong marks because the two want different work — this
	 * one is the detector reading one shaft twice, not seeing something that is not a shaft.
	 */
	result.arrows.forEach((arrow, i) => {
		if (taken.has(i)) return;
		const onTopOfOne = result.arrows.some(
			(other, j) => taken.has(j) && Math.hypot(arrow.x - other.x, arrow.y - other.y) < 0.12
		);
		if (onTopOfOne) doubles += 1;
	});

	result.arrows.forEach((arrow, i) => {
			if (taken.has(i)) return;
			const d = Math.hypot(arrow.x - target.x, arrow.y - target.y);
			if (d < near) {
				near = d;
				best = i;
			}
		});
		if (best >= 0) {
			taken.add(best);
			hit += 1;
			errors.push(near);
		}
	}

	found += hit;
	wanted += targets.length;
	spurious += result.arrows.length - taken.size;

	/**
	 * What the wrong marks actually are, rather than how many. Every threshold in the proposer has been
	 * swept against the totals without anyone looking at the things being rejected, which is how a whole
	 * class of them can survive every sweep: if they sit in the same part of the shape space as real
	 * arrows, no threshold separates them and only their placing gives them away.
	 */
	/**
	 * Wrong marks that sit on top of a right one: a second reading of a shaft already marked.
	 *
	 * Distance between two marks cannot say this on its own, because six arrows in a gold really are
	 * that close together. What says it is the labels: a mark that matched no arrow, sitting beside one
	 * that matched. Counted apart from the other wrong marks because the two want different work — this
	 * one is the detector reading one shaft twice, not seeing something that is not a shaft.
	 */
	result.arrows.forEach((arrow, i) => {
		if (taken.has(i)) return;
		const onTopOfOne = result.arrows.some(
			(other, j) => taken.has(j) && Math.hypot(arrow.x - other.x, arrow.y - other.y) < 0.12
		);
		if (onTopOfOne) doubles += 1;
	});

	result.arrows.forEach((arrow, i) => {
		wrong.push({
			video: name.slice(-24),
			right: taken.has(i),
			radius: Math.hypot(arrow.x, arrow.y),
			area: arrow.area,
			votes: arrow.votes ?? arrow.seen ?? 0,
			unsure: Boolean(arrow.unsure)
		});
	});
	rows.push(
		`${name.slice(-24)}  ${hit}/${targets.length} found, ${everProposed}/${targets.length} ever proposed, ` +
			`${result.arrows.length - taken.size} spurious`
	);
}

const sorted = errors.sort((a, b) => a - b);
const pct = (v) => `${(v * 100).toFixed(1)}%`;
console.log(rows.join('\n'));
console.log(`\ndetector            ${model ? 'learned' : 'classical'}`);
console.log(`\narrows found        ${found}/${wanted} (${((found / Math.max(wanted, 1)) * 100).toFixed(0)}%)`);
console.log(`ever proposed       ${proposedEver}/${wanted} (${((proposedEver / Math.max(wanted, 1)) * 100).toFixed(0)}%)`);
console.log(`spurious arrows     ${spurious} (${(spurious / Math.max(rows.length, 1)).toFixed(1)} per recording)`);
console.log(`double marks        ${doubles} (${(doubles / Math.max(rows.length, 1)).toFixed(1)} per recording)`);
console.log(
	`impact error        ${sorted.length ? pct(sorted[Math.floor(sorted.length / 2)]) : '--'} median, ` +
		`${sorted.length ? pct(sorted[Math.floor((sorted.length - 1) * 0.9)]) : '--'} at p90, of face radius`
);

if (args.includes('--why')) {
	const bucket = (list, label, of) => {
		const values = list.map(of).sort((a, b) => a - b);
		if (values.length === 0) return `${label} --`;
		const at = (share) => values[Math.floor((values.length - 1) * share)];
		return `${label} p10 ${at(0.1).toFixed(2)}  median ${at(0.5).toFixed(2)}  p90 ${at(0.9).toFixed(2)}`;
	};
	const right = wrong.filter((w) => w.right);
	const bad = wrong.filter((w) => !w.right);
	console.log(`\nwhat the marks look like        ${right.length} right, ${bad.length} wrong`);
	for (const [label, list] of [['right ', right], ['wrong ', bad]]) {
		console.log(`  ${bucket(list, `${label}radius`, (w) => w.radius)}`);
		console.log(`  ${bucket(list, `${label}votes `, (w) => w.votes)}`);
		console.log(`  ${bucket(list, `${label}area  `, (w) => w.area)}`);
		console.log(`  ${label}guessed  ${list.filter((w) => w.unsure).length}`);
	}
	// Where round the face they sit, which is what would show a rim or a shadow rather than a shaft.
	const ring = (list) => {
		const bins = new Array(10).fill(0);
		for (const w of list) bins[Math.min(9, Math.floor(w.radius * 10))] += 1;
		return bins.join(' ');
	};
	console.log(`\n  by ring, centre outwards (10 bins)`);
	console.log(`    right  ${ring(right)}`);
	console.log(`    wrong  ${ring(bad)}`);
}

function homography(points) {
	const rows = [];
const wrong = [];
let doubles = 0;
	for (let i = 0; i < 4; i++) {
		const [u, v] = ANCHORS[i];
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

async function* decode(file, width, height, scaleTo) {
	const child = spawn('ffmpeg', [
		'-v', 'error', '-i', resolve(file),
		'-vf', `scale=${scaleTo.width}:${scaleTo.height}:flags=area`,
		'-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
	], { stdio: ['ignore', 'pipe', 'inherit'] });

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
