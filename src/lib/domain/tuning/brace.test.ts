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
		ends: [{ id: 'b', shots: [shot(0, -0.5, 1), shot(0, -0.5, 2), shot(0, -0.5, 3)] }]
	},
	{
		braceMm: 220,
		// Half a face radius apart, centred on the middle of the face.
		ends: [{ id: 'a', shots: [shot(-0.25, 0, 1), shot(0.25, 0, 2), shot(0, 0, 3)] }]
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
		expect(points[0].arrows).toBe(3);
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

	/**
	 * One arrow has no spread to measure, so a height it was plotted at reads as a perfect group and
	 * would be named the answer over a dozen arrows shot properly, the moment the arrow went in.
	 */
	it('does not call a height with one arrow at it the tightest', () => {
		const started: BraceGroup[] = [
			// A dozen arrows in a tight ring, which is a group and a good one.
			{
				braceMm: 230,
				ends: [
					{
						id: 'c',
						shots: Array.from({ length: 12 }, (_, i) =>
							shot(0.05 * Math.cos((i * Math.PI) / 6), 0.05 * Math.sin((i * Math.PI) / 6), i + 1)
						)
					}
				]
			},
			// One arrow, spreading nothing, at a height the archer has only just started on.
			{ braceMm: 240, ends: [{ id: 'd', shots: [shot(0.4, 0.4, 1)] }] }
		];
		expect(tightestBrace(bracePoints(started, 40))?.braceCm).toBe(23);
	});

	it('names none at all until a height has been shot enough to have a group', () => {
		const early: BraceGroup[] = [
			{ braceMm: 230, ends: [{ id: 'd', shots: [shot(0, 0, 1), shot(0.1, 0, 2)] }] }
		];
		expect(tightestBrace(bracePoints(early, 40))).toBeNull();
	});
});
