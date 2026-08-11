import { describe, it, expect } from 'vitest';
import { interpolateHeight, provenMarks, type MarkLike } from './sight';

function mark(partial: Partial<MarkLike> & { distance: number }): MarkLike {
	return { unit: 'm', height: null, interpolated: 0, ...partial };
}

describe('provenMarks', () => {
	it('keeps only shot in marks of the unit asked for, in distance order', () => {
		const marks = [
			mark({ distance: 30, height: '4.2' }),
			mark({ distance: 18, height: '2.1' }),
			mark({ distance: 50, height: '7.0', interpolated: 1 }),
			mark({ distance: 40, height: '5.5', unit: 'yd' }),
			mark({ distance: 60, height: null }),
			mark({ distance: 70, height: 'about here' })
		];
		expect(provenMarks(marks, 'm')).toEqual([
			{ distance: 18, height: 2.1 },
			{ distance: 30, height: 4.2 }
		]);
	});
});

describe('interpolateHeight', () => {
	it('says nothing until two marks have been proved', () => {
		expect(interpolateHeight([], 30, 'm')).toBeNull();
		expect(interpolateHeight([mark({ distance: 18, height: '2' })], 30, 'm')).toBeNull();
	});

	it('answers with the mark itself when that distance was already shot', () => {
		const marks = [mark({ distance: 18, height: '2' }), mark({ distance: 30, height: '4' })];
		expect(interpolateHeight(marks, 18, 'm')).toBe(2);
	});

	it('runs the line through two marks, inside and outside their range', () => {
		const marks = [mark({ distance: 20, height: '2' }), mark({ distance: 40, height: '4' })];
		expect(interpolateHeight(marks, 30, 'm')).toBe(3);
		expect(interpolateHeight(marks, 50, 'm')).toBe(5);
	});

	it('fits a parabola once three marks are known, which is the shape a flight has', () => {
		// height = 0.001 d² + 0.05 d + 1, sampled at four distances.
		const at = (d: number) => 0.001 * d * d + 0.05 * d + 1;
		const marks = [18, 30, 50, 70].map((d) => mark({ distance: d, height: String(at(d)) }));
		expect(interpolateHeight(marks, 40, 'm')).toBeCloseTo(at(40), 2);
		expect(interpolateHeight(marks, 60, 'm')).toBeCloseTo(at(60), 2);
	});

	it('ignores marks it worked out itself, so a guess never becomes evidence', () => {
		const proved = [mark({ distance: 20, height: '2' }), mark({ distance: 40, height: '4' })];
		const withGuess = [...proved, mark({ distance: 60, height: '99', interpolated: 1 })];
		expect(interpolateHeight(withGuess, 50, 'm')).toBe(interpolateHeight(proved, 50, 'm'));
	});

	it('keeps the two units apart, since a mark in yards proves nothing about metres', () => {
		const marks = [
			mark({ distance: 20, height: '2' }),
			mark({ distance: 40, height: '4' }),
			mark({ distance: 30, height: '9', unit: 'yd' })
		];
		expect(interpolateHeight(marks, 30, 'm')).toBe(3);
		expect(interpolateHeight(marks, 30, 'yd')).toBe(9);
	});
});
