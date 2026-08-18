import { isComplete, shootsArrows, type ScoredActivity } from './stats';
import { maxScore } from './rounds/geometry';
import { getScoreSet, WA_10_RING } from './rounds/seed';
import type { RoundDefinition, RoundStage } from './rounds/types';
import { yardsToMetres } from './units';
import { BADGES } from './badges';
import type { MatchStage } from './matches';
import type { BotLevel } from './bots';

/**
 * Experience points, and the level they add up to.
 *
 * Everything here is a function of the state the app is in right now: no running total is stored, no
 * event is written when points are paid. Delete the session and the points it earned leave with it,
 * which is the only rule that keeps two devices holding the same history at the same level. Badges
 * are the one thing that outlives their shooting, and they do so because the badge row itself
 * outlives it, see doc/badges.md.
 */

export interface XpActivity extends ScoredActivity {
	/** scoring | match | tuning | freeScore | training | strength | running */
	kind: string;
	/**
	 * How a match the archer shot themselves ended. Null everywhere else, and on a card kept for
	 * somebody else: their win is not the archer's to be paid for.
	 */
	match?: { won: boolean; drawn: boolean; stage: MatchStage; bot: BotLevel | null } | null;
}

export interface XpInput {
	activities: XpActivity[];
	/** Keys of the badges actually held: a badge pays on its row, not on the rule that would earn it. */
	badges: string[];
}

export type XpSource = 'arrows' | 'rounds' | 'badges' | 'matches';

/** The order the experience page reads them in, widest basis first. */
export const XP_SOURCES: XpSource[] = ['arrows', 'rounds', 'badges', 'matches'];

export interface XpShare {
	xp: number;
	/**
	 * What produced it: arrows shot, rounds finished, badges held, matches won. A drawn match counts
	 * here too, because it paid: the label that quotes this figure says so.
	 */
	count: number;
}

export interface Experience {
	total: number;
	level: number;
	/** Points standing inside the current level, and what the whole of it costs. */
	into: number;
	span: number;
	toNext: number;
	/** The running total the next level starts at, which is the number the page counts up to. */
	nextLevelAt: number;
	sources: Record<XpSource, XpShare>;
}

/** Every arrow pays, whatever produced it: a warm up is still an arrow down the range. */
export const XP_PER_ARROW = 2;
/** Paid on top of the arrows, and only once the round has been shot to the end. */
export const XP_PER_ROUND_ARROW = 3;
export const XP_MATCH_WIN = 250;
/** A draw is a match survived rather than won, so it pays half. */
export const DRAW_SHARE = 0.5;
/** What a round still pays when nothing at all went in the middle, so a bad day is not a wasted one. */
export const SCORE_FLOOR = 0.5;

/**
 * The face an 18m indoor round is shot on, in centimetres per metre of distance. Difficulty is
 * measured against it because it is the round every archer has shot: a face twice as far for its
 * size is twice the shot to make, and that ratio is the whole of what distance and face size decide
 * together.
 */
export const REFERENCE_FACE_CM = 40;
export const REFERENCE_DISTANCE_M = 18;
const REFERENCE_FACE_PER_METRE = REFERENCE_FACE_CM / REFERENCE_DISTANCE_M;
/** Bounds on the multiplier, so an unusual round cannot pay a multiple of a normal one. */
export const MIN_DIFFICULTY = 0.5;
export const MAX_DIFFICULTY = 2;

/** A bracket climbed is worth more the further up it goes, and a final most of all. */
const STAGE_WEIGHT: Record<MatchStage, number> = {
	none: 1,
	r64: 1.1,
	r32: 1.2,
	r16: 1.3,
	quarter: 1.5,
	semi: 1.7,
	// Third place is still shot against whoever reached the semi finals, so it is worth the same.
	bronze: 1.7,
	final: 2
};

/** A person is worth the plain rate, since the app knows nothing about how well they shoot. */
const BOT_WEIGHT: Record<BotLevel, number> = {
	beginner: 0.6,
	amateur: 0.9,
	advanced: 1.2,
	professional: 1.5
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Nothing leaves here as NaN. A single corrupt face size or score would otherwise spread through the
 * total to the level, the bar and every share on the page, turning one unreadable row into an
 * unreadable app: a contribution that cannot be worked out is worth nothing instead.
 */
const finite = (xp: number) => (Number.isFinite(xp) ? Math.round(xp) : 0);

/**
 * How hard one stage of a round is to hit, as a multiple of an 18m indoor round. Its two ingredients
 * are the only ones on the card: how far away the face is, and how big it is.
 */
export function stageDifficulty(stage: RoundStage): number {
	// An unmarked field course judges its own distance, so there is no number here to be read.
	if (!stage.distance || stage.faceSize <= 0) return 1;
	const metres =
		stage.distance.unit === 'yd' ? yardsToMetres(stage.distance.value) : stage.distance.value;
	if (metres <= 0) return 1;
	const difficulty = REFERENCE_FACE_PER_METRE / (stage.faceSize / metres);
	// A face size that arrived unreadable leaves the round at the plain rate rather than at NaN.
	if (!Number.isFinite(difficulty)) return 1;
	return clamp(difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/** Weighted by the arrows each stage asks for, so a WA 1440 is not averaged as four equal quarters. */
export function roundDifficulty(round: RoundDefinition): number {
	let arrows = 0;
	let weighted = 0;
	for (const stage of round.stages) {
		const stageArrows = stage.ends * stage.arrowsPerEnd;
		arrows += stageArrows;
		weighted += stageArrows * stageDifficulty(stage);
	}
	return arrows > 0 ? weighted / arrows : 1;
}

/** An imported round may name a score set this app has never heard of, and still has to be valued. */
function scoreSetOf(round: RoundDefinition) {
	try {
		return getScoreSet(round.scoreSetId);
	} catch {
		return WA_10_RING;
	}
}

/**
 * What finishing a round paid. Only a round shot to the end: half a round is arrows, and the arrows
 * have already been paid for.
 */
export function roundXp(activity: XpActivity): number {
	if (activity.kind !== 'scoring' || !activity.round || !isComplete(activity)) return 0;
	const best = maxScore(activity.round, scoreSetOf(activity.round));
	const ratio = best > 0 ? clamp(activity.totalScore / best, 0, 1) : 0;
	const scored = SCORE_FLOOR + (1 - SCORE_FLOOR) * ratio;
	return finite(activity.arrowsShot * XP_PER_ROUND_ARROW * roundDifficulty(activity.round) * scored);
}

/** What a match result paid, on top of the arrows it took to get there. A loss pays nothing. */
export function matchXp(activity: XpActivity): number {
	const match = activity.match;
	if (!match || (!match.won && !match.drawn)) return 0;
	// A stage or a bot the catalogue does not know counts as the plain rate rather than as nothing.
	const opponent = (match.bot ? BOT_WEIGHT[match.bot] : 1) ?? 1;
	const share = match.won ? 1 : DRAW_SHARE;
	return finite(XP_MATCH_WIN * (STAGE_WEIGHT[match.stage] ?? 1) * opponent * share);
}

export function badgeXp(key: string): number {
	return BADGES.find((badge) => badge.key === key)?.xp ?? 0;
}

/** Points the level counts from, so level one starts at nothing and the curve steepens from there. */
export const LEVEL_STEP = 100;

export function xpForLevel(level: number): number {
	return LEVEL_STEP * Math.max(0, level - 1) ** 2;
}

export function levelAt(total: number): number {
	return Math.floor(Math.sqrt(Math.max(0, total) / LEVEL_STEP)) + 1;
}

/** Where the archer stands, and what got them there. */
export function experience(input: XpInput): Experience {
	const sources: Record<XpSource, XpShare> = {
		arrows: { xp: 0, count: 0 },
		rounds: { xp: 0, count: 0 },
		badges: { xp: 0, count: 0 },
		matches: { xp: 0, count: 0 }
	};

	for (const activity of input.activities) {
		// Only what was shot pays by the arrow: a set of reps carries no arrows and must earn none.
		const arrows = shootsArrows(activity.kind) ? finite(activity.arrowsShot) : 0;
		if (arrows > 0) {
			sources.arrows.xp += arrows * XP_PER_ARROW;
			sources.arrows.count += arrows;
		}
		const round = roundXp(activity);
		if (round > 0) {
			sources.rounds.xp += round;
			sources.rounds.count += 1;
		}
		const match = matchXp(activity);
		if (match > 0) {
			sources.matches.xp += match;
			sources.matches.count += 1;
		}
	}

	// A key with no badge behind it pays nothing, so a row left by an older catalogue cannot inflate.
	for (const key of new Set(input.badges)) {
		const xp = finite(badgeXp(key));
		if (xp <= 0) continue;
		sources.badges.xp += xp;
		sources.badges.count += 1;
	}

	const total = XP_SOURCES.reduce((sum, source) => sum + sources[source].xp, 0);
	const level = levelAt(total);
	const from = xpForLevel(level);
	const nextLevelAt = xpForLevel(level + 1);
	return {
		total,
		level,
		into: total - from,
		span: nextLevelAt - from,
		toNext: nextLevelAt - total,
		nextLevelAt,
		sources
	};
}
