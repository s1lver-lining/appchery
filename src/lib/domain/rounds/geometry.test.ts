import { describe, it, expect } from 'vitest';
import { WA_10_RING, ROUNDS, getRound } from './seed';
import { scoreAt, maxScore, totalArrows, endSlots, groupMetrics, groupHull,
	sortShotsDescending
} from './geometry';
import { buildCustomRound, validateCustomRound } from './custom';
import type { Shot } from './types';

// Scoring is the part that must not be wrong: a bad score is a corrupted record nobody notices.

describe('scoreAt', () => {
	it('scores the exact centre as an X', () => {
		expect(scoreAt(WA_10_RING, 0, 0).label).toBe('X');
	});

	it('scores just inside the 10-ring as a 10, not an X', () => {
		const zone = scoreAt(WA_10_RING, 0.08, 0);
		expect(zone.label).toBe('10');
		expect(zone.value).toBe(10);
	});

	it('gives an X the same value as a 10', () => {
		expect(scoreAt(WA_10_RING, 0, 0).value).toBe(10);
	});

	it('scores each ring boundary to the inner ring', () => {
		// A shot touching the line scores the higher value, which is why hit testing is inclusive.
		expect(scoreAt(WA_10_RING, 0.1, 0).label).toBe('10');
		expect(scoreAt(WA_10_RING, 0.2, 0).label).toBe('9');
		expect(scoreAt(WA_10_RING, 1.0, 0).label).toBe('1');
	});

	it('scores outside the face as a miss worth zero', () => {
		const zone = scoreAt(WA_10_RING, 1.2, 0);
		expect(zone.label).toBe('M');
		expect(zone.value).toBe(0);
		expect(zone.countsAsHit).toBe(false);
	});

	it('is rotationally symmetric', () => {
		const radius = 0.35;
		for (const angle of [0, Math.PI / 3, Math.PI, (5 * Math.PI) / 4]) {
			const zone = scoreAt(WA_10_RING, radius * Math.cos(angle), radius * Math.sin(angle));
			expect(zone.label).toBe('7');
		}
	});
});

describe('round definitions', () => {
	it('gives a WA 720 a maximum of 720 over 72 arrows', () => {
		const round = getRound('wa720-70m')!;
		expect(totalArrows(round)).toBe(72);
		expect(maxScore(round, WA_10_RING)).toBe(720);
	});

	it('uses only score sets that exist', () => {
		for (const round of ROUNDS) {
			expect(round.scoreSetId).toBe(WA_10_RING.id);
		}
	});
});

describe('groupMetrics', () => {
	const plotted = (x: number, y: number): Shot => ({
		ordinal: 1,
		value: 10,
		zoneLabel: '10',
		x,
		y,
		source: 'plotted'
	});

	it('returns null when no arrow was plotted', () => {
		const scoreOnly: Shot = { ordinal: 1, value: 9, zoneLabel: '9', x: null, y: null, source: 'manual' };
		expect(groupMetrics([scoreOnly])).toBeNull();
	});

	it('ignores score-only arrows but counts the plotted ones', () => {
		const scoreOnly: Shot = { ordinal: 2, value: 9, zoneLabel: '9', x: null, y: null, source: 'manual' };
		expect(groupMetrics([plotted(0.1, 0.1), scoreOnly])?.sampleSize).toBe(1);
	});

	it('finds the group centre, which is what drives a sight adjustment', () => {
		// A tight group placed high and left: the offset is the signal, the spread stays small.
		const metrics = groupMetrics([plotted(-0.2, -0.3), plotted(-0.22, -0.28), plotted(-0.18, -0.32)])!;
		expect(metrics.centerX).toBeCloseTo(-0.2, 5);
		expect(metrics.centerY).toBeCloseTo(-0.3, 5);
		expect(metrics.meanRadius).toBeLessThan(0.03);
	});

	it('measures spread independently of where the group sits', () => {
		const centred = groupMetrics([plotted(-0.1, 0), plotted(0.1, 0)])!;
		const offset = groupMetrics([plotted(0.5, 0.6), plotted(0.7, 0.6)])!;
		expect(offset.horizontalSpread).toBeCloseTo(centred.horizontalSpread, 5);
		expect(offset.meanRadius).toBeCloseTo(centred.meanRadius, 5);
	});
});

describe('custom rounds', () => {
	const input = { ends: 10, arrowsPerEnd: 3, faceSize: 60, distance: 25, unit: 'm' as const };

	it('builds a round the engine treats like any other', () => {
		const round = buildCustomRound(input);
		expect(totalArrows(round)).toBe(30);
		expect(maxScore(round, WA_10_RING)).toBe(300);
		expect(endSlots(round)).toHaveLength(10);
	});

	it('names itself from its own parameters when left blank', () => {
		expect(buildCustomRound(input).name).toBe('25m · 60cm · 10x3');
	});

	it('rejects values that cannot describe a real round', () => {
		expect(validateCustomRound({ ...input, ends: 0 })).toContain('ends');
		expect(validateCustomRound({ ...input, arrowsPerEnd: 99 })).toContain('arrowsPerEnd');
		expect(validateCustomRound(input)).toEqual([]);
	});
});

describe('groupHull', () => {
	const at = (x: number, y: number): Shot => ({
		ordinal: 1,
		value: 10,
		zoneLabel: '10',
		x,
		y,
		source: 'plotted'
	});

	it('returns the points themselves when there is no area to enclose', () => {
		expect(groupHull([])).toEqual([]);
		expect(groupHull([at(0.1, 0.1)])).toHaveLength(1);
		expect(groupHull([at(0.1, 0.1), at(0.2, 0.2)])).toHaveLength(2);
	});

	it('drops a point sitting inside the group, which does not shape the perimeter', () => {
		const hull = groupHull([at(-0.5, -0.5), at(0.5, -0.5), at(0.5, 0.5), at(-0.5, 0.5), at(0, 0)]);
		expect(hull).toHaveLength(4);
		expect(hull).not.toContainEqual([0, 0]);
	});

	it('ignores arrows that were never plotted', () => {
		const scoreOnly: Shot = { ordinal: 1, value: 9, zoneLabel: '9', x: null, y: null, source: 'manual' };
		expect(groupHull([at(0, 0), at(0.3, 0), scoreOnly])).toHaveLength(2);
	});
});

describe('sortShotsDescending', () => {
	it('puts an X ahead of a ten, since both are worth the same', () => {
		const sorted = sortShotsDescending([
			{ value: 9, zoneLabel: '9' },
			{ value: 10, zoneLabel: '10' },
			{ value: 10, zoneLabel: 'X' }
		]);
		expect(sorted.map((s) => s.zoneLabel)).toEqual(['X', '10', '9']);
	});

	it('leaves the input untouched, so entry order survives alongside the sorted view', () => {
		const input = [
			{ value: 5, zoneLabel: '5' },
			{ value: 8, zoneLabel: '8' }
		];
		sortShotsDescending(input);
		expect(input.map((s) => s.zoneLabel)).toEqual(['5', '8']);
	});
});
