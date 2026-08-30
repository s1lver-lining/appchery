import { rgbToHsv, components } from './pixels';
import { refineFace } from './refine';
import type { Frame, FaceLocation } from './types';

/**
 * Finds the target face by its gold and then checks the rings around it. No training data is needed
 * because a target face is a specified object with published geometry, not something to be learned.
 *
 * Ten equal width rings means the gold, which is rings 9 and 10, reaches 2/10 of the face radius.
 * That fixed ratio is what turns a gold blob into the whole face, and it matches the zone map in
 * `domain/rounds/seed.ts`, where the 9 ring sits at r = 0.2.
 */
const GOLD_SHARE_OF_FACE = 0.2;

/**
 * Radii to probe, in face units, with the colour each must show. A yellow bag or a hazard sign
 * passes the gold test on its own; nothing but a target face has this sequence around it.
 */
const RED_RING = 0.25;
const MID_RING = 0.45;
const OUTER_RING = 0.65;
const GOLD_RING = 0.15;

export interface FaceDetectOptions {
	/** Hue window for the gold, in degrees. Wide enough to survive warm and cold daylight. */
	hueRange?: [number, number];
	minSaturation?: number;
	minValue?: number;
	/** Reject a blob too small to be a face, as a share of the frame. */
	minAreaShare?: number;
	/** Faces to return at most, so a noisy frame cannot cost a whole video frame's budget. */
	limit?: number;
	/** Fit to the surrounding rings after the gold blob. On by default; off is for measuring it. */
	refine?: boolean;
}

/**
 * Every face in the frame, best supported first. A three spot puts three golds in one image, and
 * taking only the largest quietly ignores two thirds of the target.
 */
export function detectFaces(frame: Frame, options: FaceDetectOptions = {}): FaceLocation[] {
	const [hueLow, hueHigh] = options.hueRange ?? [38, 70];
	const minSaturation = options.minSaturation ?? 0.45;
	const minValue = options.minValue ?? 90;
	const minAreaShare = options.minAreaShare ?? 0.0015;
	/**
	 * Generous, because candidates are ranked by blob size and a real gold is often not the biggest
	 * yellow thing in frame. Raising this from 4 to 12 took recall on the annotated set from 87% to
	 * 93%: three spot golds were being crowded out by larger yellow blobs elsewhere in the picture.
	 * The ring check is what rejects the extras, and it costs about 128 pixel reads per candidate.
	 */
	const limit = options.limit ?? 12;

	const { width, height, data } = frame;
	const mask = new Uint8Array(width * height);

	for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
		const { h, s, v } = rgbToHsv(data[p], data[p + 1], data[p + 2]);
		if (h >= hueLow && h <= hueHigh && s >= minSaturation && v >= minValue) mask[i] = 1;
	}

	const minSize = Math.max(24, minAreaShare * width * height);
	const found: FaceLocation[] = [];

	for (const blob of components(mask, width, height, minSize)) {
		const seed = fromMoments(blob.pixels, width, blob.size, GOLD_SHARE_OF_FACE);
		// The blob only has to get close: the rings around it are what settle the geometry.
		if (seed) found.push(options.refine === false ? seed : refineFace(frame, seed));
		if (found.length >= limit) break;
	}
	return found;
}

/** The single best face, which is what a caller aiming at one target wants. */
export function detectFace(frame: Frame, options: FaceDetectOptions = {}): FaceLocation | null {
	return detectFaces(frame, options)[0] ?? null;
}

/**
 * Second moments turn a blob into the ellipse that best matches it. For a filled ellipse the
 * covariance eigenvalues are (semi axis squared) / 4, which recovers the axes and the tilt in closed
 * form, with no iteration.
 */
function fromMoments(
	pixels: number[],
	width: number,
	size: number,
	share: number
): FaceLocation | null {
	const { cx, cy } = centroid(pixels, width, size);

	let xx = 0;
	let yy = 0;
	let xy = 0;
	for (const i of pixels) {
		const x = i % width;
		const y = (i - x) / width;
		const dx = x - cx;
		const dy = y - cy;
		xx += dx * dx;
		yy += dy * dy;
		xy += dx * dy;
	}
	xx /= size;
	yy /= size;
	xy /= size;

	// Eigenvalues of a symmetric 2x2, written out rather than looped: it is two lines and exact.
	const mean = (xx + yy) / 2;
	const diff = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
	const major = mean + diff;
	const minor = mean - diff;
	if (minor <= 0) return null;

	let goldMajor = 2 * Math.sqrt(major);
	let goldMinor = 2 * Math.sqrt(minor);
	/**
	 * A circle has no orientation, and the moment fit picks an arbitrary one for it: with xx and yy
	 * equal, atan2 lands on 45 degrees and twists the whole coordinate frame. A face seen square on
	 * is exactly that case, so a near circular fit is treated as the circle it is.
	 */
	let rotation = 0.5 * Math.atan2(2 * xy, xx - yy);
	if ((goldMajor - goldMinor) / goldMajor < 0.03) {
		const size = (goldMajor + goldMinor) / 2;
		goldMajor = size;
		goldMinor = size;
		rotation = 0;
	}

	// A blob far from elliptical is something else that happens to be yellow, so it is not a face.
	const expected = Math.PI * goldMajor * goldMinor;
	const support = expected > 0 ? Math.min(1, size / expected) : 0;
	if (support < 0.6) return null;

	// Only ever a place for the fit to start: the gold says where and roughly how big, nothing more.
	return faceFromEllipse(cx, cy, goldMajor / share, goldMinor / share, rotation, support);
}

function centroid(pixels: number[], width: number, size: number): { cx: number; cy: number } {
	let sumX = 0;
	let sumY = 0;
	for (const i of pixels) {
		const x = i % width;
		sumX += x;
		sumY += (i - x) / width;
	}
	return { cx: sumX / size, cy: sumY / size };
}

/**
 * Image pixels to normalised face coordinates, undoing the tilt the camera introduces. This is an
 * affine rectification, not a full homography: it handles a camera off to one side, but not one
 * close to a steeply angled boss, where near and far rings differ in scale.
 */
/** Where the four anchors sit on the face: the ends of two diameters of the black to white ring. */
export const ANCHOR_RADIUS = 0.8;
const ANCHOR_POINTS: [number, number][] = [
	[ANCHOR_RADIUS, 0],
	[0, ANCHOR_RADIUS],
	[-ANCHOR_RADIUS, 0],
	[0, -ANCHOR_RADIUS]
];

/**
 * Builds a face from four points on it, solving the eight numbers a projection takes.
 *
 * Solved once here rather than per sample, because the fit reads several hundred pixels through this
 * for every candidate it tries and re-solving inside that loop would cost more than everything else
 * the detector does put together.
 */
export function faceFromAnchors(anchors: [number, number][], support = 0): FaceLocation | null {
	const rows: number[][] = [];
	for (let i = 0; i < 4; i++) {
		const [u, v] = ANCHOR_POINTS[i];
		const [x, y] = anchors[i];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}
	const solved = solveEight(rows);
	if (!solved) return null;

	const transform = [...solved, 1];
	const inverse = invert3(transform);
	if (!inverse) return null;

	const centre = apply(transform, 0, 0);
	const shape = ellipseOf(transform, centre);
	return {
		anchors: anchors.map((p) => [p[0], p[1]] as [number, number]),
		transform,
		inverse,
		cx: centre.x,
		cy: centre.y,
		...shape,
		support
	};
}

/**
 * The same face measured against a frame `factor` times larger. Rebuilt from the anchors rather than
 * multiplied field by field: the transform is the face, and scaling the numbers read off it while
 * leaving it alone leaves the two describing different things.
 */
export function scaleFace(face: FaceLocation, factor: number): FaceLocation {
	if (factor === 1) return face;
	return (
		faceFromAnchors(
			face.anchors.map(([x, y]) => [x * factor, y * factor] as [number, number]),
			face.support
		) ?? face
	);
}

/** The same face with one anchor moved, which is the only move the fit ever makes. */
export function moveAnchor(
	face: FaceLocation,
	index: number,
	dx: number,
	dy: number
): FaceLocation | null {
	const anchors = face.anchors.map((p) => [p[0], p[1]] as [number, number]);
	anchors[index] = [anchors[index][0] + dx, anchors[index][1] + dy];
	return faceFromAnchors(anchors, face.support);
}

/** A circle on the image, as four anchors. What the gold blob gives before any fitting happens. */
export function faceFromEllipse(
	cx: number,
	cy: number,
	semiMajor: number,
	semiMinor: number,
	rotation: number,
	support = 0
): FaceLocation | null {
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const anchors = ANCHOR_POINTS.map(([u, v]) => {
		const px = u * semiMajor;
		const py = v * semiMinor;
		return [cx + px * cos - py * sin, cy + px * sin + py * cos] as [number, number];
	});
	return faceFromAnchors(anchors, support);
}

function apply(h: number[], x: number, y: number): { x: number; y: number } {
	const w = h[6] * x + h[7] * y + h[8];
	return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

/**
 * The ellipse the face resembles near its centre, from how the projection stretches the plane there.
 * Only ever a summary: the parts of the pipeline that ask for a radius are drawing or sizing a search
 * window, and none of them is scoring an arrow off it directly.
 *
 * The lengths are the singular values and are right. The angle is not the one a reader expects: the
 * two arc tangents below want halving and adding to give the ellipse's tilt, and subtracting them
 * whole answers near zero for most faces however the ellipse really lies. It is left alone
 * deliberately, because the crop the learned arrow detector is shown is cut with it and the crops it
 * was trained on were cut the same way (scripts/prepare-arrows.mjs). The two have to agree far more
 * than either has to be right, so this changes when the model is retrained and not before.
 *
 * It reaches an arrow's score through that crop, and what keeps it harmless is that cropToImage and
 * cropToFace use the one value in both directions, so it cancels. Correcting it would move the crop
 * and cost the model its training; using two different values for it would move the arrows, which is
 * what once put every one of them a quarter turn out. vision.test.ts pins the angle, crop.test.ts
 * pins the pair.
 */
function ellipseOf(h: number[], centre: { x: number; y: number }) {
	const w = h[8];
	// The projection's derivative at the origin, which is the linear part of what it does to the face.
	const a = (h[0] - centre.x * h[6]) / w;
	const b = (h[1] - centre.x * h[7]) / w;
	const c = (h[3] - centre.y * h[6]) / w;
	const d = (h[4] - centre.y * h[7]) / w;

	// Singular values of that two by two give the axes, and its rotation gives the tilt.
	const e = (a + d) / 2;
	const f = (a - d) / 2;
	const g = (c + b) / 2;
	const i = (c - b) / 2;
	const bigger = Math.hypot(e, i);
	const smaller = Math.hypot(f, g);
	return {
		semiMajor: bigger + smaller,
		semiMinor: Math.max(1e-6, Math.abs(bigger - smaller)),
		rotation: Math.atan2(i, e) - Math.atan2(g, f)
	};
}

function invert3(h: number[]): number[] | null {
	const [a, b, c, d, e, f, g, i, j] = h;
	const A = e * j - f * i;
	const B = f * g - d * j;
	const C = d * i - e * g;
	const det = a * A + b * B + c * C;
	if (Math.abs(det) < 1e-12) return null;
	return [
		A / det,
		(c * i - b * j) / det,
		(b * f - c * e) / det,
		B / det,
		(a * j - c * g) / det,
		(c * d - a * f) / det,
		C / det,
		(b * g - a * i) / det,
		(a * e - b * d) / det
	];
}

/** Gaussian elimination with partial pivoting, on the eight by eight the four anchors produce. */
function solveEight(rows: number[][]): number[] | null {
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
	return rows.map((row, k) => row[n] / row[k]);
}

/** Image pixels to face coordinates, the space the scoring rules already work in. */
export function toFaceCoords(face: FaceLocation, x: number, y: number): { x: number; y: number } {
	return apply(face.inverse, x, y);
}

/** The inverse, used to draw the detected rings back over the video. */
export function toImageCoords(face: FaceLocation, x: number, y: number): { x: number; y: number } {
	return apply(face.transform, x, y);
}

/**
 * The square crop the learned arrow detector reads, and where each of its cells came from.
 *
 * Written once and shared by the two cutters and by the read back, because the only thing that says
 * where a peak in the crop came from is the sampling the crop was cut with. Three copies of this
 * drifted apart once already, and an arrow was reported a quarter turn from where it was shot.
 *
 * This is the ellipse summary rather than the projection, which is not what the crop is documented
 * to be, and the reason it stays that way is that the detector's training crops were cut with it
 * (scripts/prepare-arrows.mjs). Read back through cropToFace it costs nothing: what the network sees
 * and what the archer scores are separate questions, and only the first has to match the training.
 */
export function cropToImage(
	face: FaceLocation,
	x: number,
	y: number,
	factor = 1
): { x: number; y: number } {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);
	const px = x * face.semiMajor;
	const py = y * face.semiMinor;
	return {
		x: (face.cx + px * cos - py * sin) * factor,
		y: (face.cy + px * sin + py * cos) * factor
	};
}

/** Where a cell of that crop sits on the face, which is the point that scores. */
export function cropToFace(face: FaceLocation, x: number, y: number): { x: number; y: number } {
	const pixel = cropToImage(face, x, y);
	return toFaceCoords(face, pixel.x, pixel.y);
}


/**
 * Turns a fit so its angular origin points a named way in the picture, rather than wherever the
 * descent left it.
 *
 * `alignFace` chains each fit to the one before, which keeps the coordinates continuous but pins
 * nothing: a chain of steps each free to turn a little is a random walk, and it walks. Measured over
 * eight recorded sweeps, the fit's origin turned by sixty degrees on three of them and by a hundred on
 * another, in ten seconds, with no jump anywhere in it. That is what an archer sees as the found
 * arrows creeping round the gold, and it is worse than it looks: the tracker gathers its evidence per
 * place on the face, so a real arrow whose coordinates are slowly turning has its votes smeared over
 * an arc instead of piling up on one place, and never clears the bar at all.
 *
 * The freedom is real and cannot be fitted away. A target is a set of circles, so the same picture is
 * described equally well by the same four points anywhere round the ring, and the descent that places
 * them is choosing along a direction that costs it nothing. Since nothing in the rings can decide it,
 * the answer is to decide it by convention instead of leaving it to the noise, and any fixed direction
 * in the picture will do: scoring reads a radius, which no turn changes.
 *
 * `up` is that direction, as an angle in image pixels. The picture's own vertical is the honest
 * default. It is not the boss's true vertical, and a phone held at a tilt will have the face's origin
 * tilted with it; what it is, is the same on every frame, which is the property that was missing.
 * A phone that reports gravity can pass the real up here instead and get the true one.
 */
export function pinFace(fitted: FaceLocation, up = -Math.PI / 2): FaceLocation {
	/**
	 * Which way up is on the paper, rather than which anchor happens to look upright in the picture.
	 *
	 * These are not the same question and the difference is what the pin was leaking. Asking where the
	 * first anchor must go for its chord to run up the screen asks about a point four fifths of the way
	 * out, which is the part of the face perspective has bent most: walk round the boss without turning
	 * the phone and the face angle that answers it moves, so a pin meant to hold the coordinates still
	 * turned them instead, by as much as the drift it was there to stop.
	 *
	 * Read at the middle it is a different quantity entirely. A short step up the screen from the
	 * centre, taken back through the fit, is the direction on the paper that appears upright from here,
	 * and that is a fact about the boss and the phone rather than about the far side of the face. The
	 * step is small so that the projection is only ever asked what it does locally, which is the one
	 * thing about it that does not depend on where the anchors ended up.
	 */
	const step = Math.max(1, fitted.semiMajor * 0.05);
	const along = apply(fitted.inverse, fitted.cx + Math.cos(up) * step, fitted.cy + Math.sin(up) * step);
	const middle = apply(fitted.inverse, fitted.cx, fitted.cy);
	const measured = Math.atan2(along.y - middle.y, along.x - middle.x);

	const best = measured;

	const turned = ANCHOR_POINTS.map((_, i) => {
		const angle = (i * Math.PI) / 2 + best;
		const point = apply(fitted.transform, Math.cos(angle) * ANCHOR_RADIUS, Math.sin(angle) * ANCHOR_RADIUS);
		return [point.x, point.y] as [number, number];
	});
	return { ...(faceFromAnchors(turned, fitted.support) ?? fitted), spot: fitted.spot };
}

/**
 * Re-expresses a face with the same angular origin as the one before it.
 *
 * A target face is the same face turned through any angle. The rings say nothing about which way round
 * it is, so the fit is free to describe the same picture with its four points anywhere on the circle,
 * and the descent takes that freedom: it costs nothing to score, so it wanders with the noise. The
 * geometry stays right and the drawn rings stay right, because rings are circles. What goes wrong is
 * everything measured in face coordinates, which is to say the arrows. They sit still on the paper and
 * drift round the face, which is exactly what a slowly turning frame of reference looks like.
 *
 * Nothing can say what the true angle is, but nothing needs to. What is needed is that it be the same
 * angle from one frame to the next, so the fit is turned back onto the previous frame's origin before
 * it is used. Reading the same points through the new projection at a turned-back angle describes the
 * identical face, so this changes nothing about where the geometry says the boss is; it only stops the
 * coordinates written on it from rotating underneath the arrows.
 */
export function alignFace(previous: FaceLocation, fitted: FaceLocation): FaceLocation {
	/** As far as a frame's worth of drift could conceivably reach. Beyond it this is a different face. */
	const REACH = Math.PI / 12;

	const cost = (turn: number) => {
		let total = 0;
		for (let i = 0; i < ANCHOR_POINTS.length; i++) {
			const angle = (i * Math.PI) / 2 + turn;
			const point = apply(fitted.transform, Math.cos(angle) * ANCHOR_RADIUS, Math.sin(angle) * ANCHOR_RADIUS);
			const [x, y] = previous.anchors[i];
			total += (point.x - x) * (point.x - x) + (point.y - y) * (point.y - y);
		}
		return total;
	};

	// Coarse then fine, which is enough: the cost has one minimum anywhere near the answer, and a tenth
	// of a degree is far below what a drawn line or an arrow's place can show.
	let turn = 0;
	for (let step = REACH / 4; step > 0.0005; step /= 3) {
		let improved = true;
		while (improved) {
			improved = false;
			for (const way of [step, -step]) {
				if (Math.abs(turn + way) > REACH) continue;
				if (cost(turn + way) < cost(turn) - 1e-9) {
					turn += way;
					improved = true;
				}
			}
		}
	}
	if (turn === 0) return fitted;

	const turned = ANCHOR_POINTS.map((_, i) => {
		const angle = (i * Math.PI) / 2 + turn;
		const point = apply(fitted.transform, Math.cos(angle) * ANCHOR_RADIUS, Math.sin(angle) * ANCHOR_RADIUS);
		return [point.x, point.y] as [number, number];
	});
	return { ...(faceFromAnchors(turned, fitted.support) ?? fitted), spot: fitted.spot };
}
