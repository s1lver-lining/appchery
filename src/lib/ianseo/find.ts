import type { BracketRound, DocumentSection } from './types';

/**
 * Finding somebody in a published document.
 *
 * A qualification list runs to a few hundred names and a bracket to sixty, and an archer opening one
 * is nearly always looking for a single person: themselves, a clubmate, whoever they are drawn
 * against. Every word typed has to appear somewhere in the line, in any order, accents ignored,
 * because a name is spelled in the organiser's language and typed in the archer's.
 */

export function plain(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function terms(search: string): string[] {
	return plain(search).split(' ').filter(Boolean);
}

function holds(haystack: string, wanted: string[]): boolean {
	const text = plain(haystack);
	return wanted.every((term) => text.includes(term));
}

/** The sections of a result list, keeping only the lines that answer, and only the sections that have one. */
export function findInSections(sections: DocumentSection[], search: string): DocumentSection[] {
	const wanted = terms(search);
	if (wanted.length === 0) return sections;

	return sections
		.map((section) => ({
			...section,
			rows: section.rows.filter((row) =>
				holds([...row.cells.map((cell) => cell.text), ...row.detail].join(' '), wanted)
			)
		}))
		.filter((section) => section.rows.length > 0);
}

/** The same for a bracket, where a line is a match and either side of it may be the one wanted. */
export function findInRounds(rounds: BracketRound[], search: string): BracketRound[] {
	const wanted = terms(search);
	if (wanted.length === 0) return rounds;

	return rounds
		.map((round) => ({
			...round,
			matches: round.matches.filter((match) =>
				holds(
					match.entries
						.map((entry) => `${entry.name} ${entry.club ?? ''} ${entry.country?.name ?? ''}`)
						.join(' '),
					wanted
				)
			)
		}))
		.filter((round) => round.matches.length > 0);
}

/** How many lines a search left, so a document with nothing in it can say so rather than look empty. */
export function countRows(sections: DocumentSection[]): number {
	return sections.reduce((total, section) => total + section.rows.length, 0);
}
