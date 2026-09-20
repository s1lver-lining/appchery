import { describe, expect, it } from 'vitest';
import { extentOf, samplesOf, thin } from './series';
import type { TrackedFix } from './track';

/** A straight run north, a fix a second, fast enough that every one of them counts. */
function straight(count: number, extra: (i: number) => Partial<TrackedFix> = () => ({})): TrackedFix[] {
	return Array.from({ length: count }, (_, i) => ({
		at: 1_700_000_000_000 + i * 1000,
		lat: 48.1 + i * 0.00005,
		lon: -1.6,
		accuracy: 5,
		altitude: 70,
		speed: 5,
		elapsedSeconds: i,
		...extra(i)
	}));
}

describe('samplesOf', () => {
	it('carries the run forward, distance and clock together', () => {
		const samples = samplesOf(straight(40));
		expect(samples.length).toBeGreaterThan(30);
		expect(samples[0].distanceM).toBe(0);
		expect(samples[samples.length - 1].distanceM).toBeGreaterThan(200);
		expect(samples[samples.length - 1].seconds).toBe(39);
	});

	it('says nothing about a pace it has too little run to work out', () => {
		expect(samplesOf(straight(3)).every((one) => one.pace === null)).toBe(true);
	});

	it('measures the climb from where the run started, not from sea level', () => {
		const samples = samplesOf(straight(40, (i) => ({ altitude: 70 + i })));
		// Near zero rather than zero: the mean at the first sample can only look forward, up the hill.
		expect(Math.abs(samples[0].climbM ?? 99)).toBeLessThan(3);
		expect(samples[samples.length - 1].climbM).toBeGreaterThan(25);
	});

	it('leaves the climb unsaid where nothing reported a height', () => {
		expect(samplesOf(straight(10, () => ({ altitude: null })))[0].climbM).toBeNull();
	});

	it('carries the beat through untouched', () => {
		const samples = samplesOf(straight(20, (i) => ({ heartRate: 140 + i })));
		expect(samples[0].heartRate).toBe(140);
	});
});

describe('thin', () => {
	it('keeps both ends and evens out what is between them', () => {
		const thinned = thin([1, 2, 3, 4, 5, 6, 7, 8, 9], 3);
		expect(thinned).toEqual([1, 5, 9]);
	});

	it('leaves a short series alone', () => {
		expect(thin([1, 2, 3], 10)).toEqual([1, 2, 3]);
	});
});

describe('extentOf', () => {
	it('ignores the gaps', () => {
		expect(extentOf([null, 4, null, 9, 2])).toEqual({ min: 2, max: 9 });
	});

	it('has nothing to say about a series that is all gaps', () => {
		expect(extentOf([null, null])).toBeNull();
	});
});
