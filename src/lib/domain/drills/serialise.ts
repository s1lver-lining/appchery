import { SCORE_SETS, WA_10_RING } from '../rounds/seed';
import { defaultConfig, defaultFace, drillDefinition, isDrillGame, newDrill } from './games';
import type { Drill, DrillConfig, DrillFace, DrillGame, DrillState } from './types';

/**
 * The drill as it sits in the activity's measurements column.
 *
 * Held there rather than in a round definition, deliberately: anything in this app that finds a
 * round definition treats what it found as a round, and a drill read as a round would walk straight
 * into averages and personal bests, which is the one thing it must never do.
 */

export function serialiseDrill(drill: Drill): string {
	return JSON.stringify({
		game: drill.game,
		face: {
			scoreSetId: drill.face.scoreSetId,
			faceSize: drill.face.faceSize,
			distance: drill.face.distance,
			unit: drill.face.unit
		},
		config: drill.config,
		state: drill.state
	});
}

const number = (value: unknown, fallback: number | null): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function parseFace(raw: unknown): DrillFace {
	const fallback = defaultFace();
	const face = (raw ?? {}) as Partial<DrillFace>;
	// A score set this build has never heard of would throw the moment anything tried to draw it.
	const known = SCORE_SETS.some((set) => set.id === face.scoreSetId);
	return {
		scoreSetId: known ? (face.scoreSetId as string) : WA_10_RING.id,
		faceSize: number(face.faceSize, fallback.faceSize) ?? fallback.faceSize,
		distance: number(face.distance, null),
		unit: face.unit === 'yd' ? 'yd' : 'm'
	};
}

function parseConfig(game: DrillGame, raw: unknown): DrillConfig {
	const fallback = defaultConfig(game);
	const config = (raw ?? {}) as Partial<DrillConfig>;
	const ladder = Array.isArray(config.ladder)
		? config.ladder.filter((step): step is string => typeof step === 'string')
		: [];
	return {
		thresholdLabel:
			typeof config.thresholdLabel === 'string' ? config.thresholdLabel : fallback.thresholdLabel,
		// Null is a meaning here rather than a gap: it is what "nothing counts these down" is written as.
		arrows: config.arrows === null ? null : number(config.arrows, fallback.arrows),
		arrowsPerEnd: number(config.arrowsPerEnd, fallback.arrowsPerEnd) ?? fallback.arrowsPerEnd,
		lives: number(config.lives, fallback.lives) ?? fallback.lives,
		ladder: ladder.length > 0 ? ladder : fallback.ladder,
		stepArrows: number(config.stepArrows, fallback.stepArrows) ?? fallback.stepArrows,
		goal: number(config.goal, fallback.goal) ?? fallback.goal,
		seconds: number(config.seconds, fallback.seconds) ?? fallback.seconds,
		arrowSet: number(config.arrowSet, fallback.arrowSet) ?? fallback.arrowSet
	};
}

function parseState(raw: unknown): DrillState {
	const state = (raw ?? {}) as Partial<DrillState>;
	return {
		calls: Array.isArray(state.calls)
			? state.calls.filter((call): call is string => typeof call === 'string')
			: [],
		startedAt: number(state.startedAt, null),
		blindArrows: Math.max(0, number(state.blindArrows, 0) ?? 0),
		ratings: Array.isArray(state.ratings)
			? state.ratings.filter((rating): rating is number => typeof rating === 'number')
			: [],
		endedAt: number(state.endedAt, null)
	};
}

/**
 * Anything unreadable comes back as a fresh success zone drill rather than throwing. A block written
 * by a newer version of the app is not worth losing the page over, and the archer can see what it is.
 */
export function parseDrill(measurements: string | null): Drill {
	if (!measurements) return newDrill('successZone');
	try {
		const parsed = JSON.parse(measurements) as { game?: unknown };
		const game = isDrillGame(parsed.game) ? parsed.game : 'successZone';
		const raw = parsed as { face?: unknown; config?: unknown; state?: unknown };
		return {
			game,
			face: parseFace(raw.face),
			config: parseConfig(game, raw.config),
			state: parseState(raw.state)
		};
	} catch {
		return newDrill('successZone');
	}
}

/**
 * How many arrows an end of this drill holds. One, for the drills shot one arrow at a time, and the
 * whole set for the sorting drill: its arrow numbers are places in the end, so an end that held
 * anything other than the set once through would number the shafts wrong.
 */
export function endSize(drill: Drill): number {
	const arrows = drill.game === 'arrowSorting' ? drill.config.arrowSet : drill.config.arrowsPerEnd;
	return Math.max(1, Math.round(arrows));
}

/** Whether this drill puts arrows at a face at all: the blind bale one is shot at nothing. */
export function usesFace(drill: Drill): boolean {
	return drillDefinition(drill.game).input === 'pad';
}
