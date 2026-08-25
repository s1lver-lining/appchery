import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTournaments, parseDateSpan, parseUpdated } from './list';

const html = readFileSync('test/ianseo/TourList.html', 'utf8');
// The fixture was taken on this day, so "Today" in it resolves to a date the assertions can name.
const NOW = Date.UTC(2026, 7, 25, 12, 0);

describe('parseTournaments', () => {
	const list = parseTournaments(html, NOW);

	it('reads every competition once', () => {
		expect(list.length).toBeGreaterThan(20);
		expect(new Set(list.map((row) => row.toId)).size).toBe(list.length);
	});

	it('reads a row whole', () => {
		const games = list.find((row) => row.toId === '29775');
		expect(games).toMatchObject({
			code: '26MEDGAM',
			name: 'Taranto 2026 XX Mediterranean Games',
			organiser: 'International Committee of the Mediterranean Games',
			city: 'Crispiano',
			dates: '25-28 Aug',
			major: true
		});
		expect(games?.country).toEqual({ code: 'ITA', name: 'Italy' });
	});

	it('marks only the competitions the ianseo team run as major', () => {
		expect(list.some((row) => !row.major)).toBe(true);
		expect(list.filter((row) => row.major).length).toBeLessThan(list.length);
	});

	it('resolves the printed dates to a span', () => {
		const games = list.find((row) => row.toId === '29775');
		expect(games?.from).toBe(Date.UTC(2026, 7, 25));
		expect(games?.to).toBe(Date.UTC(2026, 7, 28));
	});

	it('never leaves a name empty', () => {
		expect(list.every((row) => row.name.length > 0)).toBe(true);
	});
});

describe('parseDateSpan', () => {
	it('reads one day', () => {
		expect(parseDateSpan('27 Feb', NOW)).toEqual({
			from: Date.UTC(2026, 1, 27),
			to: Date.UTC(2026, 1, 27)
		});
	});

	it('reads a run of days inside one month', () => {
		expect(parseDateSpan('25-28 Aug', NOW)).toEqual({
			from: Date.UTC(2026, 7, 25),
			to: Date.UTC(2026, 7, 28)
		});
	});

	it('reads a span across months', () => {
		expect(parseDateSpan('11 Jul - 11 Nov', NOW)).toEqual({
			from: Date.UTC(2026, 6, 11),
			to: Date.UTC(2026, 10, 11)
		});
	});

	it('keeps the years a span prints, including one that crosses new year', () => {
		expect(parseDateSpan('31 Oct 2026 - 20 Feb 2027', NOW)).toEqual({
			from: Date.UTC(2026, 9, 31),
			to: Date.UTC(2027, 1, 20)
		});
	});

	it('resolves a bare date to the nearest year, not to the current one', () => {
		const january = Date.UTC(2026, 0, 10, 12, 0);
		expect(parseDateSpan('28 Dec', january).from).toBe(Date.UTC(2025, 11, 28));
	});

	it('gives up rather than guessing at something it does not recognise', () => {
		expect(parseDateSpan('sometime soon', NOW)).toEqual({ from: null, to: null });
	});
});

describe('parseUpdated', () => {
	it('reads a stamped day', () => {
		expect(parseUpdated('22 Aug 16:16', NOW)).toBe(Date.UTC(2026, 7, 22, 16, 16));
	});

	it('reads today and yesterday against the clock it is given', () => {
		expect(parseUpdated('Today 13:51', NOW)).toBe(Date.UTC(2026, 7, 25, 13, 51));
		expect(parseUpdated('Yesterday 09:34', NOW)).toBe(Date.UTC(2026, 7, 24, 9, 34));
	});

	it('gives up on a line with no clock in it', () => {
		expect(parseUpdated('never', NOW)).toBe(null);
	});
});
