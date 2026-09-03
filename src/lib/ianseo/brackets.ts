import type { BracketMatch } from './types';

/**
 * What ianseo puts where a bracket's score goes.
 *
 * A match that has been shot carries its score, and one that has not carries where and when it will
 * be: `T# 5A 29-08-2026 13:50`, with the time written only against the first archer because both
 * sides shoot at the same one. Rendered as published, that is a twenty character string in the
 * column a score of `6` was sized for, which is what a quarter final looks like the day before it.
 */
export type Assignment = {
	/** The score, where the match has been shot. `Bye` is one of these: it is what happened. */
	score: string | null;
	/** The target the archer is drawn on, such as `5A`, without the `T#` ianseo writes in front. */
	target: string | null;
	/** When the match is due, in ianseo's own words: it is the venue's clock, not the reader's. */
	at: string | null;
};

const NOTHING: Assignment = { score: null, target: null, at: null };

/** Day, month and year, with the time where ianseo names one. */
const WHEN = /\b(\d{1,2}-\d{1,2}-\d{4})(?:\s+(\d{1,2}:\d{2}))?/;

export function readAssignment(value: string | null | undefined): Assignment {
	const text = (value ?? '').replace(/\s+/g, ' ').trim();
	if (!text) return NOTHING;

	const when = text.match(WHEN);
	const at = when ? [when[1], when[2]].filter(Boolean).join(' ') : null;
	const rest = (when ? text.replace(when[0], ' ') : text).replace(/\s+/g, ' ').trim();

	// Anything ianseo did not write a target into is a score, whatever it says: a build that has
	// never seen a format still shows what the page said rather than swallowing it.
	const target = rest.match(/^T#\s*(\S+)$/i);
	if (target) return { score: null, target: target[1], at };
	return { score: rest || null, target: null, at };
}

/** Who won a match, by score alone rather than by the draw: see doc/ianseo.md, "What is shown". */
export function winnerOf(match: BracketMatch): number | null {
	const scores = match.entries.map((entry) => Number(readAssignment(entry.score).score));
	if (scores.length < 2 || scores.some((score) => !Number.isFinite(score))) return null;
	if (scores[0] === scores[1]) return null;
	return scores[0] > scores[1] ? 0 : 1;
}
