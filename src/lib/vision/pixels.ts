import type { Frame } from './types';

/** Rec. 601 luma, which is what the eye weights and what ring contrast follows. */
export function luma(r: number, g: number, b: number): number {
	return (r * 299 + g * 587 + b * 114) / 1000;
}

export function toGray(frame: Frame): Uint8ClampedArray {
	const out = new Uint8ClampedArray(frame.width * frame.height);
	for (let i = 0, p = 0; i < out.length; i++, p += 4) {
		out[i] = luma(frame.data[p], frame.data[p + 1], frame.data[p + 2]);
	}
	return out;
}

/**
 * Box downscale by an integer factor. Detection runs on a small image because the work is per pixel
 * and a phone has to keep up with the video, not because the detail is unwanted.
 */
export function downscale(frame: Frame, factor: number): Frame {
	if (factor <= 1) return frame;
	const width = Math.floor(frame.width / factor);
	const height = Math.floor(frame.height / factor);
	const data = new Uint8ClampedArray(width * height * 4);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (let dy = 0; dy < factor; dy++) {
				for (let dx = 0; dx < factor; dx++) {
					const p = ((y * factor + dy) * frame.width + (x * factor + dx)) * 4;
					r += frame.data[p];
					g += frame.data[p + 1];
					b += frame.data[p + 2];
				}
			}
			const n = factor * factor;
			const q = (y * width + x) * 4;
			data[q] = r / n;
			data[q + 1] = g / n;
			data[q + 2] = b / n;
			data[q + 3] = 255;
		}
	}
	return { width, height, data };
}

export interface Hsv {
	/** Degrees, 0 to 360. */
	h: number;
	/** 0 to 1. */
	s: number;
	/** 0 to 255, kept in the byte range the rest of the pipeline works in. */
	v: number;
}

/** Hue and saturation separate the gold from the red far more reliably than RGB thresholds do. */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	if (delta > 0) {
		if (max === r) h = 60 * (((g - b) / delta + 6) % 6);
		else if (max === g) h = 60 * ((b - r) / delta + 2);
		else h = 60 * ((r - g) / delta + 4);
	}
	return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/**
 * Largest connected run of set pixels, as a labelled mask plus its size. Four connectivity and an
 * explicit stack: recursion blows the stack on a region covering half a frame.
 */
export function largestComponent(
	mask: Uint8Array,
	width: number,
	height: number
): { label: Uint8Array; size: number } {
	const seen = new Uint8Array(mask.length);
	const best = new Uint8Array(mask.length);
	const current: number[] = [];
	const stack: number[] = [];
	let bestSize = 0;

	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || seen[start]) continue;

		current.length = 0;
		stack.length = 0;
		stack.push(start);
		seen[start] = 1;

		while (stack.length > 0) {
			const index = stack.pop() as number;
			current.push(index);
			const x = index % width;
			const y = (index - x) / width;

			if (x > 0) push(index - 1);
			if (x < width - 1) push(index + 1);
			if (y > 0) push(index - width);
			if (y < height - 1) push(index + width);
		}

		if (current.length > bestSize) {
			bestSize = current.length;
			best.fill(0);
			for (const index of current) best[index] = 1;
		}
	}

	function push(index: number) {
		if (mask[index] && !seen[index]) {
			seen[index] = 1;
			stack.push(index);
		}
	}

	return { label: best, size: bestSize };
}
