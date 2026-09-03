import { describe, it, expect } from 'vitest';
import { readAssignment, winnerOf } from './brackets';
import type { BracketMatch } from './types';

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

/**
 * Who won, read from the two scores alone. Individual matches count sets, team matches sometimes
 * count sets and sometimes count arrows, and this asks none of that: whichever number is higher won,
 * on whatever scale the two of them share.
 */
describe('winnerOf', () => {
	it('gives the match to the higher score, whatever the scale', () => {
		expect(winnerOf(match(['Dupont', '6'], ['Martin', '2']))).toBe(0);
		expect(winnerOf(match(['Dupont', '4'], ['Bernard', '6']))).toBe(1);
		// A compound team total, three digits and nowhere near a set-play threshold.
		expect(winnerOf(match(['Team A', '226'], ['Team B', '215']))).toBe(0);
		// A recurve team match that did not reach the score an individual match would stop at.
		expect(winnerOf(match(['Team A', '5'], ['Team B', '4']))).toBe(0);
	});

	it('says nothing about a match nobody has shot', () => {
		expect(winnerOf(match(['Dupont', 'T# 1A 05-09-2026 14:00'], ['Bernard', 'T# 1B']))).toBe(null);
	});

	it('says nothing where the two sides tie', () => {
		expect(winnerOf(match(['Dupont', '5'], ['Bernard', '5']))).toBe(null);
	});

	it('says nothing about a bye, which is a word rather than a score', () => {
		expect(winnerOf(match(['Dupont', 'Bye'], ['', null]))).toBe(null);
	});
});
