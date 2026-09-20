import { describe, expect, it } from 'vitest';
import { timeInZones, zoneBand, zoneOf } from './zones';
import type { TrackedFix } from './track';

describe('zoneOf', () => {
	it("puts a beat where it belongs against that runner's own ceiling", () => {
		expect(zoneOf(100, 200)).toBe(1);
		expect(zoneOf(125, 200)).toBe(2);
		expect(zoneOf(145, 200)).toBe(3);
		expect(zoneOf(165, 200)).toBe(4);
		expect(zoneOf(195, 200)).toBe(5);
	});

	it('says nothing where there is nothing to measure against', () => {
		expect(zoneOf(150, 0)).toBeNull();
		expect(zoneOf(null, 200)).toBeNull();
		// Under half of maximum is not a zone, it is sitting down.
		expect(zoneOf(80, 200)).toBeNull();
	});
});

describe('zoneBand', () => {
	it('says what a zone covers, and leaves the top one open', () => {
		expect(zoneBand(1, 200)).toEqual({ from: 100, to: 119 });
		expect(zoneBand(5, 200)).toEqual({ from: 180, to: null });
	});
});

describe('timeInZones', () => {
	const fix = (elapsedSeconds: number, heartRate: number | null): TrackedFix => ({
		at: 1_700_000_000_000 + elapsedSeconds * 1000,
		lat: 48.1,
		lon: -1.6,
		accuracy: 5,
		altitude: 70,
		speed: 3,
		elapsedSeconds,
		heartRate
	});

	it('counts each stretch against the zone the runner was in for it', () => {
		const held = timeInZones([fix(0, 150), fix(10, 150), fix(20, 190)], 200);
		expect(held[3]).toBe(20);
		expect(held[5]).toBe(0);
	});

	it('counts nothing where the clock did not move, which is a run being held', () => {
		expect(timeInZones([fix(0, 150), fix(0, 150)], 200)[3]).toBe(0);
	});

	it('has nothing to say without a maximum', () => {
		expect(timeInZones([fix(0, 150), fix(10, 150)], 0)[3]).toBe(0);
	});
});
