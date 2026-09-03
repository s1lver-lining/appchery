import { wrappingColumn } from './columns';
import type { ScheduleDay } from './schedule';
import type { BracketRound, DocumentSection, ResultDocument } from './types';

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

/** The days of a schedule, keeping only the lines that answer and only the days that keep one. */
export function findInSchedule(days: ScheduleDay[], search: string): ScheduleDay[] {
	const wanted = terms(search);
	if (wanted.length === 0) return days;

	return days
		.map((day) => ({
			...day,
			// A day answering by its own heading answers whole: somebody typing Sunday wants Sunday.
			lines: holds(day.title, wanted)
				? day.lines
				: day.lines.filter((line) => holds(`${line.time ?? ''} ${line.text}`, wanted))
		}))
		.filter((day) => day.lines.length > 0);
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

/**
 * Whether a published document names somebody, and who. Used to answer the question an archer
 * actually arrives with, which is not "what did this competition publish" but "am I in it": the
 * competition page reads its documents and keeps only the ones the name appears in.
 *
 * The names are given back so the page can say who it found, because a search for a surname in a
 * competition of six hundred archers is answered by three different people often enough to matter.
 */
export function namesFound(document: ResultDocument, search: string): string[] {
	const wanted = terms(search);
	if (wanted.length === 0) return [];

	const found = new Set<string>();
	if (document.kind === 'bracket') {
		for (const round of findInRounds(document.rounds, search)) {
			for (const match of round.matches) {
				for (const entry of match.entries) {
					if (holds(`${entry.name} ${entry.club ?? ''} ${entry.country?.name ?? ''}`, wanted)) {
						found.add(entry.name);
					}
				}
			}
		}
		return [...found];
	}

	for (const section of findInSections(document.sections, search)) {
		// Whoever the line is about, not whichever cell answered: a search for a club is still asking
		// which archers are in it, and a row that matched on its club would otherwise give back the club.
		const person = section.columns.length > 0 ? wrappingColumn(section) : -1;
		for (const row of section.rows) {
			// The longest cell where the document published no columns at all to say which one is which.
			const named =
				row.cells[person]?.text?.trim() ||
				[...row.cells].sort((a, b) => b.text.length - a.text.length)[0]?.text?.trim();
			if (named) found.add(named);
		}
	}
	return [...found];
}
