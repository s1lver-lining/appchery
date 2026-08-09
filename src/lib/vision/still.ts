import { classify, type RingColour } from './rings';
import { rgbToHsv } from './pixels';
import { components } from './pixels';
import { toFaceCoords } from './face';
import type { Frame, FaceLocation, Blob } from './types';

/**
 * Finding arrows in a single photograph.
 *
 * The live scanner recognises an arrow by it being *new*, which needs a reference frame of the quiet
 * boss. A still has no such reference, so a different signal is needed: the face is a known pattern
 * of colours, and an arrow is a patch that does not match the colour its radius says it should be.
 *
 * This is weaker than the video path and is meant for inspecting a picture, not for scoring one.
 * Every hole, tear, pencil mark and printed number is also an anomaly, and a shaft crossing rings
 * reads as one long blob. Treat the output as candidates to look at.
 */

/** What each ring should look like, by outer radius. Ten equal rings, gold reaching 0.2. */
const BANDS: { outer: number; colours: RingColour[] }[] = [
	{ outer: 0.2, colours: ['gold'] },
	{ outer: 0.4, colours: ['red'] },
	{ outer: 0.6, colours: ['blue'] },
	{ outer: 0.8, colours: ['dark'] },
	{ outer: 1.0, colours: ['light'] }
];

export interface StillOptions {
	/** Ignore anything smaller than this share of the face area: paper grain and single holes. */
	minAreaShare?: number;
	maxAreaShare?: number;
	/** Skip a margin either side of every ring boundary, where the printed line lives. */
	edgeMargin?: number;
	/** How much darker than its ring a pixel must be. The printed numbers are lighter, not darker. */
	darkness?: number;
}

/** Median brightness of each band, so "darker than the ring" means darker than this actual paper. */
function bandBrightness(frame: Frame, face: FaceLocation): number[] {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);

	return BANDS.map((band, index) => {
		const radius = index === 0 ? 0.15 : (band.outer + BANDS[index - 1].outer) / 2;
		const values: number[] = [];
		for (let i = 0; i < 32; i++) {
			const angle = (i / 32) * Math.PI * 2;
			const fx = Math.cos(angle) * radius * face.semiMajor;
			const fy = Math.sin(angle) * radius * face.semiMinor;
			const x = Math.round(face.cx + fx * cos - fy * sin);
			const y = Math.round(face.cy + fx * sin + fy * cos);
			if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
			const p = (y * frame.width + x) * 4;
			values.push(rgbToHsv(frame.data[p], frame.data[p + 1], frame.data[p + 2]).v);
		}
		if (values.length === 0) return 255;
		values.sort((a, b) => a - b);
		return values[Math.floor(values.length / 2)];
	});
}

function bandIndex(radius: number): number {
	for (let i = 0; i < BANDS.length; i++) {
		if (radius <= BANDS[i].outer) return i;
	}
	return -1;
}

/**
 * Regions inside the face whose colour does not match the ring they sit in, in face coordinates.
 * Sorted largest first, which puts arrow shafts ahead of individual holes.
 */
export function detectArrowsInStill(
	frame: Frame,
	face: FaceLocation,
	options: StillOptions = {}
): (Blob & { x: number; y: number })[] {
	const minAreaShare = options.minAreaShare ?? 0.0006;
	const maxAreaShare = options.maxAreaShare ?? 0.06;
	const edgeMargin = options.edgeMargin ?? 0.012;
	const darkness = options.darkness ?? 0.72;

	const brightness = bandBrightness(frame, face);

	const { width, height, data } = frame;
	const mask = new Uint8Array(width * height);

	// Only the face is worth scanning, and only out to the last ring.
	const left = Math.max(0, Math.floor(face.cx - face.semiMajor));
	const right = Math.min(width - 1, Math.ceil(face.cx + face.semiMajor));
	const top = Math.max(0, Math.floor(face.cy - face.semiMajor));
	const bottom = Math.min(height - 1, Math.ceil(face.cy + face.semiMajor));

	for (let y = top; y <= bottom; y++) {
		for (let x = left; x <= right; x++) {
			const point = toFaceCoords(face, x, y);
			const radius = Math.hypot(point.x, point.y);
			if (radius > 0.98) continue;

			// The printed ring lines are dark everywhere, so a band either side of each is skipped.
			const nearEdge = BANDS.some((band) => Math.abs(radius - band.outer) < edgeMargin);
			if (nearEdge) continue;

			const band = bandIndex(radius);
			if (band < 0) continue;
			const wanted = BANDS[band].colours;

			const p = (y * width + x) * 4;
			if (wanted.includes(classify(data[p], data[p + 1], data[p + 2]))) continue;

			/**
			 * Wrong colour is not enough on its own: the ring numbers printed on a face are the wrong
			 * colour too, and they were the largest anomalies on every photograph tried. An arrow and
			 * the hole it makes are physically darker than the paper; the printed numbers are lighter.
			 */
			const value = rgbToHsv(data[p], data[p + 1], data[p + 2]).v;
			if (value <= brightness[band] * darkness) mask[y * width + x] = 1;
		}
	}

	const faceArea = Math.PI * face.semiMajor * face.semiMinor;
	const minSize = Math.max(4, minAreaShare * faceArea);
	const maxSize = maxAreaShare * faceArea;

	const found: (Blob & { x: number; y: number })[] = [];
	for (const blob of components(mask, width, height, minSize)) {
		if (blob.size > maxSize) continue;

		let sumX = 0;
		let sumY = 0;
		for (const i of blob.pixels) {
			const x = i % width;
			sumX += x;
			sumY += (i - x) / width;
		}
		const cx = sumX / blob.size;
		const cy = sumY / blob.size;
		const point = toFaceCoords(face, cx, cy);
		found.push({ cx, cy, area: blob.size, x: point.x, y: point.y });
	}

	return found.sort((a, b) => b.area - a.area);
}
