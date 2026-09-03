import { describe, it, expect } from 'vitest';
import { furthestRounds, readAssignment, winnerOf } from './brackets';
import type { BracketMatch, BracketRound } from './types';

describe('readAssignment', () => {
	it('reads a match that has been shot as the score it was', () => {
		expect(readAssignment('6')).toEqual({ score: '6', target: null, at: null });
		expect(readAssignment('142')).toEqual({ score: '142', target: null, at: null });
	});

	it('keeps a bye as what happened rather than as a missing score', () => {
		expect(readAssignment('Bye')).toEqual({ score: 'Bye', target: null, at: null });
	});

	it('splits the target from the time a match is due', () => {
		expect(readAssignment('T# 5A 29-08-2026 13:50')).toEqual({
			score: null,
			target: '5A',
			at: '29-08-2026 13:50'
		});
	});

	it('reads the other side of the same match, which ianseo leaves the time off', () => {
		expect(readAssignment('T# 5B')).toEqual({ score: null, target: '5B', at: null });
	});

	it('reads a target of a flight, where four archers share one', () => {
		expect(readAssignment('T# 19D 29-08-2026 15:40').target).toBe('19D');
	});

	it('says nothing about a match ianseo has published nothing for', () => {
		expect(readAssignment('')).toEqual({ score: null, target: null, at: null });
		expect(readAssignment(null)).toEqual({ score: null, target: null, at: null });
	});

	it('shows a format it has never seen rather than swallowing it', () => {
		expect(readAssignment('DNS')).toEqual({ score: 'DNS', target: null, at: null });
	});

	it('takes a date on its own as a time, leaving no score behind', () => {
		expect(readAssignment('29-08-2026 13:50')).toEqual({
			score: null,
			target: null,
			at: '29-08-2026 13:50'
		});
	});
});

const side = (name: string, score: string | null) => ({
	seed: null,
	name,
	country: null,
	club: null,
	score
});
const match = (a: [string, string | null], b: [string, string | null]): BracketMatch => ({
	entries: [side(...a), side(...b)],
	sets: []
});
const round = (title: string, matches: BracketMatch[]): BracketRound => ({ title, matches });

/**
 * Who won, as against who is ahead. A draw is read to find out who went through, and a match still
 * being shot has a leader who is nobody's winner yet.
 */
describe('winnerOf', () => {
	const draw = [
		round('1/2', [
			match(['Dupont', '6'], ['Martin', '2']),
			match(['Bernard', '4'], ['Petit', '2'])
		]),
		round('Finals', [match(['Dupont', '6'], ['Bernard', '4'])])
	];
	const furthest = furthestRounds(draw);

	it('gives the match to whoever is drawn again in a later round', () => {
		expect(winnerOf(draw[0].matches[0], 0, furthest)).toBe(0);
		expect(winnerOf(draw[0].matches[1], 0, furthest)).toBe(0);
	});

	it('settles the final, which has nobody drawn after it, on the set the system ends at', () => {
		expect(winnerOf(draw[1].matches[0], 1, furthest)).toBe(0);
	});

	it('says nothing about a match still being shot', () => {
		const live = [round('Finals', [match(['Dupont', '4'], ['Bernard', '2'])])];
		expect(winnerOf(live[0].matches[0], 0, furthestRounds(live))).toBe(null);
	});

	it('says nothing about a format it does not know the end of', () => {
		// Totals rather than set points, which carry no mark of the match being over.
		const scored = [round('Finals', [match(['Dupont', '146'], ['Bernard', '143'])])];
		expect(winnerOf(scored[0].matches[0], 0, furthestRounds(scored))).toBe(null);
	});

	it('says nothing about a match nobody has shot', () => {
		const drawn = [round('Finals', [match(['Dupont', 'T# 1A 05-09-2026 14:00'], ['Bernard', 'T# 1B'])])];
		expect(winnerOf(drawn[0].matches[0], 0, furthestRounds(drawn))).toBe(null);
	});

	it('is not fooled by a name carried forward that lost later', () => {
		// Bernard reaches the final and loses it: he won his half, and lost the one after.
		expect(winnerOf(draw[1].matches[0], 1, furthest)).toBe(0);
		expect(furthest.get('bernard')).toBe(1);
	});
});
