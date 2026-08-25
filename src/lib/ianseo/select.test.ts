import { describe, it, expect } from 'vitest';
import { countriesOf, filterTournaments, guessedCountry, matches, whenOf } from './select';
import type { Tournament } from './types';

const NOW = Date.UTC(2026, 7, 25, 12, 0);
const day = (offset: number) => Date.UTC(2026, 7, 25 + offset);

function tournament(over: Partial<Tournament> = {}): Tournament {
	return {
		toId: over.toId ?? '1',
		code: 'CODE',
		name: 'A shoot',
		organiser: 'A club',
		country: { code: 'FRA', name: 'France' },
		city: 'Rennes',
		dates: '',
		from: day(0),
		to: day(0),
		updatedAt: NOW,
		major: false,
		...over
	};
}

describe('whenOf', () => {
	it('calls a competition running from its first morning to the end of its last day', () => {
		const shoot = tournament({ from: day(-1), to: day(1) });
		expect(whenOf(shoot, NOW)).toBe('running');
		expect(whenOf(shoot, day(-2))).toBe('upcoming');
		expect(whenOf(shoot, day(3))).toBe('finished');
	});

	it('keeps a one day competition running for the whole of that day', () => {
		const shoot = tournament({ from: day(0), to: day(0) });
		expect(whenOf(shoot, day(0))).toBe('running');
		expect(whenOf(shoot, day(0) + 23 * 3600_000)).toBe('running');
		expect(whenOf(shoot, day(1) + 3600_000)).toBe('finished');
	});

	it('treats a competition with no readable date as finished rather than as coming up', () => {
		expect(whenOf(tournament({ from: null, to: null }), NOW)).toBe('finished');
	});
});

describe('matches', () => {
	const shoot = tournament({ name: 'Championnat de Bretagne', city: 'Rennes', code: '26BRE' });

	it('takes the words in any order, and ignores case', () => {
		expect(matches(shoot, 'bretagne rennes')).toBe(true);
		expect(matches(shoot, 'RENNES BRETAGNE')).toBe(true);
	});

	it('wants every word, not any of them', () => {
		expect(matches(shoot, 'bretagne paris')).toBe(false);
	});

	it('searches the code and the country as well as the name', () => {
		expect(matches(shoot, '26bre')).toBe(true);
		expect(matches(shoot, 'france')).toBe(true);
	});

	it('keeps everything when nothing was typed', () => {
		expect(matches(shoot, '   ')).toBe(true);
	});
});

describe('filterTournaments', () => {
	const list = [
		tournament({ toId: 'home', country: { code: 'FRA', name: 'France' } }),
		tournament({ toId: 'away', country: { code: 'JPN', name: 'Japan' }, city: 'Tokyo' }),
		tournament({ toId: 'games', country: { code: 'ITA', name: 'Italy' }, major: true, name: 'Games' })
	];
	const filter = { countries: ['FRA'], major: true, search: '' };

	it('keeps the archer’s own country and the events the ianseo team run', () => {
		expect(filterTournaments(list, filter, NOW).map((row) => row.toId)).toEqual(['home', 'games']);
	});

	it('drops the major events when the archer says they do not want them', () => {
		expect(
			filterTournaments(list, { ...filter, major: false }, NOW).map((row) => row.toId)
		).toEqual(['home']);
	});

	it('keeps every country when none has been chosen', () => {
		expect(filterTournaments(list, { ...filter, countries: [] }, NOW)).toHaveLength(3);
	});

	it('searches the whole of ianseo, not only the countries being followed', () => {
		expect(filterTournaments(list, { ...filter, search: 'tokyo' }, NOW).map((row) => row.toId)).toEqual([
			'away'
		]);
	});

	it('shows what is being shot now, then what is next, then what finished last', () => {
		const ordered = filterTournaments(
			[
				tournament({ toId: 'later', from: day(9), to: day(9) }),
				tournament({ toId: 'long-gone', from: day(-30), to: day(-30) }),
				tournament({ toId: 'soon', from: day(2), to: day(2) }),
				tournament({ toId: 'now', from: day(-1), to: day(1) }),
				tournament({ toId: 'just-gone', from: day(-3), to: day(-3) })
			],
			{ countries: [], major: true, search: '' },
			NOW
		);
		expect(ordered.map((row) => row.toId)).toEqual(['now', 'soon', 'later', 'just-gone', 'long-gone']);
	});

	it('orders two competitions being shot at once by which one published last', () => {
		const ordered = filterTournaments(
			[
				tournament({ toId: 'quiet', from: day(0), to: day(1), updatedAt: NOW - 7200_000 }),
				tournament({ toId: 'live', from: day(0), to: day(1), updatedAt: NOW - 60_000 })
			],
			{ countries: [], major: true, search: '' },
			NOW
		);
		expect(ordered.map((row) => row.toId)).toEqual(['live', 'quiet']);
	});

	it('leaves the list it was given alone', () => {
		const given = [tournament({ toId: 'a', from: day(5) }), tournament({ toId: 'b', from: day(-5) })];
		filterTournaments(given, { countries: [], major: true, search: '' }, NOW);
		expect(given.map((row) => row.toId)).toEqual(['a', 'b']);
	});
});

describe('countriesOf', () => {
	it('counts the competitions each country holds, in the order they are read in', () => {
		expect(
			countriesOf([
				tournament({ country: { code: 'JPN', name: 'Japan' } }),
				tournament({ country: { code: 'FRA', name: 'France' } }),
				tournament({ country: { code: 'JPN', name: 'Japan' } }),
				tournament({ country: null })
			])
		).toEqual([
			{ code: 'FRA', name: 'France', count: 1 },
			{ code: 'JPN', name: 'Japan', count: 2 }
		]);
	});
});

describe('guessedCountry', () => {
	const list = [
		tournament({ country: { code: 'FRA', name: 'France' } }),
		tournament({ country: { code: 'GER', name: 'Germany' } })
	];

	it('reads the region out of a plain language tag', () => {
		expect(guessedCountry(list, ['fr'])).toBe('FRA');
	});

	it('finds a country whose archery code looks nothing like the one the device reports', () => {
		expect(guessedCountry(list, ['de-DE'])).toBe('GER');
	});

	it('knows the countries ianseo names differently from the browser', () => {
		const british = [tournament({ country: { code: 'GBR', name: 'Great Britain' } })];
		expect(guessedCountry(british, ['en-GB'])).toBe('GBR');
	});

	it('tries the languages in the order the device prefers them', () => {
		expect(guessedCountry(list, ['en-US', 'fr-FR'])).toBe('FRA');
	});

	it('offers nothing rather than a country ianseo has no competitions in', () => {
		expect(guessedCountry(list, ['ja-JP'])).toBe(null);
		expect(guessedCountry(list, [])).toBe(null);
	});
});
