import { bodyColumn } from './rows';
import type { DocumentColumn } from './types';

/**
 * How a club is named on screen.
 *
 * Every source files a club under a number or a code and prints both: `0702022 - JUSSY` in France,
 * `KOSH - Kohav Hasharon Archers` at an international event. The number is how the federation finds
 * the club, not how anybody says its name, and a column of them is a column of noise. So the name
 * alone is shown, and the whole of it is there for anybody who wants it.
 */

/** A federation's own reference: digits, or a short code with no spaces in it. */
const IDENTIFIER = /^\s*([0-9]{2,}|[A-Za-z0-9]{2,6})\s+-\s+(.+)$/;

export function clubName(value: string, full = false): string {
	if (full) return value;
	const split = value.match(IDENTIFIER);
	// Only where something is left: a club recorded as nothing but its number keeps its number.
	return split && split[2].trim() ? split[2].trim() : value;
}

/**
 * Which columns of a table are written that way: the one a club is known to sit in, plus any read
 * off what it holds rather than off what it is called. Every organiser labels its own columns, so a
 * French entry list headed Société and a German one headed Verein are the same column, and a list of
 * labels will always be one short of the languages ianseo is published in.
 */
export function namedColumns(
	columns: DocumentColumn[],
	rows: { cells: { text: string }[] }[]
): boolean[] {
	const body = bodyColumn(columns);
	return columns.map((_, at) => {
		if (at === body) return true;
		const values = rows.map((row) => (row.cells[at]?.text ?? '').trim()).filter(Boolean);
		// Enough of them to be a pattern rather than a coincidence, and the pattern held by most.
		if (values.length < 3) return false;
		const carrying = values.filter((value) => IDENTIFIER.test(value)).length;
		return carrying / values.length >= 0.7;
	});
}
