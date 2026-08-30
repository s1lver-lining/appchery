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
/** Which pairs those were, so the archer can go and look at the frames that disagree. */
const aside = [];
/** The turn between the detector's two frames, for telling a flip apart from a drift. */
const spins = [];
/** The first fit of each sweep, which is the one every later frame is carried from. */
const acquisitions = [];
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

			const paired = pairUp(one.arrows, two.arrows);
			if (!paired) {
				setAside += Math.min(one.arrows.length, two.arrows.length);
				aside.push({ video: name.slice(-24), one: one.at, two: two.at, why: 'no clean pairing' });
				continue;
			}
			if (paired.floor > 0.05) {
				setAside += paired.pairs.length;
				aside.push({ video: name.slice(-24), one: one.at, two: two.at, off: paired.floor, why: 'labels disagree' });
				continue;
			}
			for (const m of paired.misses) floors.push(m);

			let dcross = 0;
			let ddot = 0;
			for (const { a, b } of paired.pairs) {
				// The same shaft, put back in the picture at each moment, then read by the detector.
				const pa = project(one.hand, a.x, a.y);
				const pb = project(two.hand, b.x, b.y);
				const u = toFace(da, pa.x, pa.y);
				const v = toFace(db, pb.x, pb.y);
				carried.push(Math.hypot(v.x - u.x, v.y - u.y));
				dcross += u.x * v.y - u.y * v.x;
				ddot += u.x * v.x + u.y * v.y;
			}

			/*
			 * How much of the move is a turn, and how big a turn it is.
			 *
			 * A drift and a flip look alike in a distance and are not alike at all. Four points a quarter
			 * apart describe the same face four ways, so a fit that changes its mind about which of them
			 * is the first moves every arrow a quarter turn at once, which for an arrow halfway out is
			 * over half the face radius. Reported as an angle, the two are unmistakable.
			 */
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

	/*
	 * The first fit of the sweep, and how good it was.
	 *
	 * Acquisition is the moment everything else is built on. A face taken on while the camera is still
	 * being swung is fitted to a smear, and the one measured here came out half again too big and a
	 * third of the picture above the boss; the follow then carries that, and the archer watches the
	 * rings sit above the target until something knocks it loose. Kept separately from the rest because
	 * a fault that happens once per sweep vanishes into an average over every frame of it.
	 */
	const firstFace = path[0];
	if (firstFace) {
		const near = [...truth.entries()].sort(
			(a, b) => Math.abs(a[0] - (firstFace.frame + first)) - Math.abs(b[0] - (firstFace.frame + first))
		)[0];
		const mark = project(near[1].h, 0, 0);
		const size = Math.hypot(project(near[1].h, anchor, 0).x - mark.x, project(near[1].h, anchor, 0).y - mark.y);
		/*
		 * How much the fit had to correct itself once it had been taken on, which needs no truth at all.
		 *
		 * A face acquired soundly is refined by pixels over the frames that follow; one acquired on a
		 * smear is wrong, and the follow spends the next few frames walking it back to the boss. Since a
		 * hand fit within a few frames of the acquisition exists in only a handful of recordings, and
		 * comparing against one taken a second later reads a walked camera as a bad fit, this asks the
		 * question the recording can answer on its own: how far did it move, and how much did it
		 * resize, over the twentieth of a sweep right after it was first believed.
		 */
		const settle = path.filter((s) => s.frame <= firstFace.frame + 20);
		const last = settle[settle.length - 1];
		acquisitions.push({
			video: name.slice(-24),
			at: firstFace.frame + first,
			support: firstFace.face.support,
			off: Math.hypot(mark.x - firstFace.face.cx, mark.y - firstFace.face.cy) / size,
			gap: Math.abs(near[0] - (firstFace.frame + first)),
			walked: Math.hypot(last.face.cx - firstFace.face.cx, last.face.cy - firstFace.face.cy) / firstFace.face.semiMajor,
			resized: Math.abs(last.face.semiMajor - firstFace.face.semiMajor) / firstFace.face.semiMajor
		});
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
	if (args.includes('--path')) {
		// Where the fit sat, every tenth frame, beside the archer's own answer where there is one.
		const hand = new Map([...truth].map(([at, t]) => [at, project(t.h, 0, 0)]));
		for (const step of track) {
			const at = step.frame + first;
			const mark = hand.get(at);
			if (!step.face) { if (at % 10 === 0 || mark) console.log(`  ${String(at).padStart(4)}  no face${mark ? '   HAND ' + mark.x.toFixed(0) + ',' + mark.y.toFixed(0) : ''}`); continue; }
			if (at % 10 !== 0 && !mark) continue;
			console.log(
				`  ${String(at).padStart(4)}  at ${step.face.cx.toFixed(0).padStart(4)},${step.face.cy.toFixed(0).padStart(4)}` +
				`  r ${step.face.semiMajor.toFixed(0).padStart(3)}  support ${step.face.support.toFixed(2)}` +
				(mark ? `   HAND ${mark.x.toFixed(0)},${mark.y.toFixed(0)}  off ${Math.hypot(mark.x - step.face.cx, mark.y - step.face.cy).toFixed(0)}px` : '')
			);
		}
	}
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
const byVideo = new Map();
for (const a of aside) byVideo.set(a.video, (byVideo.get(a.video) ?? 0) + 1);
if (byVideo.size > 0) {
	console.log('\nlabelled frames whose arrows disagree with another frame of the same recording:');
	for (const [video, n] of [...byVideo].sort((a, b) => b[1] - a[1])) {
		const worst = aside.filter((a) => a.video === video).sort((a, b) => (b.off ?? 9) - (a.off ?? 9))[0];
		console.log(`  ${video}  ${String(n).padStart(3)} pairs, worst frames ${worst.one} and ${worst.two}: ${worst.why}${worst.off ? ` by ${pct(worst.off)}` : ''}`);
	}
}
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

/*
 * Only where a hand fit sits near enough in time to say where the boss really was. Compared against
 * one taken seconds later, a camera that has since been walked forward would read as a bad fit.
 */
const judged = acquisitions.filter((a) => a.gap <= Number(option('gap', 10)));
console.log(`\nfirst fit of each sweep (${judged.length} with a hand fit within ${option('gap', 10)} frames):`);
for (const a of [...judged].sort((x, y) => y.off - x.off)) {
	console.log(
		`  ${a.video}  frame ${String(a.at).padStart(4)}  support ${a.support.toFixed(2)}  ` +
		`middle ${pct(a.off).padStart(6)} of a radius out${a.off > 0.2 ? '   MISPLACED' : ''}`
	);
}

console.log(`\nhow far the first fit had to be walked back over the twenty frames after it:`);
for (const a of [...acquisitions].sort((x, y) => y.resized - x.resized)) {
	console.log(
		`  ${a.video}  support ${a.support.toFixed(2)}  moved ${pct(a.walked).padStart(6)}  ` +
		`resized ${pct(a.resized).padStart(6)}${a.resized > 0.15 || a.walked > 0.3 ? '   UNSETTLED' : ''}`
	);
}

const worstTurn = [...turns].sort((a, b) => b.spread - a.spread).slice(0, 5);
console.log('\nworst turn:');
for (const t of worstTurn) console.log(`  ${t.video}  ${t.spread.toFixed(1)}°`);

/**
 * Works out which mark on one frame is which mark on another, and how far apart the two answers are.
 *
 * The labels are spots, not shafts with names. Nothing in the tool says that the third arrow clicked
 * on one frame is the third clicked on another, and nothing should: an archer clicks whichever shaft
 * they can see clearly. Reading the numbers as a correspondence, which this used to do, compares one
 * arrow against a different one and calls the distance detector error.
 *
 * The correspondence is recoverable because the geometry is nearly rigid. Two hand fits of one boss
 * describe the same circles and so differ by a turn about the middle and nothing else, and a scatter
 * of six arrows is not symmetric, so there is exactly one turn that drops them onto each other. Swept
 * over the whole circle, the right one stands out; at the wrong ones an arrow near the gold might
 * land on a neighbour but the ones out at the edge cannot.
 *
 * Returns nothing where the winning turn does not give a clean one to one pairing, which is the
 * honest answer for two frames that disagree about how many arrows are on the boss.
 */
function pairUp(one, two) {
	if (one.length < 2 || two.length < 2) return null;
	const [few, many] = one.length <= two.length ? [one, two] : [two, one];
	const flipped = one.length > two.length;

	let bestTurn = 0;
	let bestCost = Infinity;
	const cost = (turn) => {
		const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
		let total = 0;
		for (const a of few) {
			const x = a.x * cos - a.y * sin;
			const y = a.x * sin + a.y * cos;
			let near = Infinity;
			for (const b of many) near = Math.min(near, Math.hypot(x - b.x, y - b.y));
			total += near;
		}
		return total / few.length;
	};
	// Half a degree over the whole circle, then bisected: the minimum is sharp and there is no start.
	for (let k = 0; k < 720; k++) {
		const turn = (k / 720) * Math.PI * 2;
		const value = cost(turn);
		if (value < bestCost) {
			bestCost = value;
			bestTurn = turn;
		}
	}
	for (let step = (Math.PI * 2) / 720; step > 1e-5; step /= 3) {
		for (const way of [step, -step]) {
			let improved = true;
			while (improved) {
				improved = false;
				const value = cost(bestTurn + way);
				if (value < bestCost - 1e-12) {
					bestTurn += way;
					bestCost = value;
					improved = true;
				}
			}
		}
	}

	// One to one, or nothing: two marks claiming the same partner is not a correspondence.
	const [cos, sin] = [Math.cos(bestTurn), Math.sin(bestTurn)];
	const taken = new Set();
	const pairs = [];
	const misses = [];
	for (const a of few) {
		const x = a.x * cos - a.y * sin;
		const y = a.x * sin + a.y * cos;
		let pick = -1;
		let near = Infinity;
		for (let k = 0; k < many.length; k++) {
			const d = Math.hypot(x - many[k].x, y - many[k].y);
			if (d < near) { near = d; pick = k; }
		}
		if (pick < 0 || taken.has(pick)) return null;
		taken.add(pick);
		misses.push(near);
		pairs.push(flipped ? { a: many[pick], b: a } : { a, b: many[pick] });
	}
	return { pairs, misses, floor: median(misses), turn: bestTurn };
}

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
