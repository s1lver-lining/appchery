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
};

export const EMPTY_FILTER: Filter = { countries: [], major: true, search: '' };

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
	const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = [
		tournament.name,
		tournament.code,
		tournament.organiser,
		tournament.city,
		tournament.country?.name ?? '',
		tournament.country?.code ?? ''
	]
		.join(' ')
		.toLowerCase();
	return terms.every((term) => haystack.includes(term));
}

export function filterTournaments(list: Tournament[], filter: Filter, now = Date.now()): Tournament[] {
	const wanted = new Set(filter.countries);
	const kept = list.filter((tournament) => {
		if (!matches(tournament, filter.search)) return false;
		// A search is asked of the whole of ianseo: somebody looking for a competition by name has
		// already said which one they mean, and hiding it behind a country filter would be perverse.
		if (filter.search.trim()) return true;
		if (wanted.size === 0) return true;
		if (filter.major && tournament.major) return true;
		return tournament.country !== null && wanted.has(tournament.country.code);
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
