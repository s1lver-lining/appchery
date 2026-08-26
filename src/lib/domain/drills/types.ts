import type { LengthUnit } from '../rounds/types';

/**
 * A drill: shooting done to a rule rather than to a round.
 *
 * A round asks one question, which is what the archer scored over a fixed number of arrows. A drill
 * asks a different one every time: how often the arrow went where it was meant to, how long a run
 * was held before it broke, how many arrows a target score cost, which shaft of the set is the odd
 * one. The answer is a reading of an afternoon's work and never a score to be compared with a score,
 * which is why a drill is its own kind of activity and stays out of averages and personal bests. Its
 * arrows count as volume, like a match or a bare shaft session: arrows shot are arrows shot.
 *
 * What it is shot at lives in the measurements block rather than in a round definition, deliberately
 * and for the same reason free scoring does it, see ../freeScore.ts: anything that finds a round
 * definition treats what it finds as a round, and a drill must never be read as one.
 */
export const DRILL_KIND = 'drill';

export const DRILL_GAMES = [
	'successZone',
	'lives',
	'streak',
	'shrinkingZone',
	'calledShot',
	'targetScore',
	'beatTheClock',
	'arrowSorting',
	'blindBale',
	'onePressure'
] as const;

export type DrillGame = (typeof DRILL_GAMES)[number];

/** What the drill is shot at. A stage of a round in everything but name, and never called one. */
export interface DrillFace {
	scoreSetId: string;
	/** Face diameter in cm. */
	faceSize: number;
	/** Null when the archer did not record how far away they stood. */
	distance: number | null;
	unit: LengthUnit;
}

/**
 * Every setting any game takes, in one flat shape.
 *
 * One shape rather than a union per game so that a block written by an older version parses into a
 * usable drill instead of into nothing: a field a game does not read costs a few bytes and cannot
 * be wrong, and a field it does read always has a default to fall back on.
 */
export interface DrillConfig {
	/** The lowest ring that counts as a success, as a zone label so X and the 10 stay distinct. */
	thresholdLabel: string;
	/** Arrows the drill asks for, null when something else decides when it is over. */
	arrows: number | null;
	arrowsPerEnd: number;
	/** Misses allowed before it ends. */
	lives: number;
	/** Rings to work inwards through, outermost first. */
	ladder: string[];
	/** Arrows to be cleared at a step before the next one opens. */
	stepArrows: number;
	/** Points to reach. */
	goal: number;
	/** Seconds allowed, or seconds to wait between arrows. */
	seconds: number;
	/** How many numbered shafts are in the set being sorted. */
	arrowSet: number;
}

/**
 * What the drill has to remember that its arrows cannot say on their own.
 *
 * Everything derivable from the arrows is derived, every time, in engine.ts: a counter kept beside
 * the shots is a counter that can disagree with them, and an arrow edited on the sheet afterwards
 * would leave it lying. Only what no arrow records is stored here.
 */
export interface DrillState {
	/**
	 * The ring called for each arrow so far, one entry per arrow, calledShot only. Persisted rather
	 * than drawn when it is needed: a call regenerated on a reload is a call that changed under the
	 * archer between nocking and loosing.
	 */
	calls: string[];
	/** When the clock was started, for the games that run against one. Null until it is. */
	startedAt: number | null;
	/** Arrows counted at a face nobody scored, blindBale only. */
	blindArrows: number;
	/** How each end felt, 1 to 5, blindBale only. */
	ratings: number[];
	/** Set when the archer stops a drill that had no natural end. */
	endedAt: number | null;
}

/** One arrow, as the engine reads it: the ring it landed in, and where when it was plotted. */
export interface DrillShot {
	/** Position in its end, which is the number written on the shaft. */
	ordinal: number;
	value: number;
	zoneLabel: string;
	x: number | null;
	y: number | null;
}

/** A drill, whole: what it is, what it is shot at, how it is set, and what it has got to. */
export interface Drill {
	game: DrillGame;
	face: DrillFace;
	config: DrillConfig;
	state: DrillState;
}

/** One numbered shaft's reading, for the sorting drill. */
export interface ArrowRanking {
	ordinal: number;
	shots: number;
	/** Mean score of that shaft. */
	mean: number;
	/** How far its own centre sits from the centre of the others, in face radii. Null unplotted. */
	offset: number | null;
	/** How widely it groups against itself, in face radii. Null unplotted. */
	spread: number | null;
}

/**
 * The reading of a drill, worked out from its arrows every time it is asked for. Nothing here is
 * stored, so nothing here can go stale against the arrows it was counted from.
 */
export interface DrillOutcome {
	arrows: number;
	hits: number;
	misses: number;
	/** Share of arrows that met the rule, 0 to 1. Null for the games that are not pass or fail. */
	rate: number | null;
	score: number;
	currentStreak: number;
	bestStreak: number;
	/** Misses left before it ends, or null when misses do not end it. */
	livesLeft: number | null;
	/** Ladder step reached, 0 based, and the ring that step asks for. */
	step: number;
	stepLabel: string | null;
	/** Seconds left on the clock, null when the drill runs against no clock or has not started. */
	secondsLeft: number | null;
	/** Ring called for the arrow about to be shot, calledShot only. */
	called: string | null;
	/** Shafts ranked worst first, arrowSorting only. */
	ranking: ArrowRanking[];
	/** Arrows still wanted before the drill is over, null when nothing counts them down. */
	remaining: number | null;
	done: boolean;
}
