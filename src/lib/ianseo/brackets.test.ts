import { describe, it, expect } from 'vitest';
import { readAssignment } from './brackets';

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
