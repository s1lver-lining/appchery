import { toGray } from './pixels';
import type { Frame, Blob } from './types';

/**
 * An arrow is not recognised by shape: it is recognised by being new. The boss does not move, so a
 * running reference of the quiet scene plus a difference against it finds every arrow that has
 * arrived, whatever it looks like, without a single labelled example.
 */
export class Background {
	private reference: Float32Array | null = null;

	/** How fast the reference follows the scene. Slow enough that an arrow is not absorbed into it. */
	constructor(private readonly rate = 0.02) {}

	get ready(): boolean {
		return this.reference !== null;
	}

	/** Folds a frame into the reference and returns the per pixel absolute difference. */
	update(frame: Frame, learn = true): Uint8ClampedArray {
		const gray = toGray(frame);
		if (!this.reference) {
			this.reference = Float32Array.from(gray);
			return new Uint8ClampedArray(gray.length);
		}

		const diff = new Uint8ClampedArray(gray.length);
		for (let i = 0; i < gray.length; i++) {
			diff[i] = Math.abs(gray[i] - this.reference[i]);
			if (learn) this.reference[i] += (gray[i] - this.reference[i]) * this.rate;
		}
		return diff;
	}

	/**
	 * Writes the current frame straight into the reference. Called once the archer confirms the
	 * arrows on the face, so the next end is measured against a boss that already holds them.
	 */
	reset(frame: Frame) {
		this.reference = Float32Array.from(toGray(frame));
	}
}

export interface BlobOptions {
	/** Grey levels a pixel must move before it counts as changed. */
	threshold?: number;
	minArea?: number;
	maxArea?: number;
	/** Only blobs whose centre falls inside this test are kept, used to ignore anything off the face. */
	accept?: (cx: number, cy: number) => boolean;
}

/**
 * Connected components over the difference image. Four connectivity with an explicit stack, and one
 * pass: this runs on every video frame, so it stays linear in the number of pixels.
 */
export function findBlobs(
	diff: Uint8ClampedArray,
	width: number,
	height: number,
	options: BlobOptions = {}
): Blob[] {
	const threshold = options.threshold ?? 28;
	const minArea = options.minArea ?? 6;
	const maxArea = options.maxArea ?? Math.floor(width * height * 0.02);

	const seen = new Uint8Array(diff.length);
	const stack: number[] = [];
	const blobs: Blob[] = [];

	for (let start = 0; start < diff.length; start++) {
		if (diff[start] < threshold || seen[start]) continue;

		stack.length = 0;
		stack.push(start);
		seen[start] = 1;

		let count = 0;
		let sumX = 0;
		let sumY = 0;

		while (stack.length > 0) {
			const index = stack.pop() as number;
			const x = index % width;
			const y = (index - x) / width;
			count += 1;
			sumX += x;
			sumY += y;

			if (x > 0) push(index - 1);
			if (x < width - 1) push(index + 1);
			if (y > 0) push(index - width);
			if (y < height - 1) push(index + width);
		}

		if (count < minArea || count > maxArea) continue;
		const cx = sumX / count;
		const cy = sumY / count;
		if (options.accept && !options.accept(cx, cy)) continue;
		blobs.push({ cx, cy, area: count });
	}

	function push(index: number) {
		if (diff[index] >= threshold && !seen[index]) {
			seen[index] = 1;
			stack.push(index);
		}
	}

	return blobs.sort((a, b) => b.area - a.area);
}
