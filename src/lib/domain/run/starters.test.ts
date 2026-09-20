import { describe, expect, it } from 'vitest';
import { STARTERS, starterWorkout } from './starters';
import { flatten, validateWorkout, workoutTotals } from './workout';

describe('starterWorkout', () => {
	it('makes a programme the editor would have accepted', () => {
		for (const key of STARTERS) {
			const workout = starterWorkout(key, key);
			expect(validateWorkout(workout)).toEqual([]);
			expect(flatten(workout).length).toBeGreaterThan(0);
		}
	});

	it('gives every block an id of its own, so one can be edited without the others', () => {
		const ids = flatten(starterWorkout('intervals', 'x')).map((step) => step.blockId);
		// Four blocks written: a warm up, the fast one, the easy one, and the way down.
		expect(new Set(ids).size).toBe(4);
		// Seven rounds of two blocks, between a warm up and a cool down.
		expect(flatten(starterWorkout('intervals', 'x'))).toHaveLength(16);
	});

	it('comes to something worth running', () => {
		const totals = workoutTotals(starterWorkout('tempo', 'x'));
		// The five kilometres of the tempo block. The warm up and the cool down are timed and hold no
		// pace, so they ask for minutes and for no particular distance.
		expect(totals.metres).toBe(5000);
		expect(totals.seconds).toBeGreaterThan(20 * 60);
	});

	it('is a fresh copy every time, so two taken from one starter are two programmes', () => {
		expect(starterWorkout('easy', 'a').id).not.toBe(starterWorkout('easy', 'a').id);
	});
});
