import type { Point } from '$lib/competitions/distance';
import { plain } from './find';
import type { Tournament } from './types';

/**
 * Which competitions an archer is shown, out of the several thousand ianseo hosts.
 *
 * A local shoot in another country is somebody else's Sunday, so the list is the archer's own
 * countries plus the events the ianseo team run themselves, which in practice are the national
 * championships and the international games. Everything else is still reachable by searching for it:
 * a filter that hides a competition an archer has been invited to would be the app being wrong.
 */

export type When = 'running' | 'upcoming' | 'finished';

export type Filter = {
	/** Country codes, as the flags carry them. Empty means every country, which is what a search wants. */
	countries: string[];
	/** Whether the competitions the ianseo team run are shown whatever country they are held in. */
	major: boolean;
	search: string;
	/**
	 * Whether a search is asked of the whole of ianseo or only of what the filters already leave.
	 * Its own switch rather than a rule: an archer looking up a competition by name usually means one
	 * anywhere, and an archer narrowing their own list usually does not.
	 */
	searchEverywhere: boolean;
	/**
	 * The clubs whose competitions are wanted, by the key `clubKey` puts them under. Empty means every
	 * club, which is what an archer who has not asked about a club at all means.
	 */
	clubs: string[];
	/** Kilometres from `here`, or null for no distance filter at all. */
	radiusKm: number | null;
	/** Where the archer is, which they have to have offered: nothing here asks for it. */
	here: Point | null;
};

export const EMPTY_FILTER: Filter = {
	countries: [],
	major: true,
	search: '',
	searchEverywhere: true,
	clubs: [],
	radiusKm: null,
	here: null
};

const DAY = 86400_000;

/** A competition is running from the morning of its first day to the end of its last. */
export function whenOf(tournament: Tournament, now: number): When {
	const from = tournament.from ?? tournament.to;
	const to = tournament.to ?? tournament.from;
	if (from === null || to === null) return 'finished';
	if (now < from) return 'upcoming';
	return now < to + DAY ? 'running' : 'finished';
}

/** Words in any order, against everything printed on the row: a name, a town, a club, a code. */
export function matches(tournament: Tournament, search: string): boolean {
	// Folded on both sides, like the search inside a document and the one over the outings: a
	// competition is named in the organiser's language and typed in whatever the archer's keyboard has.
	const terms = plain(search).split(' ').filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = plain(
		[
			tournament.name,
			tournament.code,
			tournament.organiser,
			tournament.city,
			tournament.country?.name ?? '',
			tournament.country?.code ?? ''
		].join(' ')
	);
	return terms.every((term) => haystack.includes(term));
}

export function filterTournaments(
	list: Tournament[],
	filter: Filter,
	now = Date.now(),
	/** How far away each competition is, where that is known. Absent means nothing is filtered by it. */
	distances?: Map<string, number | null>
): Tournament[] {
	const wanted = new Set(filter.countries);

	const near = (tournament: Tournament) => {
		if (filter.radiusKm === null || !filter.here || !distances) return true;
		const km = distances.get(tournament.toId);
		// A competition whose town has not been looked up yet is kept: the list narrows as the answers
		// arrive, rather than hiding what it has not got round to asking about.
		return km === null || km === undefined || km <= filter.radiusKm;
	};

	const clubs = new Set(filter.clubs);

	const mine = (tournament: Tournament) => {
		if (!near(tournament)) return false;
		if (clubs.size > 0 && !clubs.has(clubKey(tournament.organiser))) return false;
		if (wanted.size === 0) return true;
		if (filter.major && tournament.major) return true;
		return tournament.country !== null && wanted.has(tournament.country.code);
	};

	const kept = list.filter((tournament) => {
		if (!matches(tournament, filter.search)) return false;
		if (!filter.search.trim()) return mine(tournament);
		return filter.searchEverywhere ? true : mine(tournament);
	});

	return kept.sort((a, b) => order(a, b, now));
}

const RANK: Record<When, number> = { running: 0, upcoming: 1, finished: 2 };

/**
 * What is being shot now, then what is coming soonest, then what finished most recently. A list of
 * competitions is read forwards from today in both directions, never from the beginning of time.
 */
function order(a: Tournament, b: Tournament, now: number): number {
	const rank = RANK[whenOf(a, now)] - RANK[whenOf(b, now)];
	if (rank !== 0) return rank;

	const when = whenOf(a, now);
	const start = (tournament: Tournament) => tournament.from ?? tournament.to ?? 0;
	const end = (tournament: Tournament) => tournament.to ?? tournament.from ?? 0;
	if (when === 'finished') return end(b) - end(a);
	if (when === 'upcoming') return start(a) - start(b);
	// Two competitions being shot at once are ordered by which one ianseo published to last.
	return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

/**
 * A club under one name however it wrote itself down. The same club spells itself `GOSIER` on one
 * competition and `Gosier` on the next, and ianseo takes whatever the organiser typed, so the key is
 * the name with its case, accents and spacing taken out of the argument.
 */
export function clubKey(organiser: string): string {
	return plain(organiser);
}

/**
 * Every club with a competition in the list, under the spelling it uses most often: the archer is
 * offered the name they would recognise rather than whichever one ianseo happened to publish first.
 *
 * Narrowed to the countries being followed where there are any. Ianseo carries two thousand clubs
 * and one country's worth of them is a list somebody can actually read down.
 */
export function clubsOf(
	list: Tournament[],
	countries: string[] = []
): { key: string; name: string; count: number }[] {
	const wanted = new Set(countries);
	const found = new Map<string, { key: string; count: number; spellings: Map<string, number> }>();

	for (const tournament of list) {
		if (!tournament.organiser.trim()) continue;
		if (wanted.size > 0 && !(tournament.country && wanted.has(tournament.country.code))) continue;

		const key = clubKey(tournament.organiser);
		// Tidied before it is counted: how a name was spaced is not one of the ways of spelling it.
		const spelling = tournament.organiser.replace(/\s+/g, ' ').trim();
		const at = found.get(key) ?? { key, count: 0, spellings: new Map<string, number>() };
		at.count++;
		at.spellings.set(spelling, (at.spellings.get(spelling) ?? 0) + 1);
		found.set(key, at);
	}

	return [...found.values()]
		.map((club) => ({
			key: club.key,
			name: [...club.spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
			count: club.count
		}))
		// Busiest first: a club that runs thirty competitions is the one being looked for.
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Every country ianseo currently has a competition in, named, so the filter can offer them. */
export function countriesOf(list: Tournament[]): { code: string; name: string; count: number }[] {
	const found = new Map<string, { code: string; name: string; count: number }>();
	for (const tournament of list) {
		if (!tournament.country) continue;
		const at = found.get(tournament.country.code) ?? { ...tournament.country, count: 0 };
		at.count++;
		found.set(tournament.country.code, at);
	}
	return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The country the app should offer to follow before the archer has said which. The device's own
 * region is a guess, so it is only ever an offer: an archer living one country over from where their
 * phone thinks it is would otherwise silently lose their own list.
 *
 * Matched on the country's name rather than on its code, because archery numbers countries the way
 * the Olympic movement does and a phone reports ISO, and the two agree on almost nothing: GER and DE
 * for the same Germany. The names ianseo writes on its flags are the ones a browser already knows.
 */
export function guessedCountry(list: Tournament[], locales: readonly string[]): string | null {
	const byName = new Map<string, string>();
	for (const tournament of list) {
		if (tournament.country) byName.set(tournament.country.name.toLowerCase(), tournament.country.code);
	}

	let names: Intl.DisplayNames;
	try {
		names = new Intl.DisplayNames(['en'], { type: 'region' });
	} catch {
		return null;
	}

	for (const tag of locales) {
		let region: string | undefined;
		try {
			region = new Intl.Locale(tag).maximize().region;
		} catch {
			continue;
		}
		if (!region) continue;
		const name = (ALIASES[region] ?? names.of(region) ?? '').toLowerCase();
		const code = byName.get(name);
		if (code) return code;
	}
	return null;
}

/** Where the name a browser gives a region is not the name ianseo writes under its flag. */
const ALIASES: Record<string, string> = {
	GB: 'Great Britain',
	US: 'United States of America',
	KR: 'Korea',
	IR: 'Islamic Republic of Iran',
	TW: 'Chinese Taipei',
	HK: 'Hong Kong, China',
	MO: 'Macao, China',
	VE: 'Venezuela',
	BO: 'Bolivia',
	MD: 'Moldova',
	SY: 'Syria',
	TZ: 'Tanzania',
	CD: 'Democratic Republic of the Congo',
	LA: 'Laos',
	VN: 'Vietnam',
	CZ: 'Czech Republic'
};
