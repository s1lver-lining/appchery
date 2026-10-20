import { describe, expect, it } from 'vitest';
import { paperContrast } from './contrast';
import { faceFromAnchors, ANCHOR_RADIUS } from './face';
import { luma } from './pixels';
import type { Frame } from './types';

const SIZE = 200;
const face = faceFromAnchors(
	[0, 1, 2, 3].map((i) => [100 + Math.cos((i * Math.PI) / 2) * 80 * ANCHOR_RADIUS, 100 + Math.sin((i * Math.PI) / 2) * 80 * ANCHOR_RADIUS] as [number, number]),
	1
)!;

/** White paper with a red stroke and a black one across it, both radial. */
function paper(): Frame {
	const data = new Uint8ClampedArray(SIZE * SIZE * 4);
	for (let i = 0; i < SIZE * SIZE; i++) data.set([235, 235, 230, 255], i * 4);
	for (let x = 120; x < 170; x++) {
		for (const [y, colour] of [[60, [220, 40, 40]], [140, [20, 20, 20]]] as const) {
			for (let dy = 0; dy < 2; dy++) data.set([...colour, 255], ((y + dy) * SIZE + x) * 4);
		}
	}
	return { width: SIZE, height: SIZE, data };
}

const grey = (frame: Frame, x: number, y: number) => {
	const p = (y * SIZE + x) * 4;
	return luma(frame.data[p], frame.data[p + 1], frame.data[p + 2]);
};

describe('paperContrast', () => {
	it('shows a red shaft on white paper as dark, which brightness alone does not', () => {
		const frame = paper();
		const out = paperContrast(frame, face);
		expect(Math.max(...frame.data.slice((60 * SIZE + 140) * 4, (60 * SIZE + 140) * 4 + 3))).toBeGreaterThan(0.75 * 235);
		expect(grey(out, 140, 60)).toBeLessThan(0.75 * grey(out, 140, 100));
	});

	it('keeps a black shaft as dark as it was and plain paper as paper', () => {
		const out = paperContrast(paper(), face);
		expect(grey(out, 140, 140)).toBeLessThan(40);
		expect(grey(out, 100, 100)).toBeGreaterThan(190);
	});
});
