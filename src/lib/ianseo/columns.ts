import { personColumn } from './rows';
import type { DocumentSection } from './types';

/**
 * Which columns of a published result are worth the width, and which are worth a tap.
 *
 * ianseo publishes everything it has: a start list carries the target, the archer, the club, the
 * class and the session, and all five of them at once turn a list of archers into a wall of French.
 * So the table shows the few that identify a line, the archer adds whichever others they care about,
 * and the row opens onto everything the document holds either way. Nothing is ever lost by a choice
 * made here: the choice is only about what fits across a line.
 */

/** Where a phrase stops being a phrase and starts being prose, in characters. */
const PHRASE = 22;

export type ColumnShape = {
	/** Nothing but digits and the punctuation between them: a placing, a score, a count. */
	figures: boolean;
	longest: number;
	/** Prose, which has to be allowed to wrap. */
	wordy: boolean;
	/** A word or a short phrase: never a figure, never long enough to be worth breaking. */
	phrase: boolean;
};

/**
 * What each column actually holds, read from the rows rather than from its heading. ianseo heads
 * every competition in the organiser's own language, so the values are the only thing that says
 * whether a column is a placing, a score or somebody's name.
 */
export function shapeOf(section: DocumentSection): ColumnShape[] {
	return section.columns.map((column, at) => {
		const values = section.rows.map((row) => row.cells[at]?.text ?? '').filter(Boolean);
		const longest = values.reduce((most, one) => Math.max(most, one.length), 0);
		const figures = values.length > 0 && values.every((one) => /^[\d.,:/\s+-]+$/.test(one));
		return {
			figures,
			longest,
			wordy: !figures && longest > PHRASE,
			phrase: !figures && longest > 8 && longest <= PHRASE
		};
	});
}

/**
 * The column that may wrap, which takes whatever width the others do not want. The archer's name
 * where the document names one, and otherwise whichever column carries the most words.
 */
export function wrappingColumn(section: DocumentSection, shape = shapeOf(section)): number {
	const person = personColumn(section.columns);
	if (person !== null && !section.columns[person].secondary) return person;

	let widest = -1;
	let at = 0;
	shape.forEach((column, index) => {
		if (section.columns[index].secondary) return;
		if (column.longest > widest) {
			widest = column.longest;
			at = index;
		}
	});
	return at;
}

/**
 * The columns a result opens with: whoever the line is about, and the short things that tell one
 * line from the next. The club and the class are the archer's to add, because on most days they
 * already know which club they are looking at.
 */
export function defaultColumns(section: DocumentSection, shape = shapeOf(section)): boolean[] {
	const wrapping = wrappingColumn(section, shape);
	return section.columns.map(
		(column, at) =>
			at === wrapping || (!column.secondary && !shape[at].wordy && !shape[at].phrase)
	);
}

/** What the archer has said about a column, by the heading it carries rather than by where it sits. */
export type ColumnChoice = { chosen: Set<string>; refused: Set<string> };

export const NO_CHOICE: ColumnChoice = { chosen: new Set(), refused: new Set() };

/** A choice made outright wins over the default, in either direction. */
export function visibleColumns(
	section: DocumentSection,
	choice: ColumnChoice = NO_CHOICE,
	shape = shapeOf(section)
): boolean[] {
	const fallback = defaultColumns(section, shape);
	return section.columns.map((column, at) => {
		if (choice.chosen.has(column.label)) return true;
		if (choice.refused.has(column.label)) return false;
		return fallback[at];
	});
}

/**
 * What switching a column changes, given what it was doing already. Held here rather than in the
 * screen so that adding a column the app already showed does not quietly record a preference the
 * archer never expressed.
 */
export function afterToggle(
	label: string,
	wasVisible: boolean,
	byDefault: boolean,
	choice: ColumnChoice
): ColumnChoice {
	const chosen = new Set(choice.chosen);
	const refused = new Set(choice.refused);
	chosen.delete(label);
	refused.delete(label);

	const wanted = !wasVisible;
	// Only a choice that differs from what the document would do anyway is worth remembering.
	if (wanted !== byDefault) (wanted ? chosen : refused).add(label);
	return { chosen, refused };
}
