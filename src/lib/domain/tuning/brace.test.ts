import { describe, it, expect } from 'vitest';
import { bracePoints, tightestBrace, type BraceGroup } from './brace';
import type { Shot } from '$lib/domain/rounds/types';

const shot = (x: number, y: number, ordinal: number): Shot => ({
	ordinal,
	value: 10,
	zoneLabel: '10',
	x,
	y,
	source: 'plotted'
});

const groups: BraceGroup[] = [
	{
		braceMm: 230,
		ends: [{ id: 'b', shots: [shot(0, -0.5, 1), shot(0, -0.5, 2)] }]
	},
	{
		braceMm: 220,
		// Half a face radius apart, centred on the middle of the face.
		ends: [{ id: 'a', shots: [shot(-0.25, 0, 1), shot(0.25, 0, 2)] }]
	},
	{ braceMm: 225, ends: [] }
];

describe('brace height readings', () => {
	it('reads a group in centimetres off the face it was shot on, low heights first', () => {
		const points = bracePoints(groups, 40);
		expect(points.map((p) => p.braceCm)).toEqual([22, 23]);
		// A quarter of the radius either side of centre is 10 cm apart on a 40 cm face.
		expect(points[0].spreadCm).toBeCloseTo(10);
		expect(points[0].centreCm).toBeCloseTo(0);
		expect(points[0].arrows).toBe(2);
	});

	it('turns a group above the middle of the face into a positive height', () => {
		const [, high] = bracePoints(groups, 40);
		expect(high.centreCm).toBeCloseTo(10);
	});

	it('leaves out a height nothing has been shot at yet', () => {
		expect(bracePoints(groups, 40).some((p) => p.braceCm === 22.5)).toBe(false);
	});

	it('names the tightest group, which is the answer being looked for', () => {
		expect(tightestBrace(bracePoints(groups, 40))?.braceCm).toBe(23);
		expect(tightestBrace([])).toBeNull();
	});
});
