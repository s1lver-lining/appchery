import {
	isComplete,
	isPersonalBest,
	roundKey,
	windBand,
	STRONG_WIND_KMH,
	type ScoredActivity
} from './stats';
import { startOfDay, startOfWeek } from './dates';
import { yardsToMetres } from './units';

/**
 * Goals worth a badge, and how to tell whether the shooting so far has reached them.
 *
 * Every rule here answers the same question: at what moment was this earned? A timestamp rather
 * than a yes or no, because a badge is dated by the shooting that won it, not by the day the app
 * happened to look. Awarding is the caller's job, see src/lib/db/repository.ts.
 */

export type BadgeFamily = 'volume' | 'habit' | 'record' | 'accuracy' | 'milestone' | 'ffta';

/** A subset of the icon set, named here so the domain never imports from the UI. */
export type BadgeIcon = 'medal' | 'star' | 'target' | 'bow' | 'wrench' | 'sight' | 'storm' | 'chart';

export interface BadgeEnd {
	arrows: number;
	subtotal: number;
	/** Arrows in the gold, meaning a 9 or better on a ten ring face. */
	golds: number;
}

export interface BadgeActivity extends ScoredActivity {
	/** scoring | tuning */
	kind: string;
	/** practice | competition | qualification | planned */
	sessionKind: string;
	/** recurve | compound | barebow | longbow, or null when the outing recorded no bow at all. */
	bowType: string | null;
	windKmh: number | null;
	ends: BadgeEnd[];
}

export interface BadgeInput {
	activities: BadgeActivity[];
	/** Every sight mark ever written, so the fifth one on a bow can be dated. */
	sightMarks: { bowId: string; createdAt: number }[];
	/** Arrows a week of the current plans asks for, zero when no plan is running. */
	weekArrowGoal: number;
}

/** The same input with the two orderings every rule wants, worked out once instead of per badge. */
interface History extends BadgeInput {
	/** Scored rounds, oldest first. */
	scoring: BadgeActivity[];
	/** Of those, the ones shot to the end. */
	finished: BadgeActivity[];
}

export interface BadgeDefinition {
	key: string;
	family: BadgeFamily;
	icon: BadgeIcon;
	/** Set on the award badges that only count when a particular bow was used. */
	bowType?: string;
	/** Figures the description quotes, so the rule and the words it is explained in cannot drift. */
	hintParams?: Record<string, string | number>;
	earnedAt: (history: History) => number | null;
	/** How far along an unearned badge is, when counting up to it means anything. */
	progress?: (history: History) => { current: number; target: number };
}

export interface EarnedBadge {
	definition: BadgeDefinition;
	/** Null while the badge is still to be earned. */
	earnedAt: number | null;
	progress: { current: number; target: number } | null;
}

const GOLD_ARROW_END = 6;

function prepare(input: BadgeInput): History {
	const scoring = input.activities
		.filter((a) => a.kind === 'scoring')
		.sort((a, b) => a.startedAt - b.startedAt);
	return { ...input, scoring, finished: scoring.filter(isComplete) };
}

/** When a running total first reached `target`, or null when the shooting never got there. */
function whenReached(
	activities: BadgeActivity[],
	amount: (activity: BadgeActivity) => number,
	target: number
): number | null {
	let total = 0;
	for (const activity of activities) {
		total += amount(activity);
		if (total >= target) return activity.startedAt;
	}
	return null;
}

/** The earliest activity that satisfies the rule, which is the moment the badge was won. */
function first(activities: BadgeActivity[], rule: (a: BadgeActivity) => boolean): number | null {
	return activities.find(rule)?.startedAt ?? null;
}

function totalArrows(history: History): number {
	return history.scoring.reduce((sum, a) => sum + a.arrowsShot, 0);
}

/** Distinct days shot, oldest first, so the Nth of them dates a habit badge. */
function daysShot(history: History): number[] {
	const days = new Set(history.scoring.filter((a) => a.arrowsShot > 0).map((a) => startOfDay(a.startedAt)));
	return [...days].sort((a, b) => a - b);
}

/** Arrows per week shot, oldest week first. */
function weeks(history: History): { start: number; arrows: number; last: number }[] {
	const buckets = new Map<number, { start: number; arrows: number; last: number }>();
	for (const a of history.scoring) {
		if (a.arrowsShot <= 0) continue;
		const start = startOfWeek(a.startedAt);
		const bucket = buckets.get(start) ?? { start, arrows: 0, last: a.startedAt };
		bucket.arrows += a.arrowsShot;
		bucket.last = Math.max(bucket.last, a.startedAt);
		buckets.set(start, bucket);
	}
	return [...buckets.values()].sort((a, b) => a.start - b.start);
}

const WEEK = 7 * 86_400_000;

/**
 * How long the run of weeks passing `rule` was at each week that passed it. Consecutive by the
 * calendar, not by the list: a week nobody shot in leaves no bucket, and it has to break the streak.
 */
function weekRuns(history: History, rule: (week: { arrows: number }) => boolean): { run: number; last: number }[] {
	const runs: { run: number; last: number }[] = [];
	let run = 0;
	let previous: number | null = null;
	for (const week of weeks(history)) {
		if (!rule(week)) run = 0;
		else run = previous !== null && week.start - previous === WEEK ? run + 1 : 1;
		previous = week.start;
		if (run > 0) runs.push({ run, last: week.last });
	}
	return runs;
}

/** The end of the first run of `length` back to back weeks. */
function weekStreak(
	history: History,
	length: number,
	rule: (week: { arrows: number }) => boolean
): number | null {
	return weekRuns(history, rule).find((entry) => entry.run >= length)?.last ?? null;
}

function longestWeekStreak(history: History, rule: (week: { arrows: number }) => boolean): number {
	return Math.max(0, ...weekRuns(history, rule).map((entry) => entry.run));
}

/** The activity that brought the count of distinct `keyOf` values up to `target`. */
function whenDistinct(
	activities: BadgeActivity[],
	keyOf: (a: BadgeActivity) => string | null,
	target: number
): number | null {
	const seen = new Set<string>();
	for (const activity of activities) {
		const key = keyOf(activity);
		if (key === null) continue;
		seen.add(key);
		if (seen.size >= target) return activity.startedAt;
	}
	return null;
}

function distinctCount(
	activities: BadgeActivity[],
	keyOf: (a: BadgeActivity) => string | null
): number {
	return new Set(activities.map(keyOf).filter((key): key is string => key !== null)).size;
}

/** The longest distance of a round, in metres, so a yard round is compared on the same scale. */
function longestDistance(activity: BadgeActivity): number {
	const distances = (activity.round?.stages ?? []).map((stage) =>
		stage.distance ? (stage.distance.unit === 'yd' ? yardsToMetres(stage.distance.value) : stage.distance.value) : 0
	);
	return Math.max(0, ...distances);
}

const SEVENTY_METRE_ROUNDS = ['wa720-70m', 'wa360-70m'];
const EIGHTEEN_METRE_ROUNDS = ['wa-indoor-18m', 'wa-indoor-300-18m'];
const COMPETITIVE = ['competition', 'qualification'];

/** Rounds that beat every earlier one of their kind, oldest first. */
function personalBests(history: History): BadgeActivity[] {
	return history.finished.filter((a) => isPersonalBest(a, history.finished));
}

function volume(key: string, target: number): BadgeDefinition {
	return {
		key,
		family: 'volume',
		icon: 'chart',
		earnedAt: (h) => whenReached(h.scoring, (a) => a.arrowsShot, target),
		progress: (h) => ({ current: totalArrows(h), target })
	};
}

function habitDays(key: string, target: number): BadgeDefinition {
	return {
		key,
		family: 'habit',
		icon: 'star',
		earnedAt: (h) => daysShot(h)[target - 1] ?? null,
		progress: (h) => ({ current: daysShot(h).length, target })
	};
}

/**
 * The FFTA progression arrows, from the federation's Règlements Généraux (édition février 2023),
 * see doc/badges.md. Thirty six arrows on the competition face for the distance, and a score to
 * beat. The first five are open to any bow, the metal ones ask for the bow they were written for.
 */
/** The colour the arrow is named for, which is the whole of its identity. */
export type ArrowColour =
	| 'white'
	| 'black'
	| 'blue'
	| 'red'
	| 'yellow'
	| 'bronze'
	| 'silver'
	| 'gold';

export interface ProgressionArrow {
	key: string;
	colour: ArrowColour;
	metres: number;
	faceSize: number;
	score: number;
	bowType?: string;
}

export const PROGRESSION_ARROWS: ProgressionArrow[] = [
	{ key: 'fftaWhite', colour: 'white', metres: 10, faceSize: 80, score: 280 },
	{ key: 'fftaBlack', colour: 'black', metres: 15, faceSize: 80, score: 280 },
	{ key: 'fftaBlue', colour: 'blue', metres: 20, faceSize: 80, score: 280 },
	{ key: 'fftaRed', colour: 'red', metres: 25, faceSize: 80, score: 280 },
	{ key: 'fftaYellow', colour: 'yellow', metres: 30, faceSize: 80, score: 280 },
	{ key: 'fftaBronzeRecurve', colour: 'bronze', metres: 40, faceSize: 80, score: 280, bowType: 'recurve' },
	{ key: 'fftaSilverRecurve', colour: 'silver', metres: 60, faceSize: 122, score: 280, bowType: 'recurve' },
	{ key: 'fftaGoldRecurve', colour: 'gold', metres: 70, faceSize: 122, score: 280, bowType: 'recurve' },
	{ key: 'fftaBronzeCompound', colour: 'bronze', metres: 40, faceSize: 80, score: 310, bowType: 'compound' },
	{ key: 'fftaSilverCompound', colour: 'silver', metres: 50, faceSize: 80, score: 310, bowType: 'compound' },
	{ key: 'fftaGoldCompound', colour: 'gold', metres: 50, faceSize: 80, score: 330, bowType: 'compound' }
];

/**
 * A round shot to the shape an arrow asks for. One stage of thirty six arrows at the right distance
 * on the right face: a WA 720 is not a progression arrow however good the score, and a bow the
 * outing did not record cannot prove a bow the arrow requires.
 */
function matchesArrow(activity: BadgeActivity, arrow: ProgressionArrow): boolean {
	const stages = activity.round?.stages ?? [];
	if (stages.length !== 1) return false;
	const [stage] = stages;
	if (!stage.distance || stage.faceSize !== arrow.faceSize) return false;
	if (stage.ends * stage.arrowsPerEnd !== 36) return false;
	const metres =
		stage.distance.unit === 'yd' ? yardsToMetres(stage.distance.value) : stage.distance.value;
	if (Math.round(metres) !== arrow.metres) return false;
	if (arrow.bowType !== undefined && activity.bowType !== arrow.bowType) return false;
	return activity.totalScore >= arrow.score;
}

function progressionArrow(arrow: ProgressionArrow): BadgeDefinition {
	return {
		key: arrow.key,
		family: 'ffta',
		icon: 'medal',
		bowType: arrow.bowType,
		earnedAt: (h) => first(h.finished, (a) => matchesArrow(a, arrow))
	};
}

export const BADGES: BadgeDefinition[] = [
	volume('thousandArrows', 1_000),
	volume('fiveThousandArrows', 5_000),
	volume('tenThousandArrows', 10_000),
	volume('twentyFiveThousandArrows', 25_000),

	habitDays('sevenDays', 7),
	habitDays('thirtyDays', 30),
	habitDays('hundredDays', 100),
	{
		key: 'everyWeek',
		family: 'habit',
		icon: 'star',
		earnedAt: (h) => weekStreak(h, 8, (week) => week.arrows > 0),
		progress: (h) => ({ current: longestWeekStreak(h, (week) => week.arrows > 0), target: 8 })
	},
	{
		key: 'onPlan',
		family: 'habit',
		icon: 'chart',
		// Judged against the goal the plans ask for today, because that is the only goal ever recorded.
		earnedAt: (h) =>
			h.weekArrowGoal > 0 ? weekStreak(h, 4, (week) => week.arrows >= h.weekArrowGoal) : null,
		progress: (h) => ({
			current:
				h.weekArrowGoal > 0 ? longestWeekStreak(h, (week) => week.arrows >= h.weekArrowGoal) : 0,
			target: 4
		})
	},

	{
		key: 'threeRecords',
		family: 'record',
		icon: 'medal',
		earnedAt: (h) => whenDistinct(personalBests(h), roundKey, 3),
		progress: (h) => ({ current: distinctCount(personalBests(h), roundKey), target: 3 })
	},

	{
		key: 'firstXAt70',
		family: 'accuracy',
		icon: 'target',
		earnedAt: (h) =>
			first(
				h.scoring,
				(a) => a.countX > 0 && SEVENTY_METRE_ROUNDS.includes(a.roundDefinitionId ?? '')
			)
	},
	{
		key: 'thirtyAt18',
		family: 'accuracy',
		icon: 'target',
		earnedAt: (h) =>
			first(
				h.scoring,
				(a) =>
					EIGHTEEN_METRE_ROUNDS.includes(a.roundDefinitionId ?? '') &&
					a.ends.some((end) => end.arrows === 3 && end.subtotal === 30)
			)
	},
	{
		key: 'goldenEnd',
		family: 'accuracy',
		icon: 'target',
		earnedAt: (h) =>
			first(h.scoring, (a) =>
				a.ends.some((end) => end.arrows >= GOLD_ARROW_END && end.golds === end.arrows)
			)
	},

	{
		key: 'firstCompetition',
		family: 'milestone',
		icon: 'medal',
		earnedAt: (h) => first(h.finished, (a) => COMPETITIVE.includes(a.sessionKind))
	},
	{
		key: 'twoBowTypes',
		family: 'milestone',
		icon: 'bow',
		earnedAt: (h) => whenDistinct(h.scoring, (a) => a.bowType, 2),
		progress: (h) => ({ current: distinctCount(h.scoring, (a) => a.bowType), target: 2 })
	},
	{
		key: 'seventyMetres',
		family: 'milestone',
		icon: 'target',
		earnedAt: (h) => first(h.finished, (a) => longestDistance(a) >= 70)
	},
	{
		key: 'ninetyMetres',
		family: 'milestone',
		icon: 'target',
		earnedAt: (h) => first(h.finished, (a) => longestDistance(a) >= 90)
	},
	{
		key: 'firstTuning',
		family: 'milestone',
		icon: 'wrench',
		earnedAt: (h) =>
			first(
				[...h.activities].sort((a, b) => a.startedAt - b.startedAt),
				(a) => a.kind === 'tuning'
			)
	},
	{
		key: 'fiveSightMarks',
		family: 'milestone',
		icon: 'sight',
		earnedAt: (h) => {
			const perBow = new Map<string, number[]>();
			for (const mark of [...h.sightMarks].sort((a, b) => a.createdAt - b.createdAt)) {
				const list = perBow.get(mark.bowId) ?? [];
				list.push(mark.createdAt);
				perBow.set(mark.bowId, list);
				if (list.length >= 5) return mark.createdAt;
			}
			return null;
		},
		progress: (h) => {
			const perBow = new Map<string, number>();
			for (const mark of h.sightMarks) perBow.set(mark.bowId, (perBow.get(mark.bowId) ?? 0) + 1);
			return { current: Math.max(0, ...perBow.values()), target: 5 };
		}
	},
	{
		key: 'stormArcher',
		family: 'milestone',
		icon: 'storm',
		hintParams: { kmh: STRONG_WIND_KMH },
		earnedAt: (h) =>
			first(h.finished, (a) => a.windKmh !== null && windBand(a.windKmh) === 'strong')
	},

	...PROGRESSION_ARROWS.map(progressionArrow)
];

/** Every badge, earned or not, with how close the unearned ones are. */
export function evaluateBadges(input: BadgeInput): EarnedBadge[] {
	const history = prepare(input);
	return BADGES.map((definition) => {
		const earnedAt = definition.earnedAt(history);
		return {
			definition,
			earnedAt,
			progress: earnedAt === null ? (definition.progress?.(history) ?? null) : null
		};
	});
}

/** The order the badges page reads in: won first, newest win at the top, then what is left to chase. */
export function sortBadges(badges: EarnedBadge[]): EarnedBadge[] {
	return [...badges].sort((a, b) => {
		if (a.earnedAt !== null && b.earnedAt !== null) return b.earnedAt - a.earnedAt;
		if (a.earnedAt !== null) return -1;
		if (b.earnedAt !== null) return 1;
		return share(b) - share(a);
	});
}

function share(badge: EarnedBadge): number {
	return badge.progress && badge.progress.target > 0
		? badge.progress.current / badge.progress.target
		: 0;
}
