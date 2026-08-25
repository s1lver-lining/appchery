import { describe, it, expect } from 'vitest';
import { distanceKm, placeKey, roundKm } from './distance';

describe('distanceKm', () => {
	it('is nothing between a point and itself', () => {
		expect(distanceKm({ latitude: 48.11, longitude: -1.67 }, { latitude: 48.11, longitude: -1.67 })).toBe(0);
	});

	it('measures a distance anybody can check', () => {
		// Rennes to Paris is a little over 300 km in a straight line.
		const km = distanceKm(
			{ latitude: 48.1111, longitude: -1.6743 },
			{ latitude: 48.8566, longitude: 2.3522 }
		);
		expect(km).toBeGreaterThan(300);
		expect(km).toBeLessThan(320);
	});

	it('measures the same distance in both directions', () => {
		const a = { latitude: 40.6, longitude: 17.23 };
		const b = { latitude: 48.11, longitude: -1.67 };
		expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6);
	});

	it('crosses the meridian and the equator without going wrong', () => {
		const km = distanceKm({ latitude: -1, longitude: -1 }, { latitude: 1, longitude: 1 });
		expect(km).toBeGreaterThan(310);
		expect(km).toBeLessThan(320);
	});

	it('handles the far side of the world rather than overflowing', () => {
		const km = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
		expect(km).toBeCloseTo(Math.PI * 6371, 0);
	});
});

describe('roundKm', () => {
	it('keeps a decimal only while one is worth having', () => {
		expect(roundKm(3.44)).toBe(3.4);
		expect(roundKm(42.6)).toBe(43);
	});
});

describe('placeKey', () => {
	it('is the same key however the town was written on the day', () => {
		expect(placeKey(['ALLUYES', 'France'])).toBe(placeKey([' alluyes ', 'france']));
	});

	it('ignores the accents one source writes and another does not', () => {
		expect(placeKey(['Pérols'])).toBe(placeKey(['Perols']));
	});

	it('drops the parts that are not there rather than leaving a gap', () => {
		expect(placeKey(['Rennes', null, undefined, ''])).toBe('rennes');
	});

	it('keeps two different towns apart', () => {
		expect(placeKey(['Rennes', 'France'])).not.toBe(placeKey(['Rennes', 'Italy']));
	});
});
