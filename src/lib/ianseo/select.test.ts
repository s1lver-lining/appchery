import { describe, it, expect } from 'vitest';
import {
	clubKey,
	clubsOf,
	countriesOf,
	EMPTY_FILTER,
	filterTournaments,
	guessedCountry,
	matches,
	whenOf
} from './select';
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

	it('ignores accents, which are written by the organiser and not typed by the archer', () => {
		const accented = tournament({ name: 'Championnat de Châteauroux', city: 'Châteauroux' });
		expect(matches(accented, 'chateauroux')).toBe(true);
		// And the other way about, for an archer whose keyboard does have them.
		expect(matches(shoot, 'Bretagné')).toBe(true);
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
	const filter = { ...EMPTY_FILTER, countries: ['FRA'], major: true };

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

	it('searches the whole of ianseo when the search says it may', () => {
		expect(filterTournaments(list, { ...filter, search: 'tokyo' }, NOW).map((row) => row.toId)).toEqual([
			'away'
		]);
	});

	it('searches only what the filters leave when the search is told to', () => {
		const narrowed = { ...filter, search: 'tokyo', searchEverywhere: false };
		expect(filterTournaments(list, narrowed, NOW)).toEqual([]);
		// The named shoot is in the archer's own country, so narrowing the search still finds it.
		expect(
			filterTournaments(list, { ...narrowed, search: 'a shoot' }, NOW).map((row) => row.toId)
		).toEqual(['home']);
	});
});

describe('filterTournaments, by distance', () => {
	const here = { latitude: 48.11, longitude: -1.67 };
	const list = [
		tournament({ toId: 'near' }),
		tournament({ toId: 'far' }),
		tournament({ toId: 'unknown' })
	];
	const distances = new Map<string, number | null>([
		['near', 30],
		['far', 400],
		['unknown', null]
	]);
	const filter = { ...EMPTY_FILTER, here, radiusKm: 100 };

	it('keeps what is inside the radius and drops what is beyond it', () => {
		const kept = filterTournaments(list, filter, NOW, distances).map((row) => row.toId);
		expect(kept).toContain('near');
		expect(kept).not.toContain('far');
	});

	it('keeps a competition whose town has not been looked up yet', () => {
		// The list narrows as the answers arrive rather than hiding what nobody has asked about.
		expect(filterTournaments(list, filter, NOW, distances).map((row) => row.toId)).toContain(
			'unknown'
		);
	});

	it('filters by nothing at all until the archer has offered where they are', () => {
		const nowhere = { ...filter, here: null };
		expect(filterTournaments(list, nowhere, NOW, distances)).toHaveLength(3);
	});

	it('filters by nothing when no radius was chosen', () => {
		expect(filterTournaments(list, { ...filter, radiusKm: null }, NOW, distances)).toHaveLength(3);
	});

	it('still answers a search that reaches past the radius', () => {
		const searching = { ...filter, search: 'a shoot', searchEverywhere: true };
		expect(filterTournaments(list, searching, NOW, distances)).toHaveLength(3);
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
			{ ...EMPTY_FILTER },
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
			{ ...EMPTY_FILTER },
			NOW
		);
		expect(ordered.map((row) => row.toId)).toEqual(['live', 'quiet']);
	});

	it('leaves the list it was given alone', () => {
		const given = [tournament({ toId: 'a', from: day(5) }), tournament({ toId: 'b', from: day(-5) })];
		filterTournaments(given, { ...EMPTY_FILTER }, NOW);
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

describe('clubsOf', () => {
	const list = [
		tournament({ toId: '1', organiser: 'Rennes Cie' }),
		tournament({ toId: '2', organiser: 'RENNES CIE' }),
		tournament({ toId: '3', organiser: 'Rennes  Cie ' }),
		tournament({ toId: '4', organiser: 'Les archers de Boé' }),
		tournament({ toId: '5', organiser: 'Tokyo club', country: { code: 'JPN', name: 'Japan' } })
	];

	it('gathers a club that spells itself differently on every competition it runs', () => {
		const clubs = clubsOf(list);
		expect(clubs[0]).toMatchObject({ key: 'rennes cie', count: 3 });
		// The spelling used most often, so the archer is offered the name they would recognise.
		expect(clubs[0].name).toBe('Rennes Cie');
	});

	it('puts the busiest club first, which is the one being looked for', () => {
		expect(clubsOf(list).map((club) => club.count)).toEqual([3, 1, 1]);
	});

	it('offers only the clubs of the countries being followed, and all of them where none is', () => {
		expect(clubsOf(list, ['JPN']).map((club) => club.name)).toEqual(['Tokyo club']);
		expect(clubsOf(list, []).map((club) => club.name)).toContain('Tokyo club');
	});

	it('leaves out a competition ianseo published with no organiser at all', () => {
		expect(clubsOf([tournament({ organiser: '  ' })])).toEqual([]);
	});

	it('reads two spellings of one club as one club', () => {
		expect(clubKey('LES ARCHERS DE BOÉ')).toBe(clubKey('Les archers de Boé'));
		expect(clubKey('Rennes  Cie ')).toBe(clubKey('Rennes Cie'));
	});
});

describe('filterTournaments by club', () => {
	const list = [
		tournament({ toId: '1', organiser: 'Rennes Cie' }),
		tournament({ toId: '2', organiser: 'RENNES CIE' }),
		tournament({ toId: '3', organiser: 'Les archers de Boé' })
	];

	it('keeps every competition a chosen club runs, however it wrote its own name', () => {
		const filter = { ...EMPTY_FILTER, clubs: ['rennes cie'] };
		expect(filterTournaments(list, filter, NOW).map((row) => row.toId)).toEqual(['1', '2']);
	});

	it('keeps every club until one is asked for', () => {
		expect(filterTournaments(list, EMPTY_FILTER, NOW)).toHaveLength(3);
	});

	it('narrows to a competition that is in both the club and the country asked for', () => {
		const abroad = tournament({ toId: '4', organiser: 'Rennes Cie', country: { code: 'JPN', name: 'Japan' } });
		const filter = { ...EMPTY_FILTER, clubs: ['rennes cie'], countries: ['FRA'], major: false };
		expect(filterTournaments([...list, abroad], filter, NOW).map((row) => row.toId)).toEqual(['1', '2']);
	});
});
