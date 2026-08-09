import { describe, it, expect } from 'vitest';
import { startOfWeek, endOfWeek, isoWeek, groupByWeek, monthGrid } from './dates';

const at = (iso: string) => new Date(iso).getTime();

describe('startOfWeek', () => {
	it('starts weeks on Monday, so a Sunday belongs to the week that just ended', () => {
		// 2026-08-09 is a Sunday, so its week began on the 3rd.
		expect(new Date(startOfWeek(at('2026-08-09T12:00'))).getDate()).toBe(3);
		expect(new Date(startOfWeek(at('2026-08-03T00:30'))).getDate()).toBe(3);
		expect(new Date(endOfWeek(at('2026-08-03T00:30'))).getDate()).toBe(9);
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
	it('groups newest week first, with the items inside newest first too', () => {
		const groups = groupByWeek(
			[{ t: at('2026-08-03T10:00') }, { t: at('2026-08-09T10:00') }, { t: at('2026-07-28T10:00') }],
			(item) => item.t
		);
		expect(groups).toHaveLength(2);
		expect(groups[0].week).toBe(32);
		expect(groups[0].items.map((i) => i.t)).toEqual([at('2026-08-09T10:00'), at('2026-08-03T10:00')]);
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
