import type { DocumentColumn, DocumentRow } from './types';

/**
 * Which column of a published document holds a person and which holds the body they shoot for.
 *
 * ianseo lets each organiser label its own columns, so this is a guess and is treated as one: it is
 * only ever used to offer a name to follow, and a document it cannot read simply offers nothing.
 * Nothing in the app depends on it having been right.
 */

const PERSON = [
	'athlete',
	'athlete name',
	'archer',
	'name',
	'competitor',
	'participant',
	'nom',
	'nombre',
	'atleta',
	'sportler'
];
const BODY = [
	'country',
	'country name',
	'club',
	'clubs',
	'clubs / pays',
	'team',
	'society',
	'nation',
	'noc',
	'pays',
	'club / pays'
];

/**
 * Compared without its accents, because ianseo prints each competition's columns in the organiser's
 * own language: the same list is headed `Athlete` in one country and `Athlète` in the next, and one
 * of those spellings used to leave the app unable to tell which column held the archer.
 */
function plain(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ');
}

function indexOf(columns: DocumentColumn[], labels: string[], skip = -1): number | null {
	const at = columns.findIndex(
		(column, index) => index !== skip && labels.includes(plain(column.label))
	);
	return at < 0 ? null : at;
}

export function personColumn(columns: DocumentColumn[]): number | null {
	return indexOf(columns, PERSON);
}

/** A national event writes clubs under a column it still calls Country, so the two are one question. */
export function bodyColumn(columns: DocumentColumn[]): number | null {
	return indexOf(columns, BODY, personColumn(columns) ?? -1);
}

/**
 * What a row offers to follow: whoever it names, and whoever they shoot for. A table with nobody in
 * it offers nothing, so the count of entries per country is never read as a list of clubs.
 */
export function followable(
	row: DocumentRow,
	columns: DocumentColumn[]
): { kind: 'archer' | 'club'; label: string }[] {
	const found: { kind: 'archer' | 'club'; label: string }[] = [];
	const person = personColumn(columns);
	const body = bodyColumn(columns);
	const text = (at: number | null) => (at === null ? '' : (row.cells[at]?.text ?? '')).trim();

	if (person === null || !text(person)) return found;
	found.push({ kind: 'archer', label: text(person) });
	if (text(body)) found.push({ kind: 'club', label: text(body) });
	return found;
}

/** A row is marked when it names somebody the archer follows, which is the point of following them. */
export function marked(row: DocumentRow, labels: Set<string>): boolean {
	if (labels.size === 0) return false;
	return row.cells.some((cell) => cell.text.trim() !== '' && labels.has(cell.text.trim().toLowerCase()));
}
