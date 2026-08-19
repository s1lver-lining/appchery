#!/usr/bin/env node
/**
 * Asks whether a shaft standing in the paper can be recognised by the way it leans.
 *
 * This is the one thing an arrow does that a crease, a fold, a printed line or a rim shadow cannot: it
 * comes out of the paper towards the archer. Everything else the detector measures — dark, thin,
 * straight, unbroken, lighter on both sides — a fold in the face has too, which is why every test built
 * on appearance has stalled at about two wrong marks an end.
 *
 * The geometry says it should be checkable with no lens calibration and no motion sensor. A point at
 * height h above the face images at `H(x, y, 1) + h·v`, where H is the face fit and v is where the
 * plane's normal vanishes. Read back through the fit into face coordinates, the nock of a standing
 * shaft therefore lies on the line from its own impact towards a single point — where the camera is
 * standing, written in the face's own coordinates — and that point is shared by every arrow in the
 * frame. Arrows near a boss do not lean in parallel; their lines meet.
 *
 * Whether that holds well enough to be worth using is a question about real arrows, and it cannot be
 * answered with the tails the detector reports, because those are the ends of dark runs rather than
 * nocks and scatter far more than the geometry does. So it is answered here against nocks placed by
 * hand:
 *
 *   node scripts/label-arrows.mjs serve      # press N, click the nock of each arrow
 *   node scripts/eval-nocks.mjs
 *
 * A small residual means the model holds and the work belongs in finding the real nock. A large one
 * means the model is wrong and this whole line should be dropped.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
const ANCHOR = 0.8;
const ANCHORS = [
	[ANCHOR, 0],
	[0, ANCHOR],
	[-ANCHOR, 0],
	[0, -ANCHOR]
];

const only = process.argv.includes('--video') ? process.argv[process.argv.indexOf('--video') + 1] : null;
/**
 * Writes back the matching of nocks to arrows that the geometry says was meant, where it is not in
 * doubt.
 *
 * Worth doing because re-clicking seventy nocks to fix a bookkeeping error is a poor use of an evening,
 * and worth being careful about because the geometry is the thing under test: a frame repaired this way
 * cannot then be evidence that the geometry works. So repaired frames are marked as such and counted
 * separately, the evidence stays with the ones clicked by hand, and nothing is touched unless the best
 * matching beats every other by a wide margin — which is a fact about the numbers, not about the model.
 */
const repairing = process.argv.includes('--repair');

const residuals = [];
const rows = [];
let frames = 0;
let skipped = 0;
let automatic = 0;
let byHand = 0;
let fromRepair = 0;
const repaired = [];

for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const file = join(WORK, name, 'labels.json');
	if (!existsSync(file)) continue;
	const label = JSON.parse(await readFile(file, 'utf8'));
	if (!label.arrows?.length || !label.nocks) continue;
	const metaFile = join(WORK, name, 'frames.json');
	const meta = existsSync(metaFile) ? JSON.parse(await readFile(metaFile, 'utf8')) : null;
	let changed = false;

	const mended = { ...(label.mended ?? {}) };
	for (const [index, placed] of Object.entries(label.nocks)) {
		// Three lines is the fewest that can disagree about where they meet; two always agree exactly.
		if (!placed || placed.length < 3) continue;
		// A hand fit if there is one, otherwise the detector's own, which is what the tool started from.
		const fit = label.frames?.[index] ?? { handles: seedHandles(meta?.seeds?.[index]), touched: false };
		if (!fit?.handles || fit.skip) {
			skipped += 1;
			continue;
		}
		/**
		 * Counted, because a nock read back through a fit that is itself wrong lands in the wrong place,
		 * and the residual then measures the fit rather than the arrow. The seeds in the workspace were
		 * made by whichever version of the face detector was current when `prepare` last ran, which is not
		 * this one. A frame whose fit was never touched by hand is evidence about the wrong thing.
		 */
		if (!fit.touched) automatic += 1;
		if (label.mended?.[index]) fromRepair += placed.length;
		else byHand += placed.length;
		const h = homography(fit.handles);
		const back = h && invert(h);
		if (!back) {
			skipped += 1;
			continue;
		}

		/**
		 * Each labelled nock read back into face coordinates, paired with its impact. The impact is
		 * already in face coordinates and does not move; the nock is in this frame's pixels and does.
		 */
		const lines = [];
		for (const nock of placed) {
			const arrow = label.arrows[nock.arrow];
			if (!arrow) continue;
			const q = project(back, nock.x, nock.y);
			const dx = q.x - arrow.x;
			const dy = q.y - arrow.y;
			const span = Math.hypot(dx, dy);
			if (span < 1e-6) continue;
			lines.push({ ax: arrow.x, ay: arrow.y, ux: dx / span, uy: dy / span });
		}
		if (lines.length < 3) continue;

		const meeting = meet(lines);
		if (!meeting) continue;
		frames += 1;
		for (const line of lines) residuals.push(away(line, meeting.x, meeting.y));

		/**
		 * The same frame again, under every way of matching the nocks to the impacts.
		 *
		 * Told apart from a wrong model, a wrong pairing looks identical: both give lines that meet
		 * nowhere. The difference is that a wrong pairing has a right one hiding behind it, and there are
		 * only a few hundred to try. If some other matching brings the residual down to a few degrees then
		 * the geometry is sound and the labels were simply written down against the wrong arrows.
		 */
		if (placed.length <= 7) {
			const best = bestPairing(placed, label.arrows, back);
			if (best !== null) {
				repaired.push(best.worst);
				/**
				 * Only when one matching is far and away the best. Two arrows standing close together can
				 * be swapped for almost nothing, and a guess there would be worse than leaving it alone.
				 */
				if (repairing && best.margin > 3 * Math.max(best.worst, 0.02) && best.worst < 0.2) {
					placed.forEach((nock, i) => (nock.arrow = best.order[i]));
					label.nocks[index] = placed;
					mended[index] = true;
					changed = true;
				}
			}
		}
		rows.push(
			`${name.slice(-24)} frame ${String(index).padStart(3)}  ${lines.length} nocks  ` +
				`meets at ${meeting.x.toFixed(2)}, ${meeting.y.toFixed(2)}  ` +
				`worst ${(Math.max(...lines.map((l) => away(l, meeting.x, meeting.y))) * 57.3).toFixed(1)}°`
		);
	}
	if (changed) {
		await writeFile(`${file}.before-repair`, JSON.stringify(label, null, 1));
		await writeFile(file, JSON.stringify({ ...label, mended }, null, 1));
		console.log(`repaired ${Object.keys(mended).length} frames of ${name.slice(-24)}`);
	}
}

if (residuals.length === 0) {
	console.log('No nocks labelled yet. Run: node scripts/label-arrows.mjs serve, then press N.');
	console.log('Three nocks on a frame is the fewest that says anything; five or six frames a recording.');
	process.exit(0);
}

residuals.sort((a, b) => a - b);
const at = (share) => residuals[Math.floor((residuals.length - 1) * share)] * 57.3;
console.log(rows.join('\n'));
console.log(`\nframes measured     ${frames}${skipped > 0 ? ` (${skipped} skipped for want of a hand fit)` : ''}`);
if (automatic > 0) {
	console.log(`  of those, ${automatic} used an automatic fit rather than one placed by hand.`);
	console.log('  Those inflate the number below: fit them by hand, or read this as an upper bound.');
}
console.log(`nocks               ${residuals.length}  (${byHand} as clicked, ${fromRepair} repaired)`);
console.log(`lean off the meeting point   ${at(0.5).toFixed(1)}° median, ${at(0.9).toFixed(1)}° at p90`);
if (repaired.length > 0) {
	repaired.sort((a, b) => a - b);
	const best = (share) => repaired[Math.floor((repaired.length - 1) * share)] * 57.3;
	console.log(
		`under the best matching of nocks to arrows   ${best(0.5).toFixed(1)}° median, ${best(0.9).toFixed(1)}° at p90`
	);
	console.log('  (worst nock on each frame. A large gap between the two lines above means the labels');
	console.log('   were written against the wrong arrows, not that the geometry is wrong.)');
}

console.log(
	'\nUnder about 10° the model holds and the work belongs in finding the real nock.' +
		'\nOver about 25° the arrows do not agree on a meeting point and the idea should be dropped.'
);

/** Handles from a stored automatic fit, which the tool describes as a projection of the face. */
function seedHandles(seed) {
	if (!seed?.handles) return null;
	return seed.handles;
}

/** The best matching of nocks to impacts, how good it is, and how far clear of the next best. */
function bestPairing(placed, arrows, back) {
	const points = placed.map((nock) => project(back, nock.x, nock.y));
	const usable = arrows.map((arrow, i) => i).filter((i) => arrows[i]);
	if (points.length > usable.length) return null;

	let best = null;
	let second = null;
	let order0 = null;
	for (const order of permutations(usable, points.length)) {
		const lines = [];
		for (let i = 0; i < points.length; i++) {
			const arrow = arrows[order[i]];
			const dx = points[i].x - arrow.x;
			const dy = points[i].y - arrow.y;
			const span = Math.hypot(dx, dy);
			if (span < 1e-6) continue;
			lines.push({ ax: arrow.x, ay: arrow.y, ux: dx / span, uy: dy / span });
		}
		if (lines.length < 3) continue;
		const meeting = meet(lines);
		if (!meeting) continue;
		const worst = Math.max(...lines.map((line) => away(line, meeting.x, meeting.y)));
		if (best === null || worst < best) {
			second = best;
			best = worst;
			order0 = order;
		} else if (second === null || worst < second) {
			second = worst;
		}
	}
	if (best === null) return null;
	return { worst: best, margin: (second ?? Infinity) - best, order: order0 };
}

/** Every way of choosing `take` of the arrows in order, which for six arrows is a few hundred. */
function* permutations(pool, take) {
	if (take === 0) {
		yield [];
		return;
	}
	for (let i = 0; i < pool.length; i++) {
		const rest = [...pool.slice(0, i), ...pool.slice(i + 1)];
		for (const tail of permutations(rest, take - 1)) yield [pool[i], ...tail];
	}
}

/** How far a mark's lean is from pointing at the meeting place, as an angle, either way along it. */
function away(line, ex, ey) {
	const tx = ex - line.ax;
	const ty = ey - line.ay;
	const reach = Math.hypot(tx, ty);
	if (reach < 1e-6) return 0;
	return Math.acos(Math.min(1, Math.abs((line.ux * tx + line.uy * ty) / reach)));
}

/** The point the lines come nearest to passing through, in the least squares sense. */
function meet(lines) {
	let a = 0;
	let b = 0;
	let c = 0;
	let px = 0;
	let py = 0;
	for (const line of lines) {
		// The direction across the line, which is what the meeting place must not be off along.
		const nx = -line.uy;
		const ny = line.ux;
		const d = nx * line.ax + ny * line.ay;
		a += nx * nx;
		b += nx * ny;
		c += ny * ny;
		px += nx * d;
		py += ny * d;
	}
	const determinant = a * c - b * b;
	// Every line pointing the same way, so they meet nowhere in particular.
	if (Math.abs(determinant) < 1e-9) return null;
	return { x: (c * px - b * py) / determinant, y: (a * py - b * px) / determinant };
}

function homography(points) {
	const rows = [];
	for (let i = 0; i < 4; i++) {
		const [u, v] = ANCHORS[i];
		const [x, y] = points[i];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}
	const solved = solve(rows);
	return solved && [...solved, 1];
}

function project(h, x, y) {
	const w = h[6] * x + h[7] * y + h[8];
	return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

function invert(h) {
	const [a, b, c, d, e, f, g, i, j] = h;
	const A = e * j - f * i;
	const B = f * g - d * j;
	const C = d * i - e * g;
	const det = a * A + b * B + c * C;
	if (Math.abs(det) < 1e-12) return null;
	return [
		A / det, (c * i - b * j) / det, (b * f - c * e) / det,
		B / det, (a * j - c * g) / det, (c * d - a * f) / det,
		C / det, (b * g - a * i) / det, (a * e - b * d) / det
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
			for (let k = col; k <= n; k++) rows[r][k] -= factor * rows[col][k];
		}
	}
	// After the elimination each row holds only its own pivot, so the answer is the pair on the diagonal.
	return rows.map((row, i) => row[n] / row[i]);
}
