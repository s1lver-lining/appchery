/**
 * How the app matches what somebody typed, wherever they typed it: sessions, rounds, settings, the
 * tips. One rule everywhere, because a search box that behaves differently from the last search box
 * teaches nothing, and the archer finds out by not finding something they know is there.
 */

/** Accents are dropped on both sides, so "Tir a 18m" finds a session written "Tir à 18m". */
export function fold(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

/**
 * Every word typed has to appear somewhere in the thing, in any of its fields, in any order: an
 * archer searching "wind club" is naming two things they remember, not quoting a sentence. A second
 * word narrows the list rather than widening it, which is what typing more is for.
 *
 * An empty query matches everything, so a list filters to itself before anything is typed.
 */
export function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
	const terms = fold(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = fields.filter(Boolean).map((field) => fold(field as string));
	return terms.every((term) => haystack.some((field) => field.includes(term)));
}
