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

export interface Component {
	/** Pixel indices, kept so a caller can take moments over the region. */
	pixels: number[];
	size: number;
}

/**
 * Every connected run of set pixels, largest first. Four connectivity with an explicit stack:
 * recursion blows the stack on a region covering half a frame.
 *
 * All of them, not just the biggest, because a three spot face puts several golds in one frame and
 * taking only the largest silently ignores two thirds of the target.
 */
export function components(
	mask: Uint8Array,
	width: number,
	height: number,
	minSize = 1
): Component[] {
	const seen = new Uint8Array(mask.length);
	const stack: number[] = [];
	const found: Component[] = [];

	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || seen[start]) continue;

		const pixels: number[] = [];
		stack.length = 0;
		stack.push(start);
		seen[start] = 1;

		while (stack.length > 0) {
			const index = stack.pop() as number;
			pixels.push(index);
			const x = index % width;
			const y = (index - x) / width;

			if (x > 0) push(index - 1);
			if (x < width - 1) push(index + 1);
			if (y > 0) push(index - width);
			if (y < height - 1) push(index + width);
		}

		if (pixels.length >= minSize) found.push({ pixels, size: pixels.length });
	}

	function push(index: number) {
		if (mask[index] && !seen[index]) {
			seen[index] = 1;
			stack.push(index);
		}
	}

	return found.sort((a, b) => b.size - a.size);
}

/** Largest connected run of set pixels, as a labelled mask plus its size. */
export function largestComponent(
	mask: Uint8Array,
	width: number,
	height: number
): { label: Uint8Array; size: number } {
	const [biggest] = components(mask, width, height);
	const label = new Uint8Array(mask.length);
	if (!biggest) return { label, size: 0 };
	for (const index of biggest.pixels) label[index] = 1;
	return { label, size: biggest.size };
}
