import {
	emptyWorkout,
	type BlockKind,
	type RunGoal,
	type RunItem,
	type RunWorkout
} from './workout';

/**
 * Four programmes to start from, because an empty library is a blank page and nobody writes their
 * first interval session into one.
 *
 * They are the four shapes a running week is made of rather than a training plan: something easy,
 * something long, something fast and something in between. What they are worth is showing what the
 * editor can do, so each one uses a different part of it: a repeat, a plain block, a pace to hold,
 * a block that ends when the runner says so.
 *
 * Copied rather than referenced. A programme taken from here is the archer's own from that moment,
 * to be edited into whatever their coach actually said.
 */

export type StarterKey = 'easy' | 'long' | 'intervals' | 'tempo';

export const STARTERS: StarterKey[] = ['easy', 'long', 'intervals', 'tempo'];

const block = (
	kind: BlockKind,
	goal: RunGoal,
	targetPace: number | null = null
): RunItem => ({ type: 'block', id: crypto.randomUUID(), kind, goal, targetPace, label: null });

const forTime = (seconds: number) => ({ type: 'time' as const, seconds });
const forDistance = (metres: number) => ({ type: 'distance' as const, metres });
const open = { type: 'open' as const };

/** The blocks each starter is made of. Names come from the dictionary, so they arrive translated. */
function itemsOf(key: StarterKey): RunItem[] {
	switch (key) {
		case 'easy':
			// One block and no pace: the whole point of an easy run is that it asks for nothing.
			return [block('work', forTime(30 * 60))];
		case 'long':
			return [block('warmup', forTime(10 * 60)), block('work', open), block('cooldown', forTime(5 * 60))];
		case 'intervals':
			return [
				block('warmup', forTime(10 * 60)),
				{
					type: 'repeat',
					id: crypto.randomUUID(),
					times: 7,
					blocks: [
						{ id: crypto.randomUUID(), kind: 'work', goal: forDistance(400), targetPace: 260, label: null },
						{ id: crypto.randomUUID(), kind: 'recovery', goal: forTime(90), targetPace: null, label: null }
					]
				},
				block('cooldown', forTime(10 * 60))
			];
		case 'tempo':
			return [
				block('warmup', forTime(10 * 60)),
				block('work', forDistance(5000), 300),
				block('cooldown', forTime(10 * 60))
			];
	}
}

export function starterWorkout(key: StarterKey, name: string): RunWorkout {
	return { ...emptyWorkout(name), items: itemsOf(key) };
}
