import { describe, it, expect } from 'vitest';
import { WA_FIELD, IFAA_FIELD, IBO_3D, ASA_3D, FIELD_ROUNDS, FIELD_SCORE_SETS } from './field';
import { scoreAt, insidePolygon, totalArrows, endSlots } from './geometry';
import { getScoreSet, roundNeedsVerification } from './seed';

// These score sets are unverified by design, so the tests guard the engine, not the point values.

describe('field score sets', () => {
	it('marks every field and 3D set as needing verification', () => {
		for (const set of FIELD_SCORE_SETS) expect(set.needsVerification).toBe(true);
	});

	it('flags rounds that use an unverified set, so the UI can warn', () => {
		for (const round of FIELD_ROUNDS) expect(roundNeedsVerification(round)).toBe(true);
	});

	it('resolves every field round to a registered score set', () => {
		for (const round of FIELD_ROUNDS) expect(getScoreSet(round.scoreSetId)).toBeDefined();
	});

	it('scores the centre of a concentric field face as the innermost zone', () => {
		expect(scoreAt(WA_FIELD, 0, 0).label).toBe('X');
		expect(scoreAt(IFAA_FIELD, 0, 0).label).toBe('X');
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
		expect(scoreAt(IBO_3D, -0.19, -0.02).label).toBe('11');
		expect(scoreAt(ASA_3D, 0.06, -0.02).label).toBe('12');
	});

	it('puts IBO and ASA inner rings in different places', () => {
		expect(scoreAt(IBO_3D, 0.06, -0.02).label).not.toBe('11');
		expect(scoreAt(ASA_3D, -0.19, -0.02).label).not.toBe('12');
	});

	it('scores a shot off the animal as a miss rather than the lowest zone', () => {
		expect(scoreAt(IBO_3D, 0.99, -0.99).countsAsHit).toBe(false);
	});

	it('respects the ellipse, so a shot level with the vitals but wide of them is not a hit', () => {
		const wide = scoreAt(IBO_3D, 0.45, -0.02);
		expect(wide.value).toBe(5);
	});
});

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
