import type { IconName } from '$lib/ui/Icon.svelte';
import { WA_10_RING } from '../rounds/seed';
import { DRILL_GAMES, type DrillConfig, type DrillFace, type DrillGame, type Drill } from './types';

/** The catalogue, so adding a game is an entry here and a branch in engine.ts, nothing else. */

/** Which of the settings a game actually reads, and so which ones its setup screen asks for. */
export type DrillField =
	| 'threshold'
	| 'arrows'
	| 'arrowsPerEnd'
	| 'lives'
	| 'ladder'
	| 'stepArrows'
	| 'goal'
	| 'seconds'
	| 'arrowSet';

export interface DrillDefinition {
	game: DrillGame;
	icon: IconName;
	/** `pad` is the keypad and face a round is scored on; `count` is a tally, for the drill shot at nothing. */
	input: 'pad' | 'count';
	/** Opens on the face, for the drills whose whole reading is where the arrow landed. */
	prefersPlot: boolean;
	/** True when the drill runs against a clock the page has to keep. */
	timed: boolean;
	fields: DrillField[];
	defaults: Partial<DrillConfig>;
}

/** What every game starts from, before its own entry has its say. */
export const DEFAULT_CONFIG: DrillConfig = {
	thresholdLabel: '9',
	arrows: 36,
	arrowsPerEnd: 6,
	lives: 3,
	ladder: ['7', '8', '9', '10', 'X'],
	stepArrows: 3,
	goal: 100,
	seconds: 120,
	arrowSet: 6
};

export const DRILL_DEFINITIONS: Record<DrillGame, DrillDefinition> = {
	successZone: {
		game: 'successZone',
		icon: 'target',
		input: 'pad',
		prefersPlot: false,
		timed: false,
		fields: ['threshold', 'arrows', 'arrowsPerEnd'],
		defaults: {}
	},
	lives: {
		game: 'lives',
		icon: 'level',
		input: 'pad',
		prefersPlot: false,
		timed: false,
		fields: ['threshold', 'lives', 'arrowsPerEnd'],
		// No arrow count: what ends it is running out of lives, not running out of arrows. Short ends,
		// so the drill stops near the arrow that ended it rather than five arrows past it.
		defaults: { arrows: null, thresholdLabel: '8', arrowsPerEnd: 3 }
	},
	streak: {
		game: 'streak',
		icon: 'star',
		input: 'pad',
		prefersPlot: false,
		timed: false,
		fields: ['threshold', 'arrows', 'arrowsPerEnd'],
		defaults: { arrows: null, arrowsPerEnd: 3 }
	},
	shrinkingZone: {
		game: 'shrinkingZone',
		icon: 'sight',
		input: 'pad',
		prefersPlot: false,
		timed: false,
		fields: ['ladder', 'stepArrows', 'arrowsPerEnd'],
		defaults: { arrows: null, arrowsPerEnd: 3 }
	},
	calledShot: {
		game: 'calledShot',
		icon: 'bulb',
		input: 'pad',
		prefersPlot: false,
		timed: false,
		// The threshold is read as the floor of the pool: the rings from it inwards are the ones called.
		fields: ['threshold', 'arrows', 'arrowsPerEnd'],
		defaults: { arrows: 24, arrowsPerEnd: 1, thresholdLabel: '6' }
	},
	targetScore: {
		game: 'targetScore',
		icon: 'podium',
		input: 'pad',
		prefersPlot: false,
		timed: false,
		fields: ['goal', 'arrowsPerEnd'],
		// One at a time by default, so the arrows it took is the number it actually took.
		defaults: { arrows: null, arrowsPerEnd: 1 }
	},
	beatTheClock: {
		game: 'beatTheClock',
		icon: 'clock',
		input: 'pad',
		prefersPlot: false,
		timed: true,
		fields: ['seconds', 'arrowsPerEnd'],
		defaults: { arrows: null, arrowsPerEnd: 3, seconds: 120 }
	},
	// Wants plots: the shaft it looks for scores like the rest and lands somewhere else.
	arrowSorting: {
		game: 'arrowSorting',
		icon: 'chart',
		input: 'pad',
		prefersPlot: true,
		timed: false,
		fields: ['arrowSet', 'arrows'],
		defaults: { arrows: 36, arrowsPerEnd: 6 }
	},
	blindBale: {
		game: 'blindBale',
		icon: 'eyeOff',
		input: 'count',
		prefersPlot: false,
		timed: false,
		fields: [],
		defaults: { arrows: null }
	},
	onePressure: {
		game: 'onePressure',
		icon: 'bow',
		input: 'pad',
		prefersPlot: false,
		timed: true,
		fields: ['threshold', 'arrows', 'seconds'],
		defaults: { arrows: 12, arrowsPerEnd: 1, seconds: 30 }
	}
};

export function drillDefinition(game: DrillGame): DrillDefinition {
	return DRILL_DEFINITIONS[game] ?? DRILL_DEFINITIONS.successZone;
}

export function isDrillGame(value: unknown): value is DrillGame {
	return typeof value === 'string' && (DRILL_GAMES as readonly string[]).includes(value);
}

/** A drill with nothing to set and no face to choose is better started than asked about. */
export function needsSetup(game: DrillGame): boolean {
	const definition = drillDefinition(game);
	return definition.fields.length > 0 || definition.input === 'pad';
}

export function defaultConfig(game: DrillGame): DrillConfig {
	return { ...DEFAULT_CONFIG, ...drillDefinition(game).defaults };
}

export function defaultFace(): DrillFace {
	return { scoreSetId: WA_10_RING.id, faceSize: 40, distance: 18, unit: 'm' };
}

/** A drill as it is the moment it is created, before an arrow has been shot at it. */
export function newDrill(game: DrillGame, face: DrillFace = defaultFace()): Drill {
	return {
		game,
		face,
		config: defaultConfig(game),
		state: { calls: [], startedAt: null, blindArrows: 0, ratings: [], endedAt: null }
	};
}

export const DRILL_LIMITS = {
	arrows: { min: 1, max: 500 },
	arrowsPerEnd: { min: 1, max: 12 },
	lives: { min: 1, max: 20 },
	stepArrows: { min: 1, max: 20 },
	goal: { min: 1, max: 5000 },
	seconds: { min: 5, max: 3600 },
	arrowSet: { min: 2, max: 12 },
	faceSize: { min: 10, max: 200 },
	distance: { min: 1, max: 300 }
};

/** What is out of range, by field name, so the setup screen can mark the input that is wrong. */
export function validateDrill(drill: Drill): string[] {
	const errors: string[] = [];
	const { config, face } = drill;
	const fields = drillDefinition(drill.game).fields;
	const check = (value: number | null, key: keyof typeof DRILL_LIMITS) => {
		if (value === null) return;
		const { min, max } = DRILL_LIMITS[key];
		if (!Number.isFinite(value) || value < min || value > max) errors.push(key);
	};

	if (fields.includes('arrows')) check(config.arrows, 'arrows');
	check(config.arrowsPerEnd, 'arrowsPerEnd');
	if (fields.includes('lives')) check(config.lives, 'lives');
	if (fields.includes('stepArrows')) check(config.stepArrows, 'stepArrows');
	if (fields.includes('goal')) check(config.goal, 'goal');
	if (fields.includes('seconds')) check(config.seconds, 'seconds');
	if (fields.includes('arrowSet')) check(config.arrowSet, 'arrowSet');
	if (fields.includes('ladder') && config.ladder.length === 0) errors.push('ladder');
	check(face.faceSize, 'faceSize');
	check(face.distance, 'distance');

	// A drill that asks for fewer arrows than it puts in an end could never finish an end.
	const perEnd = drill.game === 'arrowSorting' ? config.arrowSet : config.arrowsPerEnd;
	if (config.arrows !== null && config.arrows < perEnd) errors.push('arrows');

	return [...new Set(errors)];
}

/** What the row is called when the archer gave it no name: where it was shot, and on what. */
export function drillFaceLabel(face: DrillFace): string {
	const size = `${face.faceSize}cm`;
	return face.distance === null ? size : `${face.distance}${face.unit} · ${size}`;
}
