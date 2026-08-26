import type { ScoreSet, Zone } from '../rounds/types';
import { scorableZones } from '../rounds/geometry';
import { getScoreSet } from '../rounds/seed';
import type { ArrowRanking, Drill, DrillConfig, DrillOutcome, DrillShot } from './types';

/**
 * What a drill has come to, read from its arrows every time rather than counted alongside them: a
 * total kept beside the shots can end up disagreeing with them, and an arrow corrected on the sheet
 * has to correct the reading with it.
 */

/** Rings compare by their place in the score set, not their value: the X and the 10 both score ten. */
export function ringRank(scoreSet: ScoreSet, label: string): number {
	const index = scoreSet.zones.findIndex((zone) => zone.label === label);
	// A ring this score set never heard of counts as a miss, not as the best thing on it.
	return index < 0 ? 0 : index;
}

export function meetsRing(scoreSet: ScoreSet, label: string, threshold: string): boolean {
	return ringRank(scoreSet, label) >= ringRank(scoreSet, threshold);
}

/** Inner rings are left out: calling for an X over the 10 beside it asks for an impossible aim. */
export function callPool(scoreSet: ScoreSet, threshold: string): Zone[] {
	return scorableZones(scoreSet)
		.filter((zone) => !zone.isInner && ringRank(scoreSet, zone.label) >= ringRank(scoreSet, threshold))
		.sort((a, b) => ringRank(scoreSet, a.label) - ringRank(scoreSet, b.label));
}

/** Random, so the caller stores what comes back: a call redrawn on a reload changed under the archer. */
export function drawCall(scoreSet: ScoreSet, config: DrillConfig, random = Math.random): string {
	const pool = callPool(scoreSet, config.thresholdLabel);
	if (pool.length === 0) return config.thresholdLabel;
	return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].label;
}

/** Plots per shaft below which the sorting drill is reading noise rather than a pattern. */
export const RANKING_MIN_SHOTS = 3;

function mean(values: number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function spreadOf(points: { x: number; y: number }[]): number {
	const cx = mean(points.map((p) => p.x));
	const cy = mean(points.map((p) => p.y));
	return Math.sqrt(mean(points.map((p) => (p.x - cx) ** 2 + (p.y - cy) ** 2)));
}

/**
 * Each numbered shaft against the rest of the set, worst first. Measured from the centre of the
 * other arrows, not of the target: a group that is all left is a sight to move, not a shaft to pull.
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

	return rankings.sort((a, b) => (b.offset ?? -1) - (a.offset ?? -1) || a.mean - b.mean);
}

/** Whether a ranking stands on enough arrows to name a shaft rather than a run of luck. */
export function rankingIsThin(ranking: ArrowRanking[]): boolean {
	return ranking.length < 3 || ranking.some((entry) => entry.shots < RANKING_MIN_SHOTS);
}

/**
 * The ladder, walked once for both the step reached and whether each arrow met the ring it was shot
 * at. A failure restarts the step it was on and never takes back a ring already won.
 */
function walkLadder(scoreSet: ScoreSet, config: DrillConfig, shots: DrillShot[]) {
	let step = 0;
	let cleared = 0;
	const met = shots.map((shot) => {
		if (step >= config.ladder.length) return true;
		const ok = meetsRing(scoreSet, shot.zoneLabel, config.ladder[step]);
		if (!ok) {
			cleared = 0;
			return false;
		}
		cleared += 1;
		if (cleared >= config.stepArrows) {
			step += 1;
			cleared = 0;
		}
		return true;
	});
	return { step, cleared, met };
}

/** Whether each arrow in turn met the rule of the drill it was shot in. */
function successes(scoreSet: ScoreSet, drill: Drill, shots: DrillShot[]): boolean[] {
	const { game, config, state } = drill;
	// Exactly the ring called, not merely as good: a 10 when the 7 was called is a miss.
	if (game === 'calledShot')
		return shots.map((shot, i) => state.calls[i] !== undefined && shot.zoneLabel === state.calls[i]);
	if (game === 'shrinkingZone') return walkLadder(scoreSet, config, shots).met;
	return shots.map((shot) => meetsRing(scoreSet, shot.zoneLabel, config.thresholdLabel));
}

/** Counted from when the clock was started, so a phone that slept comes back knowing the time is up. */
export function secondsLeft(drill: Drill, now: number): number | null {
	const { config, state } = drill;
	if (state.startedAt === null) return null;
	return Math.max(0, config.seconds - Math.floor((now - state.startedAt) / 1000));
}

/**
 * The whole reading of a drill. One function for all of them because they share nearly everything:
 * what differs is which figure is the headline and what stops the drill.
 */
export function summarise(drill: Drill, shots: DrillShot[], now = Date.now()): DrillOutcome {
	const { game, config, state } = drill;
	const scoreSet = getScoreSet(drill.face.scoreSetId);
	const met = successes(scoreSet, drill, shots);

	const arrows = game === 'blindBale' ? state.blindArrows : shots.length;
	const hits = met.filter(Boolean).length;
	const score = shots.reduce((sum, shot) => sum + shot.value, 0);

	let currentStreak = 0;
	let bestStreak = 0;
	for (const ok of met) {
		currentStreak = ok ? currentStreak + 1 : 0;
		bestStreak = Math.max(bestStreak, currentStreak);
	}

	const ladder = walkLadder(scoreSet, config, shots);
	const rated = game === 'successZone' || game === 'calledShot' || game === 'onePressure';

	const outcome: DrillOutcome = {
		arrows,
		hits,
		misses: met.length - hits,
		rate: rated && met.length > 0 ? hits / met.length : null,
		score,
		currentStreak,
		bestStreak,
		livesLeft: game === 'lives' ? Math.max(0, config.lives - (met.length - hits)) : null,
		step: ladder.step,
		stepLabel: config.ladder[ladder.step] ?? null,
		secondsLeft: secondsLeft(drill, now),
		called: game === 'calledShot' ? (state.calls[shots.length] ?? null) : null,
		ranking: game === 'arrowSorting' ? rankArrows(shots) : [],
		remaining: config.arrows === null ? null : Math.max(0, config.arrows - shots.length),
		done: false
	};

	outcome.done = isDone(drill, outcome);
	return outcome;
}

/** Stopping by hand always counts: several of these drills have no end of their own. */
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

export function isDrillDone(drill: Drill, shots: DrillShot[], now = Date.now()): boolean {
	return summarise(drill, shots, now).done;
}

/** Nothing may be entered once it is over, so a drill that ended on a miss keeps the miss. */
export function acceptsArrows(drill: Drill, shots: DrillShot[], now = Date.now()): boolean {
	return !summarise(drill, shots, now).done;
}
