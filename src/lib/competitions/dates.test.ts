import { describe, it, expect } from 'vitest';
import { competitionDates } from './dates';

const day = (d: number, m = 8, y = 2026) => Date.UTC(y, m - 1, d);
/** Read in the same year as the competition, where the year is not worth the room. */
const IN_YEAR = Date.UTC(2026, 0, 1);
/** Read the year before, where it is. */
const BEFORE = Date.UTC(2025, 5, 1);

const on = (locale: string, from: number | null, to: number | null, now = IN_YEAR, dates = 'as published') =>
	competitionDates(locale, { from, to, dates }, now);

describe('competitionDates', () => {
	it('says one day once', () => {
		expect(on('en', day(23), day(23))).toBe('Aug 23');
		expect(on('fr', day(23), day(23))).toBe('23 août');
	});

	/**
	 * The rule this exists for: the month is said once, and which end of the range it belongs on is
	 * the language's business rather than the app's.
	 */
	it('puts the month where the language puts it', () => {
		expect(on('en', day(25), day(28))).toMatch(/^Aug 25\s*[-–]\s*28$/);
		expect(on('fr', day(25), day(28))).toMatch(/^25\s*[-–]\s*28 août$/);
	});

	it('says both months for a span that crosses one', () => {
		expect(on('en', day(28, 8), day(3, 9))).toMatch(/Aug 28.*Sep 3/);
	});

	it('leaves the year off a competition in the year being read', () => {
		expect(on('en', day(25), day(28))).not.toMatch(/2026/);
	});

	it('keeps the year on a competition that is not in it', () => {
		expect(on('en', day(25), day(28), BEFORE)).toMatch(/2026/);
	});

	it('says the day it has when it only has one of them', () => {
		expect(on('en', day(12), null)).toBe('Aug 12');
		expect(on('en', null, day(12))).toBe('Aug 12');
	});

	it('falls back to the words the source published when it could not be read', () => {
		expect(on('en', null, null, IN_YEAR, 'sometime soon')).toBe('sometime soon');
	});
});
