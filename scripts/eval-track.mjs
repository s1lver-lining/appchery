#!/usr/bin/env node
/**
 * Measures the face the archer actually sees: the followed one, on every frame of a sweep.
 *
 * scripts/eval-faces.mjs asks a different and easier question. It shows the still detector one frame
 * at a time, with no history, and asks how well it fits that frame; the answer is well under a tenth
 * of a ring. But nothing in the app works that way. The face on the screen is found once and then
 * carried, frame after frame, by following it from where it was, and a follower can be right on every
 * frame it is checked against and still swim between them, turn slowly round the middle, or walk off
 * the boss altogether when the camera is swung.
 *
 * Those are the three faults worth separating, so they are measured separately:
 *
 *   accuracy   how far the followed ring is from the archer's own handles, at the frames they fitted
 *   turn       how much the frame rotates about the middle over one sweep, which is free to the
 *              picture and not free to an arrow: an arrow read through a frame that has turned five
 *              degrees is an arrow five degrees round the boss from where it was shot
 *   swim       how much the middle and the size move from one frame to the next beyond a smooth
 *              path, which needs no ground truth at all and is what reads on screen as flicker
 *
 *   node scripts/eval-track.mjs [--video NAME] [--seconds N] [--tune '{...}']
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

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
const seconds = Number(option('seconds', 0));
const tune = JSON.parse(option('tune', '{}'));
const verbose = args.includes('--verbose');
/** Whether to feed in how the phone was held, which is what the app does when a session has it. */
const blind = args.includes('--no-motion');
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const { Sweep, DETECT_EVERY_MS } = await load();
/** Frame rates already read, since the same recording is asked about more than once. */
const rates = new Map();

const accuracy = [];
const turns = [];
const swims = [];
const jumps = [];
/** How far an arrow moves in the detector's own frame between two moments it was labelled at. */
const drifts = [];
/** The same measure taken on the labels alone, which is as well as any detector could possibly do. */
const floors = [];
/** How many floor readings were already in before this recording, so its own can be told apart. */
let floorMark = 0;
/** Arrow pairs the labels themselves disagree about, which say nothing either way about the detector. */
let setAside = 0;
/** The turn between the detector's two frames, for telling a flip apart from a drift. */
const spins = [];
const rows = [];
let heldFrames = 0;
let allFrames = 0;
let withMotion = 0;
let without = 0;

for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const anchor = ANCHOR_RADII[label.faceType] ?? ANCHOR;

	// The archer's own fits, indexed by the frame of the recording they were placed on.
	const truth = new Map();
	for (const [index, entry] of Object.entries(label.frames ?? {})) {
		if (entry.skip || !entry.handles || !(entry.touched ?? true)) continue;
		const h = homography(entry.handles, anchor);
		if (h) truth.set(meta.chosen[Number(index)], { h, handles: entry.handles });
	}
	if (truth.size === 0) continue;

	const { width, height } = meta;
	const small = { width: Math.floor(width / SCALE), height: Math.floor(height / SCALE) };
	const file = await fileOf(name);
	const fps = await frameRate(file);
	const anywhere = [...truth.keys()];
	const first = seconds > 0 ? Math.max(0, Math.min(...anywhere) - Math.round(seconds * fps)) : 0;
	const limit = seconds > 0 ? Math.max(...anywhere) + Math.round(seconds * fps) : Infinity;

	const motion = blind ? null : await motionOf(file);
	const sweep = new Sweep(DETECT_EVERY_MS, fps, 0, { ...tune, arrows: label.arrows?.length ?? 0, motion });
	let index = 0;
	for await (const frame of decode(file, small.width, small.height, small)) {
		if (index < first) { index += 1; continue; }
		if (index > limit) break;
		sweep.push({
			width: small.width,
			height: small.height,
			data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
		});
		index += 1;
	}

	const track = sweep.result().track;
	// The track is counted from the first frame fed in; the labels are counted from the recording.
	const seen = new Map(track.map((t) => [t.frame + first, t.face]));

	/* Accuracy, and the turn, only where the archer said what the answer was. */
	const mine = [];
	for (const [at, { h, handles }] of truth) {
		const face = seen.get(at);
		if (!face) continue;
		let sum = 0;
		for (const [hx, hy] of handles) {
			const q = toFace(face, hx, hy);
			sum += Math.abs(Math.hypot(q.x, q.y) - anchor);
		}
		accuracy.push(sum / handles.length);
		mine.push({ at, angle: turnBetween(h, face, anchor), off: sum / handles.length });
	}

	/*
	 * How much the frame turned over the sweep, which is the fault an arrow cannot survive.
	 *
	 * Taken against the archer's own fit at each frame rather than between detector frames, so a real
	 * rotation of the camera does not read as drift. What is left is the detector changing its mind
	 * about which way round a face that is the same way round in every one of them.
	 */
	if (mine.length >= 2) {
		const angles = mine.map((m) => m.angle);
		const spread = Math.max(...angles) - Math.min(...angles);
		turns.push({ spread, video: name.slice(-24), angles, gravity: Boolean(motion) });
	}

	/*
	 * What an arrow does between two moments, which is the whole point of holding the frame still.
	 *
	 * The archer labelled the same six arrows on several frames of a sweep, each time in that frame's
	 * own coordinates, so the same physical shaft is pinned twice over and its image position at each
	 * moment is known. Read both through the detector's fit at those moments and a detector whose frame
	 * is nailed to the paper gives the same answer twice. Whatever it does not give is the error, in the
	 * units the archer cares about: how far round the boss an arrow found early has crept by later.
	 *
	 * This is the one rotational measure the labels can actually support. A hand fit says nothing about
	 * which way round the face is, because nothing in the picture does: the four handles slide freely
	 * round the ring they are on and describe the identical boss, so comparing the detector's angle to
	 * the archer's measures how the archer happened to drop the handles. Two frames' worth of the same
	 * arrows do carry it, because an arrow is a real mark on the paper and is not free to move.
	 */
	const carried = [];
	const marks = label.frameArrows ?? {};
	const framesWithArrows = Object.keys(marks)
		.map(Number)
		.filter((f) => truth.has(meta.chosen[f]) && marks[f].length > 0)
		.sort((a, b) => a - b);
	if (label.arrowFrame !== undefined && truth.has(meta.chosen[label.arrowFrame])) {
		framesWithArrows.unshift(label.arrowFrame);
	}
	const placed = framesWithArrows.map((f) => ({
		at: meta.chosen[f],
		hand: truth.get(meta.chosen[f]).h,
		arrows: f === label.arrowFrame && !marks[f]
			? label.arrows.map((a, n) => ({ n, x: a.x, y: a.y }))
			: marks[f]
	}));
	for (let i = 0; i < placed.length; i++) {
		for (let j = i + 1; j < placed.length; j++) {
			const [one, two] = [placed[i], placed[j]];
			const [da, db] = [seen.get(one.at), seen.get(two.at)];
			if (!da || !db) continue;
			const here = [];
			for (const a of one.arrows) {
				const b = two.arrows.find((x) => x.n === a.n);
				if (!b) continue;
				// The same shaft, put back in the picture at each moment, then read by the detector.
				const pa = project(one.hand, a.x, a.y);
				const pb = project(two.hand, b.x, b.y);
				here.push({ a, b, moved: Math.hypot(toFace(db, pb.x, pb.y).x - toFace(da, pa.x, pa.y).x, toFace(db, pb.x, pb.y).y - toFace(da, pa.x, pa.y).y) });
			}
			/*
			 * What the same measurement says about the labels themselves, which is the floor under it.
			 *
			 * The archer's two frames differ by a turn and nothing else, since both describe the same
			 * boss, so taking the turn out should leave the six arrows sitting exactly on top of each
			 * other. Whatever is left is the archer's own hand: a shaft clicked a few pixels differently,
			 * or a fit dropped slightly differently. A detector error is only worth reporting down to
			 * here, and reading this floor is the difference between measuring the detector and
			 * measuring the labelling.
			 */
			if (here.length < 2) continue;
			let cross = 0;
			let dot = 0;
			for (const { a, b } of here) {
				cross += a.x * b.y - a.y * b.x;
				dot += a.x * b.x + a.y * b.y;
			}
			const turn = Math.atan2(cross, dot);
			const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
			const mine = here.map(({ a, b }) =>
				Math.hypot(a.x * cos - a.y * sin - b.x, a.x * sin + a.y * cos - b.y)
			);

			/*
			 * A pair the labels cannot support is not evidence about the detector.
			 *
			 * Two labellings of one set of arrows that do not lie on top of each other once the turn is
			 * taken out are saying two different things about where the arrows are, and no reading of the
			 * detector against them means anything. It happens: an arrow numbered differently on the two
			 * frames, or one clicked on a shaft the wrong side of a crease. Set aside and counted, rather
			 * than averaged in, because averaging them in reads as detector error and cannot be told from
			 * it afterwards.
			 */
			if (median(mine) > 0.05) {
				setAside += here.length;
				continue;
			}
			for (const m of mine) floors.push(m);
			for (const h of here) carried.push(h.moved);

			/*
			 * How much of the move is a turn, and how big a turn it is.
			 *
			 * A drift and a flip look alike in a distance and are not alike at all. Four points a quarter
			 * apart describe the same face four ways, so a fit that changes its mind about which of them
			 * is the first moves every arrow a quarter turn at once, which for an arrow halfway out is
			 * over half the face radius. Reported as an angle, the two are unmistakable.
			 */
			let dcross = 0;
			let ddot = 0;
			for (const { a, b } of here) {
				const u = toFace(da, project(one.hand, a.x, a.y).x, project(one.hand, a.x, a.y).y);
				const v = toFace(db, project(two.hand, b.x, b.y).x, project(two.hand, b.x, b.y).y);
				dcross += u.x * v.y - u.y * v.x;
				ddot += u.x * v.x + u.y * v.y;
			}
			spins.push({ deg: (Math.atan2(dcross, ddot) * 180) / Math.PI, video: name.slice(-24) });
		}
	}
	for (const c of carried) drifts.push(c);
	const floorHere = floors.slice(floorMark);
	floorMark = floors.length;

	/*
	 * Swim, from the track alone: how far the middle moves against a straight line through its
	 * neighbours. A camera being panned gives a smooth path and scores nothing; a face that steps
	 * about while the camera is still is exactly what this picks up.
	 */
	const path = track.filter((t) => t.face);
	for (let i = 1; i < path.length - 1; i++) {
		if (path[i - 1].frame + 1 !== path[i].frame || path[i].frame + 1 !== path[i + 1].frame) continue;
		const [a, b, c] = [path[i - 1].face, path[i].face, path[i + 1].face];
		const size = b.semiMajor || 1;
		swims.push(Math.hypot(b.cx - (a.cx + c.cx) / 2, b.cy - (a.cy + c.cy) / 2) / size);
	}

	/* A jump: the middle moving more than a fifth of the face in one frame, which no hand can do. */
	let lost = 0;
	for (let i = 1; i < path.length; i++) {
		if (path[i - 1].frame + 1 !== path[i].frame) continue;
		const [a, b] = [path[i - 1].face, path[i].face];
		if (Math.hypot(b.cx - a.cx, b.cy - a.cy) > 0.2 * (b.semiMajor || 1)) lost += 1;
	}
	jumps.push({ lost, video: name.slice(-24) });
	heldFrames += path.length;
	allFrames += track.length;

	const spread = turns.find((t) => t.video === name.slice(-24))?.spread;
	if (motion) withMotion += 1; else without += 1;
	rows.push(
		`${name.slice(-24)}  ${String(mine.length).padStart(2)} checked  ` +
		`ring ${pct(median(mine.map((m) => m.off)))}  ` +
		`turn ${spread === undefined ? '   -' : `${spread.toFixed(1)}°`}  ` +
		`held ${((path.length / Math.max(1, track.length)) * 100).toFixed(0)}%  ` +
		`carry ${carried.length ? pct(median(carried)).padStart(5) : '    -'}  ` +
		`floor ${floorHere.length ? pct(median(floorHere)).padStart(5) : '    -'}  ` +
		`jumps ${lost}` +
		`${motion ? '  gravity' : ''}`
	);
	if (verbose && mine.length) {
		for (const m of mine) console.log(`      frame ${String(m.at).padStart(4)}  ${pct(m.off)}  ${m.angle.toFixed(1)}°`);
	}
}

for (const row of rows) console.log(row);

console.log(`\nfollowed face, against the archer's own handles`);
console.log(`  recordings        ${withMotion} with gravity, ${without} without`);
console.log(`  checked on        ${accuracy.length} hand fitted frames`);
console.log(`  ring error        ${pct(median(accuracy))} median, ${pct(quantile(accuracy, 0.9))} at p90`);
console.log(`                    a ring is 10% of the radius, so ${(median(accuracy) * 10).toFixed(2)} rings median`);
/*
 * Split, because they are two different detectors. A recording with gravity beside it has its frame
 * pinned to something outside the picture; one without has only the frame before it to hold on to, and
 * nothing done to the pin can move it either way. Read together, fifteen recordings that cannot
 * respond drown out nine that can, and every change to the pin reads as no change at all.
 */
const spreads = turns.map((t) => t.spread);
const pinned = turns.filter((t) => t.gravity).map((t) => t.spread);
const adrift = turns.filter((t) => !t.gravity).map((t) => t.spread);
console.log(`  turn over a sweep ${median(spreads).toFixed(1)}° median, ${quantile(spreads, 0.9).toFixed(1)}° at p90`);
console.log(`    with gravity    ${median(pinned).toFixed(1)}° median, ${quantile(pinned, 0.9).toFixed(1)}° at p90  (${pinned.length})`);
console.log(`    without         ${median(adrift).toFixed(1)}° median, ${quantile(adrift, 0.9).toFixed(1)}° at p90  (${adrift.length})`);
console.log(`  arrow carried     ${pct(median(drifts))} of the face radius median, ${pct(quantile(drifts, 0.9))} at p90  (${drifts.length} pairs)`);
console.log(`                    a ring is 10% of the radius, so ${(median(drifts) * 10).toFixed(2)} rings median`);
console.log(`  set aside         ${setAside} arrow pairs whose two labellings disagree by more than 5%`);
console.log(`  label floor       ${pct(median(floors))} median, ${pct(quantile(floors, 0.9))} at p90  (the archer's own two answers, turn removed)`);
console.log(`  face held         ${((heldFrames / Math.max(1, allFrames)) * 100).toFixed(0)}% of frames`);
console.log(`  swim              ${pct(median(swims))} of the face radius per frame, ${pct(quantile(swims, 0.9))} at p90`);
console.log(`  jumps             ${jumps.reduce((n, j) => n + j.lost, 0)} in all`);

/*
 * Grouped by size, because the shape of this list is the diagnosis. A detector that drifts gives a
 * spread of small angles; one that flips gives a heap at a quarter turn and nothing in between.
 */
const bands = [[0, 5], [5, 15], [15, 40], [40, 70], [70, 110], [110, 180]];
console.log('\nturn between the detector\'s two frames, over the pairs the labels support:');
for (const [low, high] of bands) {
	const n = spins.filter((s) => Math.abs(s.deg) >= low && Math.abs(s.deg) < high).length;
	if (n > 0) console.log(`  ${String(low).padStart(3)} to ${String(high).padStart(3)}°  ${String(n).padStart(3)}  ${'#'.repeat(Math.min(60, n))}`);
}
for (const name of [...new Set(spins.map((s) => s.video))]) {
	const mine = spins.filter((s) => s.video === name).map((s) => Math.round(s.deg));
	console.log(`  ${name}  ${mine.join(' ')}`);
}

const worstTurn = [...turns].sort((a, b) => b.spread - a.spread).slice(0, 5);
console.log('\nworst turn:');
for (const t of worstTurn) console.log(`  ${t.video}  ${t.spread.toFixed(1)}°`);

function median(list) { return quantile(list, 0.5); }
function quantile(list, share) {
	if (list.length === 0) return 0;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

/**
 * How far round the middle the detector's frame sits from the archer's, in degrees.
 *
 * Both describe the same boss, and a boss is a set of circles, so which way round either frame is
 * cannot be read off the picture and the two will not agree. What can be read is whether the
 * disagreement stays put. Taken modulo a quarter turn, because four handles a quarter turn apart
 * describe the same face four ways over and a swap between them is not a drift.
 */
function turnBetween(hand, face, radius) {
	const back = invert(hand);
	if (!back) return 0;
	let sum = 0;
	let count = 0;
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		const p = toImage(face, Math.cos(a) * radius, Math.sin(a) * radius);
		const q = project(back, p.x, p.y);
		let d = (Math.atan2(q.y, q.x) - a) * (180 / Math.PI);
		// Into the quarter turn the symmetry leaves free, and centred so a wrap is not a jump.
		d = ((d % 90) + 135) % 90 - 45;
		sum += d;
		count += 1;
	}
	return sum / count;
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
	return { x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w, y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w };
}

function invert(h) {
	const [[a, b, c], [d, e, f], [g, i, j]] = h;
	const A = e * j - f * i, B = f * g - d * j, C = d * i - e * g;
	const det = a * A + b * B + c * C;
	if (Math.abs(det) < 1e-12) return null;
	return [
		[A / det, (c * i - b * j) / det, (b * f - c * e) / det],
		[B / det, (a * j - c * g) / det, (c * d - a * f) / det],
		[C / det, (b * g - a * i) / det, (a * e - b * d) / det]
	];
}

function toFace(face, x, y) {
	const h = face.inverse;
	const w = h[6] * x + h[7] * y + h[8];
	return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

function toImage(face, x, y) {
	const h = face.transform;
	const w = h[6] * x + h[7] * y + h[8];
	return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

async function frameRate(file) {
	if (rates.has(file)) return rates.get(file);
	const out = await new Promise((done) => {
		const child = spawn('ffprobe', [
			'-v', 'error', '-select_streams', 'v:0',
			'-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file
		], { stdio: ['ignore', 'pipe', 'ignore'] });
		let text = '';
		child.stdout.on('data', (chunk) => (text += chunk));
		child.on('close', () => done(text));
	});
	const stamps = out.split('\n').map((l) => l.trim()).filter((l) => l !== '').map(Number).filter(Number.isFinite);
	const last = stamps[stamps.length - 1] ?? 0;
	const rate = stamps.length > 1 && last > 0 ? (stamps.length - 1) / last : 30;
	rates.set(file, rate);
	return rate;
}

/** The motion saved beside a recording, for the sessions that were recorded with any. */
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
	], { stdio: ['ignore', 'pipe', 'ignore'] });
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
