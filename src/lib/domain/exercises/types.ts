import type { LoadMap, MuscleView, ShotPhase } from '../muscles';
import type { Movement } from './movement';

/**
 * An exercise: what it works, what it asks of the archer, and what the archer counts while doing it.
 *
 * The catalogue is code rather than rows, the same as the round definitions, because it is rules
 * data shipped with the app. A routine written against it will store what the archer actually did,
 * so an exercise edited in a later version corrects the instructions without rewriting the history
 * of the sets already done under the old ones.
 */

/** What the archer needs to hand. A band and a bow are not interchangeable: one has no let down. */
export type ExerciseKit = 'none' | 'band' | 'bow' | 'outdoors';

/**
 * Which activity will record it once routines exist. Running is its own activity rather than a
 * strength exercise with a distance on it, because a run is an outing and a set of reps is not.
 */
export type ExerciseActivity = 'strength' | 'running';

/** What one set of it is counted in, which is the parameter a routine has to ask for. */
export type ExerciseMeasure = 'reps' | 'hold' | 'distance';

/** Where the archer starts. A hold with nothing to load it does the shoulder no good at all. */
export type ExerciseLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * What a routine fills in when it takes this exercise from the catalogue. Every figure is a starting
 * point rather than a prescription: the archer edits them, and what they edited is what is stored.
 */
export interface ExerciseDefaults {
	sets: number;
	reps?: number;
	holdSeconds?: number;
	restSeconds?: number;
	/** Metres, so a run and a walk back are the same unit and the display converts. */
	distanceM?: number;
}

export interface Exercise {
	key: string;
	activity: ExerciseActivity;
	kit: ExerciseKit;
	measure: ExerciseMeasure;
	level: ExerciseLevel;
	defaults: ExerciseDefaults;
	/** How hard it works each muscle, on the same scale the shot is measured in. */
	load: LoadMap;
	/** The moments of the shot it is training for, so the point of it is not left to the reader. */
	phases: ShotPhase[];
	movement: Movement;
	/** How many numbered instructions it has in the dictionary, which is what the page walks. */
	steps: number;
	/** Set when the exercise carries a warning worth reading before the first rep. */
	caution?: boolean;
}

/** The figure an exercise opens its diagram on. `both` is a layout rather than a side of the body. */
export type Board = MuscleView | 'both';
