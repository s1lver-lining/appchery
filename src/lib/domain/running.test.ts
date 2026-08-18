import { describe, expect, it } from 'vitest';
import {
	clock,
	emptyRun,
	isRunDone,
	pace,
	parseRun,
	serialiseRun,
	speed,
	validateRun,
	type RunRecord
} from './running';

const run = (partial: Partial<RunRecord> = {}): RunRecord => ({
	distanceM: 5000,
	durationSeconds: 1650,
	effort: 'steady',
	...partial
});

describe('what a run works out', () => {
	it('gives a pace per kilometre', () => {
		expect(pace(run())).toBe(330);
		expect(clock(pace(run())!)).toBe('5:30');
	});

	it('gives a speed for the times that is the question', () => {
		expect(speed(run({ distanceM: 1000, durationSeconds: 250 }))).toBe(4);
	});

	it('works nothing out from half a run', () => {
		expect(pace(run({ distanceM: null }))).toBeNull();
		expect(pace(run({ durationSeconds: null }))).toBeNull();
		expect(speed(emptyRun())).toBeNull();
	});
});

describe('the clock', () => {
	it('writes minutes and seconds', () => {
		expect(clock(90)).toBe('1:30');
		expect(clock(9)).toBe('0:09');
	});

	it('adds hours only once there are any', () => {
		expect(clock(3599)).toBe('59:59');
		expect(clock(3600)).toBe('1:00:00');
		expect(clock(4271)).toBe('1:11:11');
	});

	it('never writes a negative time', () => {
		expect(clock(-5)).toBe('0:00');
	});
});

describe('a run in progress', () => {
	it('is finished once it has both of its numbers', () => {
		expect(isRunDone(emptyRun())).toBe(false);
		expect(isRunDone(run({ durationSeconds: null }))).toBe(false);
		expect(isRunDone(run({ effort: null }))).toBe(true);
	});
});

describe('storing a run', () => {
	it('comes back as it went in', () => {
		expect(parseRun(serialiseRun(run()))).toEqual(run());
		expect(parseRun(serialiseRun(emptyRun()))).toEqual(emptyRun());
	});

	it('survives a block written by something else', () => {
		expect(parseRun('not json')).toEqual(emptyRun());
		expect(parseRun('{"distanceM":"far","effort":"sprint"}')).toEqual(emptyRun());
	});
});

describe('validation', () => {
	it('passes an ordinary run', () => {
		expect(validateRun(run())).toEqual([]);
	});

	it('names a distance or a time nobody ran', () => {
		expect(validateRun(run({ distanceM: 900_000 }))).toEqual(['distance']);
		expect(validateRun(run({ durationSeconds: 2 }))).toEqual(['duration']);
	});

	it('passes a run half entered, because half a run is a run in progress', () => {
		expect(validateRun(emptyRun())).toEqual([]);
	});
});
