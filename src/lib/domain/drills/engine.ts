import type { ScoreSet, Zone } from '../rounds/types';
import { scorableZones } from '../rounds/geometry';
import { getScoreSet } from '../rounds/seed';
import type { ArrowRanking, Drill, DrillConfig, DrillOutcome, DrillShot } from './types';

/**
 * What a drill has come to, worked out from its arrows.
 *
 * Pure, and deliberately without a counter of its own: everything here is derived from the shots
 * every time it is asked for, so an arrow corrected on the sheet afterwards corrects the reading
 * with it. A running total kept beside the arrows is a total that can end up disagreeing with them,
 * and a drill whose headline disagrees with its own score sheet is worse than no headline.
 */

/**
 * How far in a ring is, as its place in the score set rather than as its value: the X and the 10
 * score the same and are not the same ring, and a threshold that could not tell them apart could
 * not express the one drill every archer sets themselves.
 */
export function ringRank(scoreSet: ScoreSet, label: string): number {
	const index = scoreSet.zones.findIndex((zone) => zone.label === label);
	// A ring this score set has never heard of counts as a miss rather than as the best thing on it.
	return index < 0 ? 0 : index;
}

/** Whether an arrow met a threshold: at the ring asked for, or inside it. */
export function meetsRing(scoreSet: ScoreSet, label: string, threshold: string): boolean {
	return ringRank(scoreSet, label) >= ringRank(scoreSet, threshold);
}

/**
 * The rings a called shot drill draws from: the threshold ring and everything inside it, less the
 * inner rings that only break ties. Calling for an X when the 10 beside it scores the same would be
 * asking for a distinction the archer cannot aim at.
 */
export function callPool(scoreSet: ScoreSet, threshold: string): Zone[] {
	return scorableZones(scoreSet)
		.filter((zone) => !zone.isInner && ringRank(scoreSet, zone.label) >= ringRank(scoreSet, threshold))
		// Outermost first, so a pool is the same list however the keypad happens to be ordered.
		.sort((a, b) => ringRank(scoreSet, a.label) - ringRank(scoreSet, b.label));
}

/**
 * The ring to call next. Random by nature, so the caller stores what comes back rather than asking
 * again: a call redrawn on a reload is a call that changed while the arrow was on the string.
 */
export function drawCall(scoreSet: ScoreSet, config: DrillConfig, random = Math.random): string {
	const pool = callPool(scoreSet, config.thresholdLabel);
	if (pool.length === 0) return config.thresholdLabel;
	return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].label;
}

function mean(values: number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Root mean square distance from a group's own centre: how widely that shaft groups against itself. */
function spreadOf(points: { x: number; y: number }[]): number {
	const cx = mean(points.map((p) => p.x));
	const cy = mean(points.map((p) => p.y));
	return Math.sqrt(mean(points.map((p) => (p.x - cx) ** 2 + (p.y - cy) ** 2)));
}

/**
 * Each numbered shaft against the rest of the set, worst first.
 *
 * Measured from the centre of the other arrows rather than from the centre of the target, for the
 * reason arrowDrift.ts is careful about too: an archer whose whole group is left has a sight to move
 * and no shaft to blame, and this must stay quiet about that.
 */
export function rankArrows(shots: DrillShot[]): ArrowRanking[] {
	const byOrdinal = new Map<number, DrillShot[]>();
	for (const shot of shots) {
		const bucket = byOrdinal.get(shot.ordinal);
		if (bucket) bucket.push(shot);
		else byOrdinal.set(shot.ordinal, [shot]);
	}

	const plotted = (list: DrillShot[]) =>
		list.filter((s): s is DrillShot & { x: number; y: number } => s.x !== null && s.y !== null);

	const rankings = [...byOrdinal.entries()].map(([ordinal, mine]) => {
		const minePlots = plotted(mine);
		const otherPlots = plotted(shots.filter((shot) => shot.ordinal !== ordinal));
		let offset: number | null = null;
		if (minePlots.length > 0 && otherPlots.length > 0) {
			const dx = mean(minePlots.map((p) => p.x)) - mean(otherPlots.map((p) => p.x));
			const dy = mean(minePlots.map((p) => p.y)) - mean(otherPlots.map((p) => p.y));
			offset = Math.hypot(dx, dy);
		}
		return {
			ordinal,
			shots: mine.length,
			mean: mean(mine.map((s) => s.value)),
			offset,
			spread: minePlots.length > 1 ? spreadOf(minePlots) : null
		};
	});

	// Worst first: the shaft that lands furthest from the others, then the one that scores least.
	return rankings.sort((a, b) => (b.offset ?? -1) - (a.offset ?? -1) || a.mean - b.mean);
}

/**
 * Where a shrinking zone drill has got to: the step reached and how many of that step's arrows are
 * already in. The run has to be unbroken, so a failure drops the archer back to the start of the
 * step they are on and never off the step itself: a drill that took a ring back would be one nobody
 * ever finished.
 */
function walkLadder(
	scoreSet: ScoreSet,
	config: DrillConfig,
	shots: DrillShot[]
): { step: number; cleared: number } {
	let step = 0;
	let cleared = 0;
	for (const shot of shots) {
		if (step >= config.ladder.length) break;
		if (meetsRing(scoreSet, shot.zoneLabel, config.ladder[step])) {
			cleared += 1;
			if (cleared >= config.stepArrows) {
				step += 1;
				cleared = 0;
			}
		} else {
			cleared = 0;
		}
	}
	return { step, cleared };
}

/** Whether each arrow in turn met the rule of the drill it was shot in. */
function successes(scoreSet: ScoreSet, drill: Drill, shots: DrillShot[]): boolean[] {
	const { game, config, state } = drill;
	if (game === 'calledShot') {
		// Exactly the ring called, not merely as good: hitting a 10 when the 7 was called is a miss.
		return shots.map((shot, i) => state.calls[i] !== undefined && shot.zoneLabel === state.calls[i]);
	}
	if (game === 'shrinkingZone') {
		let step = 0;
		let cleared = 0;
		return shots.map((shot) => {
			if (step >= config.ladder.length) return true;
			const met = meetsRing(scoreSet, shot.zoneLabel, config.ladder[step]);
			if (met) {
				cleared += 1;
				if (cleared >= config.stepArrows) {
					step += 1;
					cleared = 0;
				}
			} else cleared = 0;
			return met;
		});
	}
	return shots.map((shot) => meetsRing(scoreSet, shot.zoneLabel, config.thresholdLabel));
}

/** Seconds still on the clock, or null when this drill runs against none or has not started one. */
export function secondsLeft(drill: Drill, now: number): number | null {
	const { config, state } = drill;
	if (state.startedAt === null) return null;
	return Math.max(0, config.seconds - Math.floor((now - state.startedAt) / 1000));
}

/**
 * The whole reading of a drill. One function rather than one per game because they share almost all
 * of it: what differs between them is which figure is the headline and what stops the drill, and
 * both of those are a line each.
 */
export function summarise(drill: Drill, shots: DrillShot[], now = Date.now()): DrillOutcome {
	const { game, config, state } = drill;
	const scoreSet = getScoreSet(drill.face.scoreSetId);
	const met = successes(scoreSet, drill, shots);

	const arrows = game === 'blindBale' ? state.blindArrows : shots.length;
	const hits = met.filter(Boolean).length;
	const misses = met.length - hits;
	const score = shots.reduce((sum, shot) => sum + shot.value, 0);

	let currentStreak = 0;
	let bestStreak = 0;
	for (const ok of met) {
		currentStreak = ok ? currentStreak + 1 : 0;
		bestStreak = Math.max(bestStreak, currentStreak);
	}

	const ladder = walkLadder(scoreSet, config, shots);
	const clock = secondsLeft(drill, now);
	const livesLeft = game === 'lives' ? Math.max(0, config.lives - misses) : null;

	// Which figure this game is actually about, and so which games get a rate at all.
	const rated = game === 'successZone' || game === 'calledShot' || game === 'onePressure';

	const outcome: DrillOutcome = {
		arrows,
		hits,
		misses,
		rate: rated && met.length > 0 ? hits / met.length : null,
		score,
		currentStreak,
		bestStreak,
		livesLeft,
		step: ladder.step,
		stepLabel: config.ladder[ladder.step] ?? null,
		secondsLeft: clock,
		called: game === 'calledShot' ? (state.calls[shots.length] ?? null) : null,
		ranking: game === 'arrowSorting' ? rankArrows(shots) : [],
		remaining: config.arrows === null ? null : Math.max(0, config.arrows - shots.length),
		done: false
	};

	outcome.done = isDone(drill, outcome);
	return outcome;
}

/**
 * What stops each drill. Stopping it by hand always counts, because several of these have no natural
 * end at all: a streak drill is over when the archer says it is.
 */
function isDone(drill: Drill, outcome: DrillOutcome): boolean {
	const { game, config, state } = drill;
	if (state.endedAt !== null) return true;
	switch (game) {
		case 'lives':
			return outcome.arrows > 0 && (outcome.livesLeft ?? 1) <= 0;
		case 'shrinkingZone':
			return outcome.step >= config.ladder.length;
		case 'targetScore':
			return outcome.score >= config.goal;
		case 'beatTheClock':
			return state.startedAt !== null && (outcome.secondsLeft ?? 1) <= 0;
		case 'blindBale':
			return false;
		default:
			return config.arrows !== null && outcome.arrows >= config.arrows;
	}
}

/** The status the row is filed under, which is the same question the outcome already answers. */
export function isDrillDone(drill: Drill, shots: DrillShot[], now = Date.now()): boolean {
	return summarise(drill, shots, now).done;
}

/**
 * The arrows the drill is still ready to take. Nothing may be entered once it is over, which is what
 * makes a drill that ended on a miss keep the miss it ended on.
 */
export function acceptsArrows(drill: Drill, shots: DrillShot[], now = Date.now()): boolean {
	return !summarise(drill, shots, now).done;
}
