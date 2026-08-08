import { describe, it, expect } from 'vitest';
import { WA_10_RING, ROUNDS, getRound } from './seed';
import { scoreAt, maxScore, totalArrows, endSlots, groupMetrics } from './geometry';
import type { Shot } from './types';

/**
 * Scoring rules are the part of this app that must not be wrong. Everything
 * else is an inconvenience when it breaks; a wrong score is a corrupted record
 * the archer may not notice until a result is disputed.
 */

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
		// A shot touching the line scores the higher value — the standard rule,
		// and the reason hit-testing uses <= rather than <.
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

	it('gives a WA 1440 a maximum of 1440 over 144 arrows', () => {
		const round = getRound('wa1440-men')!;
		expect(totalArrows(round)).toBe(144);
		expect(maxScore(round, WA_10_RING)).toBe(1440);
	});

	it('gives a Portsmouth a maximum of 600 over 60 arrows', () => {
		const round = getRound('portsmouth')!;
		expect(totalArrows(round)).toBe(60);
		expect(maxScore(round, WA_10_RING)).toBe(600);
	});

	it('expands multi-stage rounds into ends in shooting order', () => {
		const slots = endSlots(getRound('wa1440-men')!);
		expect(slots).toHaveLength(24);
		expect(slots[0].stage.distance).toEqual({ value: 90, unit: 'm' });
		expect(slots[23].stage.distance).toEqual({ value: 30, unit: 'm' });
		// Ends restart their numbering at each new distance.
		expect(slots[6]).toMatchObject({ stageIndex: 1, endNo: 1 });
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
		// A tight group placed high-left: the centre offset is the signal, and the
		// mean radius stays small because the group itself is tight.
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
