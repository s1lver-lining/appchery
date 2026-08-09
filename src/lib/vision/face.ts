import { rgbToHsv, largestComponent } from './pixels';
import type { Frame, FaceLocation } from './types';

/**
 * Finds the target face by its gold, which is the one part of a WA face no other object at a range
 * shares: a large, strongly saturated yellow disc. No training data is needed because the face is a
 * specified object, not something to be learned.
 *
 * The gold spans rings 9 and 10, which is 40% of the face radius on every WA face size. That fixed
 * ratio is what turns a gold blob into the whole face.
 */
const GOLD_SHARE_OF_FACE = 0.4;

export interface FaceDetectOptions {
	/** Hue window for the gold, in degrees. Wide enough to survive warm and cold daylight. */
	hueRange?: [number, number];
	minSaturation?: number;
	minValue?: number;
	/** Reject a blob too small to be a face, as a share of the frame. */
	minAreaShare?: number;
}

export function detectFace(frame: Frame, options: FaceDetectOptions = {}): FaceLocation | null {
	const [hueLow, hueHigh] = options.hueRange ?? [35, 70];
	const minSaturation = options.minSaturation ?? 0.35;
	const minValue = options.minValue ?? 90;
	const minAreaShare = options.minAreaShare ?? 0.002;

	const { width, height, data } = frame;
	const mask = new Uint8Array(width * height);

	for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
		const { h, s, v } = rgbToHsv(data[p], data[p + 1], data[p + 2]);
		if (h >= hueLow && h <= hueHigh && s >= minSaturation && v >= minValue) mask[i] = 1;
	}

	const { label, size } = largestComponent(mask, width, height);
	if (size < minAreaShare * width * height) return null;

	return fromMoments(label, width, height, size, GOLD_SHARE_OF_FACE);
}

/**
 * Second moments turn a blob into the ellipse that best matches it. For a filled ellipse the
 * covariance eigenvalues are (semi axis squared) / 4, which is what recovers the axes and the tilt.
 */
function fromMoments(
	label: Uint8Array,
	width: number,
	height: number,
	size: number,
	share: number
): FaceLocation | null {
	let sumX = 0;
	let sumY = 0;
	for (let i = 0; i < label.length; i++) {
		if (!label[i]) continue;
		const x = i % width;
		sumX += x;
		sumY += (i - x) / width;
	}
	const cx = sumX / size;
	const cy = sumY / size;

	let xx = 0;
	let yy = 0;
	let xy = 0;
	for (let i = 0; i < label.length; i++) {
		if (!label[i]) continue;
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
		const mean = (goldMajor + goldMinor) / 2;
		goldMajor = mean;
		goldMinor = mean;
		rotation = 0;
	}

	// A blob far from elliptical is something else that happens to be yellow, so it is not a face.
	const expected = Math.PI * goldMajor * goldMinor;
	const support = expected > 0 ? Math.min(1, size / expected) : 0;
	if (support < 0.6) return null;

	return {
		cx,
		cy,
		semiMajor: goldMajor / share,
		semiMinor: goldMinor / share,
		rotation,
		support
	};
}

/**
 * Image pixels to normalised face coordinates, undoing the tilt the camera introduces. This is an
 * affine rectification, not a full homography: it handles a camera off to one side, but not one
 * close to a steeply angled boss, where near and far rings differ in scale.
 */
export function toFaceCoords(face: FaceLocation, x: number, y: number): { x: number; y: number } {
	const cos = Math.cos(-face.rotation);
	const sin = Math.sin(-face.rotation);
	const dx = x - face.cx;
	const dy = y - face.cy;
	return {
		x: (dx * cos - dy * sin) / face.semiMajor,
		y: (dx * sin + dy * cos) / face.semiMinor
	};
}

/** The inverse, used to draw the detected rings back over the video. */
export function toImageCoords(face: FaceLocation, x: number, y: number): { x: number; y: number } {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);
	const px = x * face.semiMajor;
	const py = y * face.semiMinor;
	return {
		x: face.cx + px * cos - py * sin,
		y: face.cy + px * sin + py * cos
	};
}
