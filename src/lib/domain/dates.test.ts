import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	startOfWeek,
	endOfWeek,
	isoWeek,
	groupByWeek,
	monthGrid,
	timeOfDay,
	startOfMonth,
	startOfYear
} from './dates';

const at = (iso: string) => new Date(iso).getTime();

describe('startOfMonth and startOfYear', () => {
	it('start on the first, so a figure headed "this month" is not the last thirty days', () => {
		const start = new Date(startOfMonth(at('2026-09-02T09:00')));
		expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 8, 1]);
		// The 31st of August is the month before, however few days ago it was.
		expect(at('2026-08-31T23:00') >= startOfMonth(at('2026-09-02T09:00'))).toBe(false);
		expect(at('2026-09-01T00:00') >= startOfMonth(at('2026-09-02T09:00'))).toBe(true);
	});

	it('start the year on the first of January rather than twelve months back', () => {
		const start = new Date(startOfYear(at('2026-09-02T09:00')));
		expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 0, 1]);
		expect(at('2025-12-31T23:00') >= startOfYear(at('2026-09-02T09:00'))).toBe(false);
	});

	it('land on midnight even where the clocks turn at midnight', () => {
		const zone = process.env.TZ;
		process.env.TZ = 'America/Santiago';
		try {
			// Santiago moved its clocks forward at midnight on the first of September 2016.
			expect(new Date(startOfMonth(at('2016-09-15T12:00'))).getDate()).toBe(1);
		} finally {
			process.env.TZ = zone;
		}
	});
});

describe('startOfWeek', () => {
	it('starts weeks on Monday, so a Sunday belongs to the week that just ended', () => {
		// 2026-08-09 is a Sunday, so its week began on the 3rd.
		expect(new Date(startOfWeek(at('2026-08-09T12:00'))).getDate()).toBe(3);
		expect(new Date(startOfWeek(at('2026-08-03T00:30'))).getDate()).toBe(3);
		expect(new Date(endOfWeek(at('2026-08-03T00:30'))).getDate()).toBe(9);
	});
});

describe('startOfWeek across a clock change', () => {
	const zone = process.env.TZ;
	// Santiago turns its clocks at midnight, so a week start counted in fixed days lands at 01:00.
	beforeAll(() => (process.env.TZ = 'America/Santiago'));
	afterAll(() => (process.env.TZ = zone));

	it('starts the week at midnight whatever the clocks did that night', () => {
		// The Sunday is the day that counts back over the change, so it is the day that used to slip.
		const start = new Date(startOfWeek(at('2016-05-15T12:00')));
		expect(start.getDay()).toBe(1);
		expect(start.getHours()).toBe(0);
	});

	it('puts every day of that week in one bucket', () => {
		const starts = new Set(
			['09', '10', '11', '12', '13', '14', '15'].map((day) =>
				startOfWeek(at(`2016-05-${day}T12:00`))
			)
		);
		expect(starts.size).toBe(1);
	});
});

describe('isoWeek', () => {
	it('numbers the week holding the first Thursday as week 1', () => {
		expect(isoWeek(at('2026-01-01T12:00'))).toBe(1);
		expect(isoWeek(at('2026-08-09T12:00'))).toBe(32);
		// 2027-01-01 is a Friday, so it still belongs to the last week of 2026.
		expect(isoWeek(at('2027-01-01T12:00'))).toBe(53);
	});
});

describe('groupByWeek', () => {
	it('groups oldest week first, with the items inside oldest first too', () => {
		const groups = groupByWeek(
			[{ t: at('2026-08-03T10:00') }, { t: at('2026-08-09T10:00') }, { t: at('2026-07-28T10:00') }],
			(item) => item.t
		);
		expect(groups).toHaveLength(2);
		expect(groups[0].week).toBe(31);
		expect(groups[1].week).toBe(32);
		expect(groups[1].items.map((i) => i.t)).toEqual([at('2026-08-03T10:00'), at('2026-08-09T10:00')]);
	});
});

describe('monthGrid', () => {
	it('returns whole weeks so the grid never needs padding', () => {
		const grid = monthGrid(2026, 7);
		expect(grid.length % 7).toBe(0);
		expect(new Date(grid[0].at).getDay()).toBe(1);
		expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
	});
});

describe('timeOfDay', () => {
	it('names each part of the day at its boundaries', () => {
		expect(timeOfDay(at('2026-08-10T06:00'))).toBe('morning');
		expect(timeOfDay(at('2026-08-10T11:59'))).toBe('morning');
		expect(timeOfDay(at('2026-08-10T12:00'))).toBe('afternoon');
		expect(timeOfDay(at('2026-08-10T17:59'))).toBe('afternoon');
		expect(timeOfDay(at('2026-08-10T18:00'))).toBe('evening');
		expect(timeOfDay(at('2026-08-10T22:59'))).toBe('evening');
	});

	it('keeps the small hours with the night before', () => {
		expect(timeOfDay(at('2026-08-10T23:30'))).toBe('night');
		expect(timeOfDay(at('2026-08-10T03:00'))).toBe('night');
		expect(timeOfDay(at('2026-08-10T05:59'))).toBe('night');
	});
});
