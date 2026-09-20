import { describe, expect, it } from 'vitest';
import {
	duplicateItem,
	emptyWorkout,
	flatten,
	formatPace,
	newBlock,
	newRepeat,
	parsePace,
	parseWorkout,
	serialiseWorkout,
	snapshotWorkout,
	validateWorkout,
	type RunItem,
	type RunWorkout
} from './workout';

/** The session the whole feature was designed around: warm up, seven intervals, cool down. */
function intervals(): RunWorkout {
	const warmup: RunItem = {
		type: 'block',
		id: 'w',
		kind: 'warmup',
		goal: { type: 'time', seconds: 1200 },
		targetPace: 360,
		label: null
	};
	const reps: RunItem = {
		type: 'repeat',
		id: 'r',
		times: 7,
		blocks: [
			{ id: 'fast', kind: 'work', goal: { type: 'distance', metres: 200 }, targetPace: 218, label: null },
			{ id: 'easy', kind: 'recovery', goal: { type: 'distance', metres: 100 }, targetPace: 400, label: null }
		]
	};
	const cooldown: RunItem = {
		type: 'block',
		id: 'c',
		kind: 'cooldown',
		goal: { type: 'time', seconds: 600 },
		targetPace: 400,
		label: null
	};
	return { ...emptyWorkout('Intervals'), items: [warmup, reps, cooldown] };
}

describe('unrolling a workout', () => {
	it('runs the blocks of a repeat in order, once per round', () => {
		const steps = flatten(intervals());
		expect(steps).toHaveLength(1 + 7 * 2 + 1);
		expect(steps.map((step) => step.blockId).slice(0, 5)).toEqual(['w', 'fast', 'easy', 'fast', 'easy']);
		expect(steps[1].repeat).toBe(1);
		expect(steps[3].repeat).toBe(2);
		expect(steps[3].repeatOf).toBe(7);
	});

	it('gives every step a key of its own, so two rounds are two steps', () => {
		const keys = flatten(intervals()).map((step) => step.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('leaves a block outside a repeat alone', () => {
		const steps = flatten({ ...emptyWorkout(), items: [newBlock('warmup')] });
		expect(steps).toHaveLength(1);
		expect(steps[0]).toMatchObject({ repeat: 1, repeatOf: 1 });
	});
});

describe('duplicating', () => {
	it('gives the copy ids of its own', () => {
		const repeat = newRepeat(3);
		const copy = duplicateItem(repeat);
		expect(copy.id).not.toBe(repeat.id);
		if (copy.type !== 'repeat' || repeat.type !== 'repeat') throw new Error('not a repeat');
		expect(copy.blocks.map((b) => b.id)).not.toEqual(repeat.blocks.map((b) => b.id));
		expect(copy.blocks[0].goal).toEqual(repeat.blocks[0].goal);
	});

	it('remembers which library workout a run was made of', () => {
		const source = intervals();
		expect(snapshotWorkout(source).sourceId).toBe(source.id);
		expect(snapshotWorkout(source).id).not.toBe(source.id);
	});
});

describe('validation', () => {
	it('passes the session it was designed for', () => {
		expect(validateWorkout(intervals())).toEqual([]);
	});

	it('names a repeat with nothing in it', () => {
		const empty: RunItem = { type: 'repeat', id: 'r', times: 3, blocks: [] };
		expect(validateWorkout({ ...emptyWorkout(), items: [empty] })).toEqual(['empty']);
	});

	it('names a pace nobody holds and a block nobody runs', () => {
		const silly = intervals();
		if (silly.items[0].type !== 'block') throw new Error('not a block');
		silly.items[0].targetPace = 30;
		silly.items[0].goal = { type: 'time', seconds: 1 };
		expect(validateWorkout(silly).sort()).toEqual(['duration', 'pace']);
	});
});

describe('paces as a runner writes them', () => {
	it('reads the separator they happened to use', () => {
		expect(parsePace('3:38')).toBe(218);
		expect(parsePace('3.38')).toBe(218);
		expect(parsePace('3,38')).toBe(218);
		expect(parsePace('6')).toBe(360);
	});

	it('reads nothing out of nothing', () => {
		expect(parsePace('')).toBeNull();
		expect(parsePace('fast')).toBeNull();
	});

	it('writes them back the same way', () => {
		expect(formatPace(218)).toBe('3:38');
		expect(formatPace(360)).toBe('6:00');
		expect(formatPace(null)).toBe('');
	});
});

describe('storing a workout', () => {
	it('comes back as it went in', () => {
		const stored = intervals();
		expect(parseWorkout(serialiseWorkout(stored))).toEqual(stored);
	});

	it('survives something else having written it', () => {
		expect(parseWorkout('not json')).toBeNull();
		expect(parseWorkout('{"name":"x"}')).toBeNull();
	});
});
