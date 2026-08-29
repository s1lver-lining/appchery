import { describe, it, expect } from 'vitest';
import { WA_FIELD, IFAA_FIELD, IBO_3D, ASA_3D, FIELD_ROUNDS, FIELD_SCORE_SETS } from './field';
import { scoreAt, insidePolygon, totalArrows, endSlots } from './geometry';
import { getScoreSet, roundNeedsVerification, SCORE_SETS } from './seed';
import type { Zone } from './types';

// The sets still unread from a rulebook are unverified by design, so those tests guard the engine
// rather than the point values. What has been transcribed is pinned, so an edit cannot drift it back.

describe('field score sets', () => {
	it('keeps the sets nobody has read out of a rulebook flagged', () => {
		for (const set of [WA_FIELD, IBO_3D, ASA_3D]) expect(set.needsVerification).toBe(true);
		expect(IFAA_FIELD.needsVerification).toBeUndefined();
	});

	it('warns on a round whose set is still unverified, and stays quiet on one that is not', () => {
		for (const round of FIELD_ROUNDS.filter((r) => r.scoreSetId !== IFAA_FIELD.id))
			expect(roundNeedsVerification(round)).toBe(true);
		for (const round of FIELD_ROUNDS.filter((r) => r.scoreSetId === IFAA_FIELD.id))
			expect(roundNeedsVerification(round)).toBe(false);
	});

	/* IFAA Book of Rules 2019-2020, Article V.A: five for the spot, four for the inner ring, three
	   for the outer, with the rings at 4/12/20, 7/21/35, 10/30/50 and 13/39/65 cm per face size. */
	it('scores an IFAA field face five, four and three at the published ring fractions', () => {
		expect(scoreAt(IFAA_FIELD, 0, 0).value).toBe(5);
		expect(scoreAt(IFAA_FIELD, 0.19, 0).value).toBe(5);
		expect(scoreAt(IFAA_FIELD, 0.21, 0).value).toBe(4);
		expect(scoreAt(IFAA_FIELD, 0.59, 0).value).toBe(4);
		expect(scoreAt(IFAA_FIELD, 0.61, 0).value).toBe(3);
		expect(scoreAt(IFAA_FIELD, 0.99, 0).value).toBe(3);
		expect(scoreAt(IFAA_FIELD, 1.01, 0).countsAsHit).toBe(false);
	});

	it('shoots an IFAA field round as 28 targets of four arrows', () => {
		const round = FIELD_ROUNDS.find((r) => r.id === 'ifaa-field-28')!;
		expect(totalArrows(round)).toBe(112);
	});

	it('resolves every field round to a registered score set', () => {
		for (const round of FIELD_ROUNDS) expect(getScoreSet(round.scoreSetId)).toBeDefined();
	});

	it('scores the centre of a concentric field face as the innermost zone', () => {
		expect(scoreAt(WA_FIELD, 0, 0).label).toBe('X');
	});

	it('scores outside any field face as a miss', () => {
		expect(scoreAt(WA_FIELD, 1.4, 0).countsAsHit).toBe(false);
		expect(scoreAt(IFAA_FIELD, 0, 1.4).countsAsHit).toBe(false);
	});
});

describe('3D animal faces', () => {
	it('scores the vitals higher than the body around them', () => {
		const vitals = scoreAt(IBO_3D, -0.06, -0.02);
		const body = scoreAt(IBO_3D, 0.7, 0.5);
		expect(vitals.value).toBeGreaterThan(body.value);
		expect(body.value).toBe(5);
	});

	it('finds the offset inner ring, which is not at the face centre', () => {
		// The whole reason zones carry shapes rather than radii: this ring is off centre.
		expect(scoreAt(IBO_3D, -0.14, -0.02).label).toBe('11');
		expect(scoreAt(ASA_3D, 0.02, -0.02).label).toBe('12');
	});

	it('puts IBO and ASA inner rings in different places', () => {
		expect(scoreAt(IBO_3D, 0.02, -0.02).label).not.toBe('11');
		expect(scoreAt(ASA_3D, -0.14, -0.02).label).not.toBe('12');
	});

	it('scores a shot off the animal as a miss rather than the lowest zone', () => {
		expect(scoreAt(IBO_3D, 0.99, -0.99).countsAsHit).toBe(false);
	});

	it('respects the ellipse, so a shot level with the vitals but wide of them is not a hit', () => {
		const wide = scoreAt(IBO_3D, 0.45, -0.02);
		expect(wide.value).toBe(5);
	});
});

/**
 * An inner ring is a tie break or a bonus inside one scoring band, so the whole of it has to sit in
 * that band. One that spills over its edge scores an arrow higher than the ring it landed in: the
 * IBO 11 used to reach into the 8 zone, which no rulebook has and no reading of one could produce.
 */
describe('inner rings', () => {
	it('sits wholly inside one band, in every score set', () => {
		const spilling: string[] = [];
		for (const set of SCORE_SETS) {
			for (const inner of set.zones.filter((zone) => zone.isInner)) {
				const without = { ...set, zones: set.zones.filter((zone) => zone !== inner) };
				const bands = new Set<string>();
				for (let i = 0; i < 360; i++) {
					for (let r = 0; r <= 1; r += 0.05) {
						const t = (i * Math.PI) / 180;
						const point = pointIn(inner, r, t);
						if (!point) continue;
						bands.add(scoreAt(without, point.x, point.y).label);
					}
				}
				if (bands.size > 1)
					spilling.push(`${set.id} ${inner.label} covers ${[...bands].sort().join(' and ')}`);
			}
		}
		expect(spilling).toEqual([]);
	});
});

/** A point at polar position (r, t) inside a circular or elliptical zone, or null for any other shape. */
function pointIn(zone: Zone, r: number, t: number): { x: number; y: number } | null {
	const { shape } = zone;
	if (shape.kind === 'circle')
		return { x: (shape.cx ?? 0) + r * shape.r * Math.cos(t), y: (shape.cy ?? 0) + r * shape.r * Math.sin(t) };
	if (shape.kind === 'ellipse')
		return { x: shape.cx + r * shape.rx * Math.cos(t), y: shape.cy + r * shape.ry * Math.sin(t) };
	return null;
}

describe('insidePolygon', () => {
	const square: [number, number][] = [
		[-0.5, -0.5],
		[0.5, -0.5],
		[0.5, 0.5],
		[-0.5, 0.5]
	];

	it('accepts the interior and rejects the exterior', () => {
		expect(insidePolygon(square, 0, 0)).toBe(true);
		expect(insidePolygon(square, 0.9, 0)).toBe(false);
	});

	it('counts a point on the edge as inside, matching the line cutting rule', () => {
		expect(insidePolygon(square, 0.5, 0)).toBe(true);
		expect(insidePolygon(square, -0.5, -0.5)).toBe(true);
	});

	it('handles a concave outline, where a naive bounding box would be wrong', () => {
		const arrowhead: [number, number][] = [
			[-1, -1],
			[1, -1],
			[0, 0],
			[1, 1],
			[-1, 1]
		];
		expect(insidePolygon(arrowhead, -0.5, 0)).toBe(true);
		expect(insidePolygon(arrowhead, 0.6, 0)).toBe(false);
	});
});

describe('course rounds', () => {
	it('describes an unmarked course with no distance, for the archer to judge', () => {
		const unmarked = FIELD_ROUNDS.find((r) => r.id === 'wa-field-24-unmarked')!;
		expect(unmarked.stages[0].distance).toBeNull();
	});

	it('counts one arrow per target on a 3D course', () => {
		const ibo = FIELD_ROUNDS.find((r) => r.id === 'ibo-3d-20')!;
		expect(totalArrows(ibo)).toBe(20);
		expect(endSlots(ibo)).toHaveLength(20);
	});
});
