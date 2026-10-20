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
import { loadScorer } from './lib/scorers.mjs';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { hasLabel, readLabel } from './lib/labels.mjs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { listRecordings, motionPath } from './lib/recordings.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');

/**
 * Where a recording lives, which is not always at the top of the corpus: a session dropped in as its
 * own dated folder is still one of the recordings this is measuring.
 */
/**
 * Frames a second, from the timestamps the recorder wrote rather than from the header it did not.
 *
 * Packets, not frames: nothing needs decoding to answer this, and reading them takes a twentieth of a
 * second on the largest recording here.
 */
const rates = new Map();
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
	// Trimmed before converting: an empty line becomes zero rather than nothing, and the trailing one
	// would then be the last timestamp, making every recording look like it lasted no time at all.
	const stamps = out
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.map(Number)
		.filter((n) => Number.isFinite(n));
	const last = stamps[stamps.length - 1] ?? 0;
	// Thirty where the file will not say, which is the old assumption and no worse than it was.
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

/**
 * The radius the archer's four handles stand at, which is not the same edge on every face.
 *
 * A five ring face is printed only down to the outside of the blue, so its handles are at 0.6 and it
 * has no black ring to put one on. Read at 0.8 regardless, the frame the labels are turned into is a
 * third too small, and every arrow in such a recording is compared against a place it was never said
 * to be. The archer's own tool records which face it is; this reads the same answer.
 */
const ANCHOR_RADII = { '5-ring': 0.6 };
const ANCHOR = 0.8;
const anchorsAt = (r) => [
	[r, 0],
	[0, r],
	[-r, 0],
	[0, -r]
];
/** How close a detection must be to a labelled impact to count as that arrow, in face radii. */
const MATCH = 0.05;
/** Looks the tracker needs before it will confirm an arrow, which is what an arrow in sight has to allow. */
const VISIBLE_LOOKS = 7;

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const only = option('video', null);
/** Frames a second, when the real one is to be overridden. Only for comparing against an old reading. */
const forceFps = Number(option('fps', 0));
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
/** Whether to withhold how the phone was held, for measuring what the pin is worth. */
const blind = args.includes('--no-motion');
/** Threshold overrides, so a sweep of them needs no code edit. */
const tune = JSON.parse(option('tune', '{}'));
/**
 * How much slower the device being modelled is than this machine, so dropped passes are modelled.
 *
 * One measures this laptop. A phone is several times slower, and since a pass offered while the last
 * is still running is thrown away rather than queued, the cost of a setting turns into how many looks
 * the sweep gets. Left unmodelled, every expensive setting is measured as though it were free.
 */
const slower = Number(option('slower', 1));
/**
 * Whether the proposer gets the sharper cut of the paper that the camera page gives it.
 *
 * On, and cut exactly where `regionBox` says, which is where the camera page cuts it: the face is
 * searched for on the frame reduced by `--scale` and only the proposer reads the finer picture. Off
 * with `--no-region`, which is what this used to do and which measures a detector the app does not run:
 * arrows read off the same frame the face was found on, four times blurrier than the phone's.
 */
const cutRegion = !args.includes('--no-region');
/**
 * How much the picture is reduced before detection. Four is what the app hands its worker today.
 *
 * Here as a switch because it is the one number that changes what the proposer can see at all rather
 * than what it makes of what it sees, and the still harness already shows it moving recall, precision
 * and impact error together. Measuring it end to end is the only way to learn whether the tracker
 * keeps that gain or spends it.
 */
const SCALE = Number(option('scale', 4));
/**
 * Passes to spend on the last frame after the recording has run out, holding it still.
 *
 * The labelling tool's player does this by accident: the video ends, the video element goes on handing
 * out its last frame, and the scanner goes on looking at it. The archer noticed the marks improving
 * while nothing new was being shown, which the tracker's own argument says should not happen, so it is
 * worth being able to ask for on purpose.
 */
const hold = Number(option('hold', 0));
/** Weights for the learned detector, measured through the same harness as the written one. */
// A scorer version from `src/lib/vision/scorers.ts`, or loose weights with `--model` to try before naming them.
const scorer = loadScorer(option('scorer', null));
const modelPath = option('model', null);
const model = modelPath ? JSON.parse(await readFile(resolve(modelPath), 'utf8')) : scorer.model;
Object.assign(tune, { ...scorer.settings, ...tune });
// Weights for the line and tip reader of `src/lib/vision/shafts.ts`, to try before a version names them.
const shaftsPath = option('shafts', null);
if (shaftsPath) tune.still = { ...(tune.still ?? {}), shafts: JSON.parse(await readFile(resolve(shaftsPath), 'utf8')) };
// More of them, taken in turn on the passes that read shafts, as a comma separated list.
const alsoPaths = option('shafts-also', null);
if (alsoPaths) tune.shaftsAlso = await Promise.all(alsoPaths.split(',').map(async (file) => JSON.parse(await readFile(resolve(file), 'utf8'))));
// Recordings measured at once, half the logical cores by default so each process has a core to itself.
const jobs = Math.max(1, Number(option('jobs', Math.floor(availableParallelism() / 2))));
/** Set on the processes `--jobs` starts: hand the tallies back as JSON rather than report them. */
const emit = args.includes('--emit');
/** A folder to write each recording's proposals, marks and labels into, for looking at one closely. */
const dumpTo = option('dump', null);

const { Sweep, toFaceCoords, downscale, regionBox, DETECT_EVERY_MS } = await load();

let found = 0;
let wanted = 0;
let passesTaken = 0;
let passesDropped = 0;
const costsAll = [];
let spurious = 0;
let proposedEver = 0;
const errors = [];
const rows = [];
const wrong = [];
let doubles = 0;
/** The same tally over the marks that earned their place, which is what an accepted end writes down. */
let sureFound = 0;
let sureSpurious = 0;
/** Wrong marks by how far out they sit, in tenths of the radius; the last bin is past the paper. */
const wrongAt = new Array(12).fill(0);
/** Arrows missed although a correct mark sits within the distance two marks must keep apart. */
let crowdedOut = 0;
/** Distinct places a mark was ever shown at any moment, which is what the archer actually watches. */
let everShown = 0;
let everRight = 0;
let everWrong = 0;
let everWrongOut = 0;
let everFound = 0;
/** One line per recording, for whoever wants to group them differently from the totals here. */
const recs = [];
/** The largest turn of the face between checked frames, per recording checked on more than one. */
const drifts = [];

/** The tallies by name, so a recording measured in a process of its own can hand them back whole. */
const tally = () => ({
	found, wanted, passesTaken, passesDropped, costsAll, spurious, proposedEver, errors, rows, wrong,
	doubles, sureFound, sureSpurious, wrongAt, crowdedOut, everShown, everRight, everWrong, everWrongOut,
	everFound, recs, drifts
});

if (jobs > 1) {
	for (const part of await inParallel()) {
		found += part.found;
		wanted += part.wanted;
		passesTaken += part.passesTaken;
		passesDropped += part.passesDropped;
		spurious += part.spurious;
		proposedEver += part.proposedEver;
		doubles += part.doubles;
		sureFound += part.sureFound;
		sureSpurious += part.sureSpurious;
		crowdedOut += part.crowdedOut;
		everShown += part.everShown;
		everRight += part.everRight;
		everWrong += part.everWrong;
		everWrongOut += part.everWrongOut;
		everFound += part.everFound;
		costsAll.push(...part.costsAll);
		errors.push(...part.errors);
		rows.push(...part.rows);
		wrong.push(...part.wrong);
		recs.push(...part.recs);
		drifts.push(...part.drifts);
		part.wrongAt.forEach((n, i) => (wrongAt[i] += n));
	}
}

for (const name of jobs > 1 ? [] : (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const folder = join(WORK, name);
	if (!hasLabel(folder)) continue;
	const label = readLabel(folder);
	if (label.empty || !label.arrows?.length) continue;

	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	// Tied on every frame carrying the whole set, as the export does: the arrow frame alone may have no sweep face.
	const radius = ANCHOR_RADII[label.faceType] ?? ANCHOR;
	// Each tie is matched to the marks as a set; arrow numbers are not the same shaft from frame to frame.
	const claims = [[label.arrowFrame, label.arrows]];
	for (const [sample, list] of Object.entries(label.frameArrows ?? {})) {
		const out = label.frameHidden?.[sample] ?? [];
		if (list.length + out.length >= label.arrows.length) claims.push([Number(sample), [...list, ...out].sort((a, b) => a.n - b.n)]);
	}
	// Only arrows in sight for as long as the tracker needs to confirm one are owed: see `visibleShare`.
	const share = visibleShare(label);
	const ties = [];
	for (const [sample, arrows] of claims) {
		const fit = label.frames?.[String(sample)];
		if (!fit || fit.skip) continue;
		const h = homography(fit.handles, radius);
		if (h) ties.push({ sample, frame: meta.chosen[sample], fit: h, arrows });
	}
	if (ties.length === 0) {
		rows.push(`${name.slice(-24)}  skipped: no fitted frame carries the arrows`);
		recs.push({ name, skipped: 'no fitted frame carries the arrows' });
		continue;
	}

	const { width, height } = meta;
	const at = meta.chosen[label.arrowFrame];
	const small = { width: Math.floor(width / SCALE), height: Math.floor(height / SCALE) };
	// A sweep the archer would actually make: a few seconds either side of the labelled moment.
	/*
	 * The rate the recording was actually shot at, read off the frames themselves.
	 *
	 * It used to be assumed to be thirty and it is sixty. The header is no help, claiming a thousand
	 * frames a second, but every frame carries the moment it was captured, and those are the truth: a
	 * recording of 535 frames ends at 8.926 seconds on every one of the twenty seven in the corpus.
	 *
	 * It matters twice over. The window either side of the labelled frame is counted in frames, so at
	 * half the true rate it covered half the sweep it claimed to. And the scanner is told how much time
	 * has passed so it can decide when to look again, so at half the true rate it was told two seconds
	 * had gone by when one had, and given twice the passes the phone would ever have offered it.
	 */
	const fps = forceFps || (await frameRate(await fileOf(name)));
	const span = Math.round(seconds * fps);
	const first = seconds > 0 ? Math.max(0, at - span) : 0;
	const limit = seconds > 0 ? at + span : Infinity;
	// Counted from the first frame fed in, which is what the sweep sees.
	/*
	 * How the phone was held, fed in exactly as the app feeds it.
	 *
	 * Without it this measures a detector nobody runs. Gravity is the only thing that says which way up
	 * the boss is, and a fit with nothing outside the picture to hold on to keeps whatever angle it had
	 * last; the coordinates then turn slowly under the arrows, and the tracker gathers its evidence per
	 * place on the face, so a real arrow whose coordinates are turning has its votes smeared over an arc
	 * instead of piling up on one place. Left out here, every reading of the proposer was taken through
	 * a frame drifting in a way the phone's own is not.
	 */
	const motion = blind ? null : await motionOf(await fileOf(name));
	const sweep = new Sweep(everyMs || DETECT_EVERY_MS, fps, at - first, { ...tune, scale: SCALE, slower, arrows: counted ? label.arrows.length : 0, model, motion });

	let index = 0;
	/** The last frame fed in, kept so it can be held in front of the scanner after the recording ends. */
	let lastFrame = null;
	/*
	 * Decoded at full size when a region is wanted, because the two reductions have to come from the
	 * same pixels and neither divides the other. Reduced here rather than by ffmpeg so that what the
	 * detector is handed is exactly what `downscale` makes of the camera's frame, as in the app.
	 */
	const source = cutRegion ? { width, height } : small;
	for await (const frame of decode(await fileOf(name), source.width, source.height, source)) {
		if (index < first) {
			index += 1;
			continue;
		}
		if (index > limit) break;
		const decoded = {
			width: source.width,
			height: source.height,
			data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
		};
		if (cutRegion) {
			const reduced = downscale(decoded, SCALE);
			if (hold) lastFrame = { width: reduced.width, height: reduced.height, data: new Uint8ClampedArray(reduced.data) };
			// Cut from the face the last frame left, as the camera page cuts it from the face it just followed.
			sweep.push(reduced, () => cut(decoded, sweep.located, SCALE));
		} else {
			if (hold) lastFrame = { width: decoded.width, height: decoded.height, data: new Uint8ClampedArray(decoded.data) };
			sweep.push(decoded);
		}
		index += 1;
	}

	if (hold && lastFrame) {
		for (let i = 0; i < hold; i++) {
			sweep.push({
				width: lastFrame.width,
				height: lastFrame.height,
				data: new Uint8ClampedArray(lastFrame.data)
			});
		}
	}

	const result = sweep.result();
	passesTaken += result.passes;
	passesDropped += result.dropped;
	for (const c of result.costs) costsAll.push(c);
	// The tie whose hand fit the sweep's face matches best, so locking onto the neighbour is reported as such.
	// How far the sweep's face on a tied frame is from the hand fit, in radii, or null with no face there.
	const offOf = (candidate) => {
		const face = result.track[candidate.frame - first]?.face;
		if (!face) return null;
		const centre = project(candidate.fit, 0, 0);
		const edge = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([u, v]) => project(candidate.fit, u, v));
		const r = edge.reduce((sum, p) => sum + Math.hypot(p.x - centre.x, p.y - centre.y), 0) / 4;
		return Math.hypot(face.cx - centre.x, face.cy - centre.y) / r + Math.abs((face.semiMajor + face.semiMinor) / 2 / r - 1);
	};
	let tie = null;
	for (const candidate of ties) {
		const off = offOf(candidate);
		if (off === null) continue;
		if (!tie || off < tie.off) tie = { ...candidate, face: result.track[candidate.frame - first].face, off };
	}
	const faced = result.track.filter((t) => t.face).length / Math.max(1, result.track.length);
	if (!tie) {
		rows.push(`${name.slice(-24)}  no face on any labelled frame`);
		recs.push({ name, wanted: label.arrows.length, hit: 0, everProposed: 0, spurious: result.arrows.length, sureHit: 0, sureSpurious: result.scored.length, faced, off: null, cause: 'no face' });
		wanted += label.arrows.length;
		continue;
	}
	if (tie.off > 0.3) {
		rows.push(`${name.slice(-24)}  wrong face: the sweep's face is ${tie.off.toFixed(2)} radii off the labelled one`);
		recs.push({ name, wanted: label.arrows.length, hit: 0, everProposed: 0, spurious: result.arrows.length, sureHit: 0, sureSpurious: result.scored.length, faced, off: tie.off, cause: 'wrong face' });
		wanted += label.arrows.length;
		spurious += result.arrows.length;
		sureSpurious += result.scored.length;
		continue;
	}

	/**
	 * The labels moved into the detector's own frame, by way of the picture. Both describe the same
	 * face, so a point drawn from one and read by the other is the only fair comparison there is.
	 */
	// How far a still arrow wanders in the sweep's face coordinates between labelled frames: the fit turning.
	{
		const at = (candidate) => {
			const face = result.track[candidate.frame - first]?.face;
			if (!face) return null;
			return candidate.arrows.map((arrow) => {
				const point = project(candidate.fit, arrow.x, arrow.y);
				return toFaceCoords(face, point.x, point.y);
			});
		};
		const base = at(tie);
		const turns = [];
		let moved = 0;
		for (const other of ties) {
			const here = at(other);
			// A frame where the sweep held another face or a broken fit is a fit fault, not the face turning.
			if (!here || other.sample === tie.sample || offOf(other) > 0.3) continue;
			// As sets: an arrow's number is not the same shaft on every frame, so pairing by number is wrong.
			let best = 0;
			let bestCost = Infinity;
			for (let degree = -180; degree < 180; degree += 0.5) {
				const r = (degree * Math.PI) / 180;
				const cos = Math.cos(r);
				const sin = Math.sin(r);
				let cost = 0;
				for (const p of here) cost += Math.min(...base.map((q) => Math.hypot(q.x * cos - q.y * sin - p.x, q.x * sin + q.y * cos - p.y)));
				if (cost < bestCost) {
					bestCost = cost;
					best = degree;
				}
			}
			turns.push(Math.abs(best));
			if (args.includes('--drift')) rows.push(`${name.slice(-24)}    frame ${other.sample}: turned ${best}°, arrows left ${(bestCost / here.length).toFixed(3)} radii apart, against ${(here.reduce((sum, p) => sum + Math.min(...base.map((q) => Math.hypot(q.x - p.x, q.y - p.y))), 0) / here.length).toFixed(3)} unturned`);
			for (const p of here) moved = Math.max(moved, Math.min(...base.map((q) => Math.hypot(q.x - p.x, q.y - p.y))));
		}
		if (args.includes('--drift')) rows.push(`${name.slice(-24)}  drift: ${ties.length} tied frames, turn up to ${Math.max(0, ...turns).toFixed(1)}°, arrows move up to ${moved.toFixed(3)} radii`);
		// One checked frame has nothing to drift against, so it says nothing either way.
		if (turns.length) drifts.push(Math.max(...turns));
		if (args.includes('--drift')) recs.push({ name, drift: Math.max(0, ...turns), moved });
	}

	const targets = tie.arrows.map((arrow) => {
		// Both in the video's own pixels: the sweep already put its fit back to full resolution.
		const point = project(tie.fit, arrow.x, arrow.y);
		return toFaceCoords(tie.face, point.x, point.y);
	});

	// Was it ever proposed at all, in any pass? That separates a proposer that cannot see an arrow
	// from a tracker that saw it and threw it away, and the two want completely different work.
	let everProposed = 0;
	for (const target of targets) {
		if (result.everything.some((p) => Math.hypot(p.x - target.x, p.y - target.y) < MATCH)) everProposed += 1;
	}
	proposedEver += everProposed;

	const offered = result.passes + result.dropped;
	const owed = targets.map((_, n) => share[n] * offered >= VISIBLE_LOOKS);
	const taken = new Set();
	let hit = 0;
	for (const [n, target] of targets.entries()) {
		let best = -1;
		let near = MATCH;
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
			// A mark on an arrow mostly out of sight is neither right nor wrong.
			if (!owed[n]) continue;
			hit += 1;
			errors.push(near);
		}
	}

	/**
	 * Wrong marks that sit on top of a right one: a second reading of a shaft already marked.
	 *
	 * Distance between two marks cannot say this on its own, because six arrows in a gold really are
	 * that close together. What says it is the labels: a mark that matched no arrow, sitting beside one
	 * that matched. Counted apart from the other wrong marks because the two want different work: this
	 * one is the detector reading one shaft twice, not seeing something that is not a shaft.
	 *
	 * Counted once for the recording, after every arrow has found its match. It used to sit inside the
	 * loop that does the matching, so it ran once per labelled arrow and counted the same pair of marks
	 * six times over, against a set of matches that was still being filled in.
	 */
	result.arrows.forEach((arrow, i) => {
		if (taken.has(i)) return;
		const onTopOfOne = result.arrows.some(
			(other, j) => taken.has(j) && Math.hypot(arrow.x - other.x, arrow.y - other.y) < 0.12
		);
		if (onTopOfOne) doubles += 1;
	});

	found += hit;
	wanted += owed.filter(Boolean).length;
	spurious += result.arrows.length - taken.size;

	/*
	 * Where the wrong marks are sitting, and whether a real arrow was already marked beside them.
	 *
	 * Two quite different faults wear one total. A mark out past the printed edge is scored a miss and
	 * is the detector reading the boss rim, a shadow or the grass; a mark on the paper beside an arrow
	 * that was already found is the detector reading one shaft twice. And a labelled arrow with a
	 * correct mark within the distance the tracker insists two marks keep apart was not missed by the
	 * proposer at all: it was refused a place because its neighbour had one.
	 */
	result.arrows.forEach((arrow, i) => {
		if (taken.has(i)) return;
		const out = Math.hypot(arrow.x, arrow.y);
		wrongAt[Math.min(11, Math.floor(out * 10))] += 1;
	});
	/*
	 * Every distinct place a mark was ever shown, gathered so that one mark held for thirty passes
	 * counts once. This is the overlay as somebody watching it experiences it, rather than the tally
	 * that is left when the sweep stops.
	 */
	const places = [];
	for (const mark of result.shownEver) {
		const near = places.find((p) => Math.hypot(p.x - mark.x, p.y - mark.y) < MATCH);
		if (near) { near.passes += 1; continue; }
		places.push({ x: mark.x, y: mark.y, passes: 1 });
	}
	for (const place of places) {
		const real = targets.some((t) => Math.hypot(t.x - place.x, t.y - place.y) < MATCH);
		everShown += 1;
		if (real) { everRight += 1; continue; }
		everWrong += 1;
		if (Math.hypot(place.x, place.y) >= 1) everWrongOut += 1;
	}
	for (const target of targets) {
		if (places.some((p) => Math.hypot(p.x - target.x, p.y - target.y) < MATCH)) everFound += 1;
	}

	for (const target of targets) {
		const matched = [...taken].some((i) => Math.hypot(result.arrows[i].x - target.x, result.arrows[i].y - target.y) < MATCH);
		if (matched) continue;
		const crowded = [...taken].some((i) => Math.hypot(result.arrows[i].x - target.x, result.arrows[i].y - target.y) < 0.1);
		if (crowded) crowdedOut += 1;
	}

	/*
	 * The same again, over only the marks that earned their place.
	 *
	 * Two tiers are shown and they answer different questions. What is drawn is the detector's best
	 * guess at every moment, unsure marks included, because an archer standing at the boss would rather
	 * see a guess they can drop than an empty screen. What is scored is what cleared the bar. Reporting
	 * one number for both would hide whichever of them a change actually moved.
	 */
	const sureTaken = new Set();
	let sureHit = 0;
	for (const [n, target] of targets.entries()) {
		let best = -1;
		let near = MATCH;
		result.scored.forEach((arrow, i) => {
			if (sureTaken.has(i)) return;
			const d = Math.hypot(arrow.x - target.x, arrow.y - target.y);
			if (d < near) { near = d; best = i; }
		});
		if (best >= 0) { sureTaken.add(best); if (owed[n]) sureHit += 1; }
	}
	sureFound += sureHit;
	sureSpurious += result.scored.length - sureTaken.size;

	/**
	 * What the wrong marks actually are, rather than how many. Every threshold in the proposer has been
	 * swept against the totals without anyone looking at the things being rejected, which is how a whole
	 * class of them can survive every sweep: if they sit in the same part of the shape space as real
	 * arrows, no threshold separates them and only their placing gives them away.
	 */
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
	if (dumpTo) {
		await writeFile(
			join(resolve(dumpTo), `${name}.json`),
			JSON.stringify({ targets, owed, passes: result.passes, shownEver: result.shownEver, faces: result.track.filter((t) => t.pass).map((t) => t.face), everything: result.everything, arrows: result.arrows, scored: result.scored, faced, off: tie.off, tie: tie.sample, face: tie.face })
		);
	}
	recs.push({ name, wanted: owed.filter(Boolean).length, hit, everProposed, spurious: result.arrows.length - taken.size, sureHit, sureSpurious: result.scored.length - sureTaken.size, faced, off: tie.off, tie: tie.sample, cause: null });
	rows.push(
		`${name.slice(-24)}  ${hit}/${owed.filter(Boolean).length} found, ${everProposed}/${targets.length} ever proposed, ` +
			`${result.arrows.length - taken.size} spurious`
	);
}

if (emit) {
	process.stdout.write(JSON.stringify(tally()));
	process.exit(0);
}
/** Where to write the line per recording, when one is asked for. */
const recordsTo = option('records', null);
if (recordsTo) await writeFile(resolve(recordsTo), JSON.stringify(recs, null, 1));

const sorted = errors.sort((a, b) => a - b);
const pct = (v) => `${(v * 100).toFixed(1)}%`;
console.log(rows.join('\n'));
console.log(`\nscorer              ${modelPath ? `${modelPath} (loose weights)` : scorer.name}`);
{
	const sorted = [...costsAll].sort((a, b) => a - b);
	const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
	const offered = passesTaken + passesDropped;
	console.log(
		`passes              ${passesTaken} taken, ${passesDropped} dropped ` +
			`(${((passesDropped / Math.max(offered, 1)) * 100).toFixed(0)}% of those the clock called for)`
	);
	const mean = costsAll.reduce((a, b) => a + b, 0) / Math.max(1, costsAll.length);
	const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
	console.log(`  a pass costs      ${median.toFixed(1)}ms median here, ${mean.toFixed(1)}ms mean, ${p90.toFixed(1)}ms at p90, modelled at ${slower}x for the device`);
}
console.log(`\narrows found        ${found}/${wanted} (${((found / Math.max(wanted, 1)) * 100).toFixed(0)}%)`);
console.log(`ever proposed       ${proposedEver}/${wanted} (${((proposedEver / Math.max(wanted, 1)) * 100).toFixed(0)}%)`);
console.log(`spurious arrows     ${spurious} (${(spurious / Math.max(rows.length, 1)).toFixed(1)} per recording)`);
console.log(`  of those, scored  ${sureFound}/${wanted} (${((sureFound / wanted) * 100).toFixed(0)}%) right, ${sureSpurious} wrong (${(sureSpurious / Math.max(rows.length,1)).toFixed(1)} per recording)`);
console.log(`  where they sit   ${wrongAt.map((n, i) => `${i < 11 ? `${i}` : '10+'}:${n}`).join('  ')}`);
console.log(`  past the edge     ${wrongAt.slice(10).reduce((a, b) => a + b, 0)} of ${spurious} sit at or beyond the printed face`);
console.log(`\nas the archer watches it, over the whole sweep rather than at the end of it`);
console.log(`  arrows ever marked ${everFound}/${wanted} (${((everFound / wanted) * 100).toFixed(0)}%) had a right mark on them at some point`);
console.log(`  wrong marks ever   ${everWrong} distinct places (${(everWrong / Math.max(rows.length, 1)).toFixed(1)} per recording)`);
console.log(`    past the edge    ${everWrongOut} of those were out beyond the printed face`);
console.log(`  right of all shown ${((everRight / Math.max(1, everShown)) * 100).toFixed(0)}%\n`);
{
	const sorted = [...drifts].sort((a, b) => a - b);
	const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].toFixed(1) : '--';
	console.log(`orientation drift   ${median}° median, ${sorted.filter((d) => d <= 5).length}/${sorted.length} recordings within 5°, ${sorted.filter((d) => d > 45).length} turned past 45° (checked on two frames or more)`);
}
console.log(`crowded out         ${crowdedOut} arrows had a right mark within a ring of them and got none`);
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

/** Every labelled recording measured in a child process, `jobs` at a time, merged in name order. */
async function inParallel() {
	const names = [];
	for (const name of (await readdir(WORK)).sort()) {
		if (only && !name.includes(only)) continue;
		if (hasLabel(join(WORK, name))) names.push(name);
	}
	const passed = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--jobs' || args[i] === '--video') i += 1;
		else if (args[i] !== '--emit') passed.push(args[i]);
	}
	const script = new URL(import.meta.url).pathname;
	const parts = new Array(names.length);
	let next = 0;
	const worker = async () => {
		while (next < names.length) {
			const at = next++;
			const out = await new Promise((done, fail) => {
				const child = spawn(process.execPath, [script, ...passed, '--video', names[at], '--jobs', '1', '--emit'], {
					stdio: ['ignore', 'pipe', 'pipe']
				});
				let text = '';
				let said = '';
				child.stdout.on('data', (chunk) => (text += chunk));
				// Kept for the failure only: ffmpeg complains on every recording and none of it matters.
				child.stderr.on('data', (chunk) => (said = (said + chunk).slice(-4000)));
				child.on('close', (code) =>
					code === 0 ? done(text) : fail(new Error(`${names[at]} exited ${code}\n${said}`))
				);
			});
			parts[at] = JSON.parse(out);
		}
	};
	await Promise.all(Array.from({ length: Math.min(jobs, names.length) }, worker));
	return parts;
}

/**
 * The camera page's own crop of the paper, taken from the full frame.
 *
 * Averaged over each block rather than sampled, because the page has a canvas do it and canvases
 * average; nearest neighbour aliases, and a shaft two pixels wide is the first thing aliasing destroys.
 */
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

/** Each arrow's share of the checked frames it is in sight on, the frames standing for the sweep. */
function visibleShare(label) {
	const checked = new Set([String(label.arrowFrame)]);
	for (const [sample, frame] of Object.entries(label.frames ?? {})) if (frame.arrowsOk) checked.add(sample);
	for (const sample of Object.keys(label.frameArrows ?? {})) checked.add(sample);
	return label.arrows.map((_, n) => {
		let seen = 0;
		for (const sample of checked) if (!(label.frameHidden?.[sample] ?? []).some((a) => a.n === n)) seen += 1;
		return seen / checked.size;
	});
}

async function* decode(file, width, height, scaleTo) {
	const child = spawn('ffmpeg', [
		'-v', 'error', '-i', resolve(file),
		'-vf', `scale=${scaleTo.width}:${scaleTo.height}:flags=area`,
		'-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
	], { stdio: ['ignore', 'pipe', 'inherit'] });

	const size = width * height * 4;
	// Filled in place: gluing chunks onto a growing buffer was a third of a run.
	let frame = Buffer.allocUnsafe(size);
	let filled = 0;
	try {
		for await (const chunk of child.stdout) {
			let from = 0;
			while (from < chunk.length) {
				const take = Math.min(size - filled, chunk.length - from);
				chunk.copy(frame, filled, from, from + take);
				filled += take;
				from += take;
				if (filled === size) {
					yield frame;
					frame = Buffer.allocUnsafe(size);
					filled = 0;
				}
			}
		}
	} finally {
		child.kill('SIGKILL');
	}
}
