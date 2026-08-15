import { describe, it, expect } from 'vitest';
import { ratioOf, bandOf, positionOf, IDEAL_RATIO, RATIO_MIN, RATIO_MAX } from './ratio';

describe('mass to draw weight', () => {
	it('divides the mass in grams by the weight in pounds', () => {
		expect(ratioOf(3150, 45)).toBe(70);
	});

	it('has no answer until both figures are there', () => {
		expect(ratioOf(0, 45)).toBeNull();
		expect(ratioOf(3150, 0)).toBeNull();
	});

	it('bands a reading by how far it sits from the ideal, either side', () => {
		expect(bandOf(IDEAL_RATIO)).toBe('good');
		expect(bandOf(IDEAL_RATIO - 5)).toBe('good');
		expect(bandOf(IDEAL_RATIO + 6)).toBe('fair');
		expect(bandOf(IDEAL_RATIO - 15)).toBe('fair');
		expect(bandOf(IDEAL_RATIO + 16)).toBe('poor');
	});

	it('keeps a reading past either end of the scale on the scale', () => {
		expect(positionOf(IDEAL_RATIO)).toBeCloseTo(0.5);
		expect(positionOf(RATIO_MIN - 40)).toBe(0);
		expect(positionOf(RATIO_MAX + 40)).toBe(1);
	});
});
