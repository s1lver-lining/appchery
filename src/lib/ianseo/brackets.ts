import type { BracketMatch, BracketRound } from './types';

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

/**
 * Who won a match, which is not the same question as who is ahead in it.
 *
 * ianseo marks nothing in a draw: both sides carry a number and that is all it says. A match being
 * shot carries the score so far, so reading the higher of the two as the winner puts a leader
 * through at two sets to one, and being wrong about who went through is being wrong about the one
 * thing a bracket is for.
 *
 * The draw answers it itself. Somebody drawn again in a later round won the match they were in,
 * whatever the numbers beside them say, and that holds in every format and every language ianseo
 * publishes in.
 */
export function furthestRounds(rounds: BracketRound[]): Map<string, number> {
	const found = new Map<string, number>();
	rounds.forEach((round, index) => {
		for (const match of round.matches) {
			for (const entry of match.entries) {
				const name = entry.name.trim().toLowerCase();
				if (name) found.set(name, Math.max(found.get(name) ?? index, index));
			}
		}
	});
	return found;
}

/**
 * World Archery's set system ends a match at six set points, and six is the only score in it that
 * means over. It is asked only of the last round, which has nobody drawn after it: a final would
 * otherwise never be settled at all. A total in the hundreds is a format this knows nothing about,
 * and it says nothing about those rather than guessing.
 */
const SET_WIN = 6;

/** Which side of the match won, or null where this cannot tell. */
export function winnerOf(
	match: BracketMatch,
	round: number,
	furthest: Map<string, number>
): number | null {
	const through = match.entries.findIndex(
		(entry) => (furthest.get(entry.name.trim().toLowerCase()) ?? round) > round
	);
	if (through >= 0) return through;

	const scores = match.entries.map((entry) => Number(readAssignment(entry.score).score));
	if (scores.length < 2 || scores.some((score) => !Number.isFinite(score))) return null;
	if (scores[0] === scores[1] || Math.max(...scores) !== SET_WIN) return null;
	return scores[0] > scores[1] ? 0 : 1;
}
