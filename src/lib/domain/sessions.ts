import { timeOfDay } from './dates';

/**
 * The name an unnamed session carries: the part of the day it was shot in, said differently for a
 * competition, because "Morning session" is the wrong word for the day someone drove to a shoot.
 * Returns a translation key rather than a string, so the name follows the language at display time.
 */
export function defaultNameKey(kind: string, startedAt: number): string {
	const group = kind === 'competition' ? 'competition' : 'practice';
	return `sessions.name.${group}.${timeOfDay(startedAt)}`;
}

/** Accents are dropped on both sides, so "Tir a 18m" finds a session written "Tir à 18m". */
function fold(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

/**
 * Every word typed has to appear somewhere in the session, in any of the fields, in any order: an
 * archer searching "wind club" is naming two things they remember, not quoting a sentence.
 */
export function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
	const terms = fold(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = fields.filter(Boolean).map((field) => fold(field as string));
	return terms.every((term) => haystack.some((field) => field.includes(term)));
}
