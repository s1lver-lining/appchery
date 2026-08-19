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
import { readFile, readdir } from 'node:fs/promises';
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

const residuals = [];
const rows = [];
let frames = 0;
let skipped = 0;

for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	const file = join(WORK, name, 'labels.json');
	if (!existsSync(file)) continue;
	const label = JSON.parse(await readFile(file, 'utf8'));
	if (!label.arrows?.length || !label.nocks) continue;

	for (const [index, placed] of Object.entries(label.nocks)) {
		// Three lines is the fewest that can disagree about where they meet; two always agree exactly.
		if (!placed || placed.length < 3) continue;
		const fit = label.frames?.[index];
		if (!fit?.handles || fit.skip) {
			skipped += 1;
			continue;
		}
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
		rows.push(
			`${name.slice(-24)} frame ${String(index).padStart(3)}  ${lines.length} nocks  ` +
				`meets at ${meeting.x.toFixed(2)}, ${meeting.y.toFixed(2)}  ` +
				`worst ${(Math.max(...lines.map((l) => away(l, meeting.x, meeting.y))) * 57.3).toFixed(1)}°`
		);
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
console.log(`nocks               ${residuals.length}`);
console.log(`lean off the meeting point   ${at(0.5).toFixed(1)}° median, ${at(0.9).toFixed(1)}° at p90`);
console.log(
	'\nUnder about 10° the model holds and the work belongs in finding the real nock.' +
		'\nOver about 25° the arrows do not agree on a meeting point and the idea should be dropped.'
);

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
	return rows.map((row, i) => row[n] / row[i][i]);
}
