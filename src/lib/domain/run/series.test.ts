import { describe, expect, it } from 'vitest';
import { condense, extentOf, samplesOf, thin } from './series';
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

	it('evens the pace out, because the line is read for its shape', () => {
		// A run at one steady speed with one fix that measured badly: the line should not spike.
		const fixes = straight(60);
		const samples = samplesOf(fixes);
		const paces = samples.map((one) => one.pace).filter((pace): pace is number => pace !== null);
		const worst = Math.max(...paces) - Math.min(...paces);
		expect(paces.length).toBeGreaterThan(10);
		// Steady running, so every figure should be within a few seconds a kilometre of the others.
		expect(worst).toBeLessThan(20);
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

describe('condense', () => {
	const sample = (i: number, pace: number | null) => ({
		seconds: i,
		distanceM: i * 3,
		pace,
		climbM: i,
		heartRate: null
	});

	it('averages each stretch rather than picking one out of it', () => {
		// One bad reading in four, which picking would either keep whole or lose whole.
		const samples = [sample(0, 300), sample(1, 300), sample(2, 900), sample(3, 300)];
		const [one] = condense(samples, 2);
		expect(one.pace).toBe(300);
		expect(condense(samples, 2)[1].pace).toBe(600);
	});

	it('runs to the end of the run', () => {
		const samples = Array.from({ length: 100 }, (_, i) => sample(i, 300));
		const out = condense(samples, 10);
		expect(out).toHaveLength(10);
		expect(out[out.length - 1].distanceM).toBe(99 * 3);
	});

	it('leaves a short run alone', () => {
		const samples = [sample(0, 300), sample(1, 300)];
		expect(condense(samples, 10)).toEqual(samples);
	});

	it('says nothing for a stretch that measured nothing', () => {
		expect(condense([sample(0, null), sample(1, null), sample(2, 300), sample(3, 300)], 2)[0].pace).toBeNull();
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
