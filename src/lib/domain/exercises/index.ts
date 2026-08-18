import { MUSCLE_IDS, muscle, type Load, type MuscleId } from '../muscles';
import { EXERCISES } from './seed';
import type { Board, Exercise, ExerciseActivity, ExerciseKit } from './types';

export { EXERCISES } from './seed';
export * from './types';
export * from './movement';

const BY_KEY = new Map(EXERCISES.map((entry) => [entry.key, entry]));

export function exercise(key: string): Exercise | undefined {
	return BY_KEY.get(key);
}

/** The kit chips the library offers, in the order an archer acquires them. */
export const KITS: ExerciseKit[] = ['none', 'band', 'bow', 'outdoors'];

export function byKit(kit: ExerciseKit | null): Exercise[] {
	return kit ? EXERCISES.filter((entry) => entry.kit === kit) : EXERCISES;
}

export function byActivity(activity: ExerciseActivity): Exercise[] {
	return EXERCISES.filter((entry) => entry.activity === activity);
}

/**
 * The muscles an exercise works, hardest first and then in the body's own order, so two exercises
 * that work the same muscles list them the same way round.
 */
export function worked(entry: Exercise): { id: MuscleId; load: Load }[] {
	return MUSCLE_IDS.filter((id) => (entry.load[id] ?? 0) > 0)
		.map((id) => ({ id, load: entry.load[id] as Load }))
		.sort((a, b) => b.load - a.load || MUSCLE_IDS.indexOf(a.id) - MUSCLE_IDS.indexOf(b.id));
}

/** What the exercise is actually for: the muscles it works as hard as it works anything. */
export function primary(entry: Exercise): MuscleId[] {
	const peak = Math.max(0, ...Object.values(entry.load));
	return MUSCLE_IDS.filter((id) => (entry.load[id] ?? 0) === peak && peak > 0);
}

/**
 * The figure the diagram opens on: the one the exercise is actually drawn on. A movement working
 * both sides of the body opens on both, and nothing ever opens on the close ups, because a reader
 * shown four shoulder blades before a body has been asked a question rather than told an answer.
 */
export function defaultBoard(entry: Exercise): Board {
	const sides = new Set(
		Object.keys(entry.load)
			.map((id) => muscle(id as MuscleId)?.view)
			.filter((view) => view === 'back' || view === 'front')
	);
	if (sides.size === 1) return [...sides][0] as Board;
	// Nothing on either silhouette means everything it works is deep, and both is the honest frame.
	return 'both';
}
