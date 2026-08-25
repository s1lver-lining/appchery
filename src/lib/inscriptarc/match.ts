import type { Entry } from './types';

/**
 * Which competition an entry form belongs to.
 *
 * Nothing links the two: Inscript'Arc knows a club and a name, ianseo knows a town and a name, and
 * neither carries the other's identifier. So the match is made on what they do share, and made
 * cautiously: handing an archer the entry form for the wrong competition is worse than handing them
 * none at all. Both the days and the place have to agree before a link is offered.
 */

export type Matchable = {
	name: string;
	/** The town the competition is held in, which is the half of the match that has to be right. */
	town: string;
	from: number | null;
	to: number | null;
};

export function normalise(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** The days have to touch. A competition and its entry form are the same event or they are not. */
export function overlaps(a: Matchable, b: Entry): boolean {
	const from = a.from ?? a.to;
	const to = a.to ?? a.from;
	if (from === null || to === null || b.from === null || b.to === null) return false;
	return from <= b.to && b.from <= to;
}

/**
 * Words too common in the name of an archery competition to tell two of them apart. A town called
 * Tir would be unfortunate, but every one of these appears in half the calendar.
 */
const COMMON = new Set([
	'tir',
	'arc',
	'archers',
	'archer',
	'compagnie',
	'cie',
	'concours',
	'championnat',
	'trophee',
	'grand',
	'prix',
	'open',
	'salle',
	'exterieur',
	'campagne',
	'nature',
	'beursault',
	'international',
	'national',
	'regional',
	'departemental',
	'club',
	'sport',
	'sportif',
	'de',
	'du',
	'des',
	'la',
	'le',
	'les',
	'et',
	'en',
	'sur',
	'aux',
	'au'
]);

/** The words of a name worth recognising it by: long enough to mean something, and its own. */
export function marks(value: string): string[] {
	return normalise(value)
		.split(' ')
		.filter((word) => word.length >= 4 && !COMMON.has(word));
}

/**
 * The entry form for a competition, or nothing. The town has to appear in the entry's own words,
 * because the town is the one thing an entry form never gets wrong: the club is named after it,
 * and two competitions on the same days in the same town are the same competition.
 */
export function entryFor(competition: Matchable, entries: Entry[]): Entry | null {
	const town = normalise(competition.town);
	if (town.length < 4) return null;

	const candidates = entries.filter((entry) => {
		if (!overlaps(competition, entry)) return false;
		const words = ` ${normalise(`${entry.name} ${entry.club}`)} `;
		return words.includes(` ${town} `);
	});

	// Two entries answering to the same town on the same days is an ambiguity, not a match.
	return candidates.length === 1 ? candidates[0] : null;
}

/** The entries that belong to no competition on screen, which is most of them and the useful half. */
export function unmatched(competitions: Matchable[], entries: Entry[]): Entry[] {
	const taken = new Set(
		competitions.map((one) => entryFor(one, entries)?.site).filter((site): site is string => !!site)
	);
	return entries.filter((entry) => !taken.has(entry.site));
}
