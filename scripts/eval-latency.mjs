#!/usr/bin/env node
/**
 * How much the detector could say, and how soon, if it were willing to say it.
 *
 * The tracker waits for seven passes of agreement before it will call anything an arrow, which is
 * about a second after the boss is found, and the archer stands there watching an empty overlay. The
 * question this answers is what that second is buying: what a mark shown after one look, or two, or
 * three, would actually be worth.
 *
 * Nothing here is the tracker. It replays the recordings once, keeps every place the detector put
 * forward and the pass it put it forward in, and then tries confirmation rules over that log offline.
 * One decode, every rule, which is what makes a sweep of them affordable at all; and because they all
 * see the identical proposals, the differences between them are the rules and nothing else.
 *
 *   node scripts/eval-latency.mjs [--seconds N] [--video NAME]
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
const SCALE = 4;
const ANCHOR_RADII = { '5-ring': 0.6 };
const ANCHOR = 0.8;
const anchorsAt = (r) => [[r, 0], [0, r], [-r, 0], [0, -r]];
/** How close a mark must be to a labelled impact to count as that arrow, in face radii. */
const MATCH = 0.05;
/** Two proposals closer than this are the same place, as the tracker also has it. */
const MERGE = 0.05;

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
const seconds = Number(option('seconds', 0));

const { Sweep, toFaceCoords, DETECT_EVERY_MS } = await load();
/** Frame rates already read, since the same recording is asked about more than once. */
const rates = new Map();

const records = [];
for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	if (label.empty || !label.arrows?.length) continue;
	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const truth = homography(
		label.frames[String(label.arrowFrame)]?.handles,
		ANCHOR_RADII[label.faceType] ?? ANCHOR
	);
	if (!truth) continue;

	const { width, height } = meta;
	const at = meta.chosen[label.arrowFrame];
	const small = { width: Math.floor(width / SCALE), height: Math.floor(height / SCALE) };
	const file = await fileOf(name);
	const fps = await frameRate(file);
	const span = Math.round(seconds * fps);
	const first = seconds > 0 ? Math.max(0, at - span) : 0;
	const limit = seconds > 0 ? at + span : Infinity;
	const motion = await motionOf(file);
	const sweep = new Sweep(DETECT_EVERY_MS, fps, at - first, { arrows: label.arrows.length, motion });

	let index = 0;
	for await (const frame of decode(file, small.width, small.height, small)) {
		if (index < first) { index += 1; continue; }
		if (index > limit) break;
		sweep.push({ width: small.width, height: small.height, data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length) });
		index += 1;
	}
	const result = sweep.result();
	if (!result.at) continue;

	// The archer's arrows, put in the picture and then read in the detector's own coordinates.
	const wanted = label.arrows.map((a) => {
		const p = project(truth, a.x, a.y);
		return toFaceCoords(result.at, p.x, p.y);
	});
	records.push({ name: name.slice(-24), wanted, seen: result.everything, steadyFrom: result.steadyFrom ?? 0 });
}

/**
 * Gathers the proposals into places, exactly as the tracker gathers them, and notes when each was
 * proposed. A place is a running mean of the proposals that joined it, so a shaft answered from
 * slightly different points along itself becomes one place rather than a smear.
 */
function places(seen) {
	const found = [];
	for (const p of seen) {
		let pick = null;
		let near = MERGE;
		for (const place of found) {
			const d = Math.hypot(place.x - p.x, place.y - p.y);
			if (d < near) { near = d; pick = place; }
		}
		if (!pick) {
			found.push({ x: p.x, y: p.y, votes: [p.pass], first: p.pass });
			continue;
		}
		pick.votes.push(p.pass);
		pick.x += (p.x - pick.x) / pick.votes.length;
		pick.y += (p.y - pick.y) / pick.votes.length;
	}
	return found;
}

/**
 * The first pass at which a place cleared a rule, or null if it never does by `by`.
 *
 * Worked out rather than tested at the end, because a rule that can be met and then stop being met
 * describes something that appears and vanishes. An arrow is a hole in the paper: once there is enough
 * reason to believe it, the camera moving on to the other half of the boss is not a reason to stop.
 */
function clearedAt(place, rule, by) {
	for (let p = place.first; p <= by; p++) {
		if (meets(place, rule, p)) return p;
	}
	return null;
}

function meets(place, rule, by) {
	const votes = place.votes.filter((v) => v <= by).length;
	if (votes < rule.votes) return false;
	if (!rule.agreement) return true;
	const since = by - place.first + 1;
	return votes / Math.max(1, since) >= rule.agreement;
}

/** What a rule would be showing after `by` passes: the places that have cleared it by then. */
function shown(found, rule, by, cap) {
	return found
		.filter((place) => {
			if (rule.sticky) return clearedAt(place, rule, by) !== null;
			const votes = place.votes.filter((v) => v <= by).length;
			if (votes < rule.votes) return false;
			if (!rule.agreement) return true;
			/*
			 * Agreement over a recent window, or over everything since the place was first seen.
			 *
			 * The second is what the tracker does now and it is why its recall falls as the sweep goes
			 * on. A real arrow seen well for ten passes and then left behind as the camera moves to the
			 * other half of the boss keeps its votes and gains passes, so the ratio decays until a place
			 * that was never once wrong is thrown out. Counted over the last few passes instead, a place
			 * nobody is looking at any more is simply not asked about.
			 */
			if (rule.window) {
				const from = by - rule.window + 1;
				const lately = place.votes.filter((v) => v <= by && v >= from).length;
				const asked = Math.min(rule.window, by - place.first + 1);
				return lately / Math.max(1, asked) >= rule.agreement;
			}
			const since = by - place.first + 1;
			return votes / Math.max(1, since) >= rule.agreement;
		})
		/*
		 * Best supported first, and only as many as the end can hold.
		 *
		 * Which is what makes showing something early possible at all. Every place the detector ever put
		 * forward is a long list and most of it is rubbish, but the archer is not asking to see the list;
		 * they are asking where six arrows are. Ranked and cut to the count, a rule that believes a single
		 * look shows six marks rather than a hundred, and the wrong ones are the worst supported six
		 * rather than every bad idea the detector had.
		 */
		.sort((a, b) => b.votes.filter((v) => v <= by).length - a.votes.filter((v) => v <= by).length)
		.slice(0, cap);
}

const rules = [
	{ name: 'one look', votes: 1, agreement: 0 },
	{ name: 'two looks', votes: 2, agreement: 0 },
	{ name: 'three looks', votes: 3, agreement: 0 },
	{ name: 'four looks', votes: 4, agreement: 0 },
	{ name: 'five looks', votes: 5, agreement: 0 },
	{ name: 'seven looks', votes: 7, agreement: 0 },
	{ name: 'ten looks', votes: 10, agreement: 0 },
	{ name: 'three, agreeing, sticks', votes: 3, agreement: 0.4, sticky: true },
	{ name: 'four, agreeing, sticks', votes: 4, agreement: 0.4, sticky: true },
	{ name: 'five, agreeing, sticks', votes: 5, agreement: 0.4, sticky: true },
	{ name: 'seven, agreeing, sticks', votes: 7, agreement: 0.4, sticky: true },
	{ name: 'seven, agreeing (now)', votes: 7, agreement: 0.4 }
];

const marks = [1, 2, 3, 5, 7, 10, 14, 20, 27, 40];
console.log(`${records.length} recordings, ${records.reduce((n, r) => n + r.wanted.length, 0)} arrows`);
console.log(`passes come every ${DETECT_EVERY_MS}ms, counted from the boss being found\n`);
console.log(`  ${'rule'.padEnd(22)}${marks.map((m) => `${(m * DETECT_EVERY_MS / 1000).toFixed(1)}s`.padStart(11)).join('')}`);
for (const rule of rules) {
	const row = [];
	for (const by of marks) {
		let found = 0;
		let wrong = 0;
		let want = 0;
		for (const r of records) {
			const here = shown(places(r.seen), rule, r.steadyFrom + by, r.wanted.length);
			const taken = new Set();
			for (const w of r.wanted) {
				want += 1;
				let pick = -1;
				let near = MATCH;
				for (let k = 0; k < here.length; k++) {
					if (taken.has(k)) continue;
					const d = Math.hypot(here[k].x - w.x, here[k].y - w.y);
					if (d < near) { near = d; pick = k; }
				}
				if (pick >= 0) { taken.add(pick); found += 1; }
			}
			wrong += here.length - taken.size;
		}
		row.push(`${((found / want) * 100).toFixed(0)}% ${String(wrong).padStart(3)}w`.padStart(11));
	}
	console.log(`  ${rule.name.padEnd(22)}${row.join('')}`);
}
console.log('\n  each cell is arrows found, then wrong marks in all, at that many seconds after the boss was found');

function homography(points, radius) {
	if (!points) return null;
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
async function frameRate(file) {
	if (rates.has(file)) return rates.get(file);
	const out = await new Promise((done) => {
		const c = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file], { stdio: ['ignore', 'pipe', 'ignore'] });
		let t = ''; c.stdout.on('data', (b) => (t += b)); c.on('close', () => done(t));
	});
	const s = out.split('\n').map((l) => l.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
	const rate = s.length > 1 && s.at(-1) > 0 ? (s.length - 1) / s.at(-1) : 30;
	rates.set(file, rate);
	return rate;
}
async function motionOf(file) {
	const beside = motionPath(file);
	if (!existsSync(beside)) return null;
	return JSON.parse(await readFile(beside, 'utf8')).samples ?? null;
}
async function fileOf(name) {
	const found = await listRecordings(VIDEOS);
	return found.find((r) => r.name === name)?.path ?? join(VIDEOS, name);
}
async function load() {
	const directory = await mkdtemp(join(tmpdir(), 'appchery-vision-'));
	const outfile = join(directory, 'vision.mjs');
	await build({ entryPoints: [join(ROOT, 'src/lib/vision/sweep-entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile });
	const module = await import(outfile);
	setTimeout(() => rm(directory, { recursive: true, force: true }), 0).unref?.();
	return module;
}
async function* decode(file, width, height, scaleTo) {
	const child = spawn('ffmpeg', ['-v', 'error', '-i', resolve(file), '-vf', `scale=${scaleTo.width}:${scaleTo.height}:flags=area`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
	const size = width * height * 4;
	let held = Buffer.alloc(0);
	try {
		for await (const chunk of child.stdout) {
			held = held.length === 0 ? chunk : Buffer.concat([held, chunk]);
			while (held.length >= size) { yield held.subarray(0, size); held = held.subarray(size); }
		}
	} finally { child.kill('SIGKILL'); }
}
