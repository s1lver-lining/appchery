/**
 * The bucket arithmetic on the two days a year a local day is not twenty four hours long.
 *
 * Pinned to a zone that observes the change rather than left to whatever the machine is set to: the
 * bug this guards cannot happen in UTC at all, so a suite run there would pass on the broken code
 * and say nothing. TZ is set before the module is imported, because that is when the dates are read.
 */
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, afterAll } from 'vitest';
import { grainEnd, volumeSeries, type Grain } from './stats';

afterAll(() => {
	if (ORIGINAL_TZ === undefined) delete process.env.TZ;
	else process.env.TZ = ORIGINAL_TZ;
});

/** The clocks go forward on 30 March 2025 in Paris, making that Sunday twenty three hours long. */
const SPRING_FORWARD = new Date(2025, 2, 30).getTime();

describe('a bucket that ends on the day the clocks go forward', () => {
	it('is a short day, which is what makes this worth testing', () => {
		const next = new Date(2025, 2, 31).getTime();
		expect((next - SPRING_FORWARD) / 3_600_000).toBe(23);
	});

	it('ends on itself rather than the day before', () => {
		// Taking a fixed twenty four hours off the next midnight landed at 23:00 the evening before.
		expect(new Date(grainEnd(SPRING_FORWARD, 'day')).toDateString()).toBe('Sun Mar 30 2025');
	});

	it('ends the week on the Sunday it covers', () => {
		const monday = new Date(2025, 2, 24).getTime();
		// A seven day bar was reading as a six day one, leaving out the day the clocks changed.
		expect(new Date(grainEnd(monday, 'week')).toDateString()).toBe('Sun Mar 30 2025');
	});

	it('ends the month on its last day', () => {
		const first = new Date(2025, 2, 1).getTime();
		expect(new Date(grainEnd(first, 'month')).toDateString()).toBe('Mon Mar 31 2025');
	});
});

describe('every bucket of two years', () => {
	it('ends the day before the next one starts, at every grain', () => {
		for (const grain of ['day', 'week', 'month'] as Grain[]) {
			const series = volumeSeries(
				[],
				new Date(2025, 0, 1).getTime(),
				new Date(2026, 11, 31).getTime(),
				grain,
				() => 'x'
			);
			expect(series.length).toBeGreaterThan(20);

			for (let i = 0; i + 1 < series.length; i++) {
				const next = new Date(series[i + 1].at);
				const lastDay = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1).getTime();
				expect(
					new Date(grainEnd(series[i].at, grain)).toDateString(),
					`${grain} bucket starting ${new Date(series[i].at).toDateString()}`
				).toBe(new Date(lastDay).toDateString());
				// And it never ends before it starts, which is what a short day used to make it do.
				expect(grainEnd(series[i].at, grain)).toBeGreaterThanOrEqual(series[i].at);
			}
		}
	});
});
