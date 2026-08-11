import { describe, it, expect } from 'vitest';
import { interpolateHeight, provenMarks, fittedSpeed, type MarkLike } from './sight';

function mark(partial: Partial<MarkLike> & { distance: number }): MarkLike {
	return { unit: 'm', height: null, interpolated: 0, ...partial };
}

describe('provenMarks', () => {
	it('keeps only shot in marks, in metres and in distance order', () => {
		const marks = [
			mark({ distance: 30, height: '4.2' }),
			mark({ distance: 18, height: '2.1' }),
			mark({ distance: 50, height: '7.0', interpolated: 1 }),
			mark({ distance: 20, height: '5.5', unit: 'yd' }),
			mark({ distance: 60, height: null }),
			mark({ distance: 70, height: 'about here' })
		];
		expect(provenMarks(marks)).toEqual([
			{ distance: 18, height: 2.1 },
			{ distance: 20 * 0.9144, height: 5.5 },
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

	it('reads the launch speed the marks imply, which is the one bow figure a tape holds', () => {
		const g = 9.80665;
		const at = (d: number) => 1.2 + 40 * Math.tan(0.5 * Math.asin((g * d) / 58 ** 2));
		const marks = [18, 30, 50, 70].map((d) => mark({ distance: d, height: at(d).toFixed(2) }));
		// Near, not exact: over one bow's range the curve is gentle, so speed, scale zero and sight
		// geometry trade against each other. The marks it predicts are right well before the speed is.
		expect(fittedSpeed(marks)!).toBeGreaterThan(50);
		expect(fittedSpeed(marks)!).toBeLessThan(66);
		// Two marks fit a line, not a flight: there is nothing left over to pin a speed on.
		expect(fittedSpeed(marks.slice(0, 2))).toBeNull();
	});

	it('ignores marks it worked out itself, so a guess never becomes evidence', () => {
		const proved = [mark({ distance: 20, height: '2' }), mark({ distance: 40, height: '4' })];
		const withGuess = [...proved, mark({ distance: 60, height: '99', interpolated: 1 })];
		expect(interpolateHeight(withGuess, 50, 'm')).toBe(interpolateHeight(proved, 50, 'm'));
	});

	it('reads yards and metres as one set of evidence, because the flight is the same', () => {
		// 30 yards is 27.4 metres, so a mark there is what a metre mark near it has to agree with.
		const marks = [mark({ distance: 20, height: '2' }), mark({ distance: 30, height: '3.5', unit: 'yd' })];
		const metres = interpolateHeight(marks, 27.432, 'm');
		expect(metres).toBe(3.5);
	});

	it('recovers a flight it was given, and holds up past the marks it was fitted to', () => {
		// Marks generated from the model itself: offset 1.2, gain 40, 58 m/s.
		const g = 9.80665;
		const at = (d: number) => 1.2 + 40 * Math.tan(0.5 * Math.asin((g * d) / 58 ** 2));
		const marks = [18, 30, 50].map((d) => mark({ distance: d, height: at(d).toFixed(2) }));
		expect(interpolateHeight(marks, 40, 'm')).toBeCloseTo(at(40), 1);
		// Well outside the range shot in, where a parabola drifts and the flight model does not.
		expect(interpolateHeight(marks, 90, 'm')).toBeCloseTo(at(90), 1);
	});

	it('says nothing for a distance no arrow of that flight could reach', () => {
		const g = 9.80665;
		const at = (d: number) => 1 + 30 * Math.tan(0.5 * Math.asin((g * d) / 45 ** 2));
		const marks = [18, 30, 50].map((d) => mark({ distance: d, height: at(d).toFixed(2) }));
		expect(interpolateHeight(marks, 400, 'm')).toBeNull();
	});
});
