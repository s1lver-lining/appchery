import { describe, it, expect } from 'vitest';
import { TIMER_PRESETS, amberAt, lightFor, remainingAt, formatClock, BLASTS } from './timer';

describe('timer presets', () => {
	it('gives World Archery times: four minutes for six arrows, two for three', () => {
		const byKey = new Map(TIMER_PRESETS.map((preset) => [preset.key, preset]));
		expect(byKey.get('qualification6')).toMatchObject({ seconds: 240, arrows: 6 });
		expect(byKey.get('qualification3')).toMatchObject({ seconds: 120, arrows: 3 });
		expect(byKey.get('team6')).toMatchObject({ seconds: 120, arrows: 6 });
		expect(byKey.get('mixed4')).toMatchObject({ seconds: 80, arrows: 4 });
		expect(byKey.get('alternating')).toMatchObject({ seconds: 20, alternating: true });
	});
});

describe('amberAt', () => {
	it('turns amber for the last thirty seconds of a long clock', () => {
		expect(amberAt(240)).toBe(30);
		expect(amberAt(120)).toBe(30);
	});

	it('keeps a short clock from being amber for most of its life', () => {
		expect(amberAt(20)).toBe(10);
		expect(amberAt(10)).toBe(5);
	});
});

describe('lightFor', () => {
	it('is idle before the clock is started, and green once it is', () => {
		expect(lightFor(240, 240, false)).toBe('idle');
		expect(lightFor(240, 240, true)).toBe('green');
	});

	it('warns for the last thirty and stops at zero', () => {
		expect(lightFor(31, 240, true)).toBe('green');
		expect(lightFor(30, 240, true)).toBe('amber');
		expect(lightFor(0, 240, true)).toBe('red');
	});
});

describe('remainingAt', () => {
	it('counts from the start stamp, so a slept phone wakes up with the truth', () => {
		expect(remainingAt(1000, 240, 1000)).toBe(240);
		expect(remainingAt(1000, 240, 61_000)).toBe(180);
		expect(remainingAt(1000, 240, 999_000)).toBe(0);
	});
});

describe('formatClock', () => {
	it('reads as a clock rather than as a number of seconds', () => {
		expect(formatClock(240)).toBe('4:00');
		expect(formatClock(61)).toBe('1:01');
		expect(formatClock(9)).toBe('0:09');
		expect(formatClock(-5)).toBe('0:00');
	});
});

describe('signals', () => {
	it('keeps the blasts the rules define', () => {
		expect(BLASTS.lineUp).toBe(2);
		expect(BLASTS.start).toBe(1);
		expect(BLASTS.end).toBe(3);
		expect(BLASTS.stop).toBe(5);
	});
});
