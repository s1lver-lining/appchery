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

	// Starts flat: how much the face leans is what the ring fit works out, not the gold blob.
	return {
		cx,
		cy,
		semiMajor: goldMajor / share,
		semiMinor: goldMinor / share,
		rotation,
		support,
		perspectiveX: 0,
		perspectiveY: 0
	};
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
export function toFaceCoords(face: FaceLocation, x: number, y: number): { x: number; y: number } {
	const { a, b, d, e } = linearPart(face);
	const dx = x - face.cx;
	const dy = y - face.cy;
	const g = face.perspectiveX ?? 0;
	const h = face.perspectiveY ?? 0;

	/**
	 * The forward map divides by (1 + g·fx + h·fy), so inverting it is two linear equations rather
	 * than a rotate and a scale. With no perspective the divisor is one and this is the old inverse.
	 */
	const a1 = a - dx * g;
	const b1 = b - dx * h;
	const a2 = d - dy * g;
	const b2 = e - dy * h;
	const determinant = a1 * b2 - b1 * a2;
	if (Math.abs(determinant) < 1e-9) return { x: 0, y: 0 };
	return {
		x: (dx * b2 - b1 * dy) / determinant,
		y: (a1 * dy - dx * a2) / determinant
	};
}

/** The inverse, used to draw the detected rings back over the video. */
export function toImageCoords(face: FaceLocation, x: number, y: number): { x: number; y: number } {
	const { a, b, d, e } = linearPart(face);
	// Further from the lens is smaller, which is the one thing an ellipse cannot say.
	const depth = 1 + (face.perspectiveX ?? 0) * x + (face.perspectiveY ?? 0) * y;
	const scale = Math.abs(depth) < 1e-6 ? 1 : 1 / depth;
	return {
		x: face.cx + (a * x + b * y) * scale,
		y: face.cy + (d * x + e * y) * scale
	};
}

/**
 * The two by two that takes face coordinates to image ones before the lean divides them. Written out
 * once because the fit, the forward map and the inverse must agree exactly or a point makes a round
 * trip and comes back somewhere else.
 */
export function linearPart(face: FaceLocation): { a: number; b: number; d: number; e: number } {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);
	return {
		a: face.semiMajor * cos,
		b: -face.semiMinor * sin,
		d: face.semiMajor * sin,
		e: face.semiMinor * cos
	};
}
