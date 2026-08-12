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
export type BadgeIcon =
	| 'medal'
	| 'star'
	| 'target'
	| 'bow'
	| 'wrench'
	| 'sight'
	| 'storm'
	| 'snow'
	| 'sun'
	| 'chart';

export interface BadgeEnd {
	/** Which stage of the round the end belongs to, which is what gives it its face size. */
	stageIndex: number;
	arrows: number;
	subtotal: number;
	/** Arrows in the gold, meaning a 9 or better on a ten ring face. */
	golds: number;
	/** The worst arrow of the end, or null when nothing was entered. */
	lowest: number | null;
	/** Arrows that were plotted on the face, in normalised coordinates. Empty when none were. */
	plots: { x: number; y: number }[];
}

export interface BadgeActivity extends ScoredActivity {
	/** scoring | tuning */
	kind: string;
	/** practice | competition | qualification | planned */
	sessionKind: string;
	/** recurve | compound | barebow | longbow, or null when the outing recorded no bow at all. */
	bowType: string | null;
	windKmh: number | null;
	temperatureC: number | null;
	location: string | null;
	ends: BadgeEnd[];
}

export interface BadgeInput {
	activities: BadgeActivity[];
	/** Every sight mark ever written, so the fifth one on a bow can be dated. */
	sightMarks: { bowId: string; createdAt: number }[];
	/** Arrows a week of the current plans asks for, zero when no plan is running. */
	weekArrowGoal: number;
}

/** The same input with the orderings every rule wants, worked out once instead of per badge. */
interface History extends BadgeInput {
	/**
	 * Everything with an arrow in it, oldest first, counted arrows and untargeted practice alike:
	 * volume and habit are about arrows loosed, and a warm up is still shooting.
	 */
	shooting: BadgeActivity[];
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
/** Arrows in the end a group has to hold before its tightness says anything. */
const GROUP_ARROWS = 6;
/**
 * How far apart a group's two widest arrows may be and still be a handful, in face radii. The gold
 * ends at 0.2 of the radius, so it is 0.4 across, and a group that spans no more is one the gold
 * would cover: 24cm at 70m on a 122 face, 8cm at 18m on a 40. Held against the face rather than in
 * centimetres, because a fixed 12cm is a perfect end outdoors and a loose one indoors.
 */
const HANDFUL_SPREAD = 0.4;
/** The lowest arrow a round may hold and still be all in the red. */
const RED_VALUE = 7;
/** Outdoor rounds only, so a warm hall never earns the badges the weather is for. */
const OUTDOOR_METRES = 30;
const COLD_C = 10;
/** Rounds where a value is a ring on the ten ring face rather than a field or 3D zone. */
const TEN_RING = 'wa-10-ring';

function prepare(input: BadgeInput): History {
	const byDate = [...input.activities].sort((a, b) => a.startedAt - b.startedAt);
	const scoring = byDate.filter((a) => a.kind === 'scoring');
	return {
		...input,
		shooting: byDate.filter((a) => a.arrowsShot > 0),
		scoring,
		finished: scoring.filter(isComplete)
	};
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
	return history.shooting.reduce((sum, a) => sum + a.arrowsShot, 0);
}

/** Distinct days shot, oldest first, so the Nth of them dates a habit badge. */
function daysShot(history: History): number[] {
	const days = new Set(history.shooting.map((a) => startOfDay(a.startedAt)));
	return [...days].sort((a, b) => a - b);
}

/** Arrows per week shot, oldest week first. */
function weeks(history: History): { start: number; arrows: number; last: number }[] {
	const buckets = new Map<number, { start: number; arrows: number; last: number }>();
	for (const a of history.shooting) {
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

/** Runs of consecutive calendar days shot, as the run length reached on each of them. */
function dayRuns(history: History): { run: number; at: number }[] {
	const runs: { run: number; at: number }[] = [];
	let run = 0;
	let previous: number | null = null;
	for (const day of daysShot(history)) {
		// Stepped through the Date constructor, so a daylight saving change cannot break a streak.
		const after =
			previous === null
				? null
				: new Date(new Date(previous).getFullYear(), new Date(previous).getMonth(), new Date(previous).getDate() + 1).getTime();
		run = after !== null && day === after ? run + 1 : 1;
		previous = day;
		runs.push({ run, at: day });
	}
	return runs;
}

/** Runs of consecutive calendar months shot, counted the same way as the days. */
function monthRuns(history: History): { run: number; at: number }[] {
	const months = [
		...new Set(history.shooting.map((a) => new Date(a.startedAt).getFullYear() * 12 + new Date(a.startedAt).getMonth()))
	].sort((a, b) => a - b);

	const runs: { run: number; at: number }[] = [];
	let run = 0;
	let previous: number | null = null;
	for (const month of months) {
		run = previous !== null && month === previous + 1 ? run + 1 : 1;
		previous = month;
		runs.push({ run, at: new Date(Math.floor(month / 12), month % 12, 1).getTime() });
	}
	return runs;
}

/** The moment one outing's arrows first reached `target`, counting every activity in it. */
function whenSessionReached(history: History, target: number): number | null {
	const totals = new Map<string, number>();
	for (const activity of history.shooting) {
		const total = (totals.get(activity.sessionId) ?? 0) + activity.arrowsShot;
		totals.set(activity.sessionId, total);
		if (total >= target) return activity.startedAt;
	}
	return null;
}

function biggestSession(history: History): number {
	const totals = new Map<string, number>();
	for (const activity of history.shooting) {
		totals.set(activity.sessionId, (totals.get(activity.sessionId) ?? 0) + activity.arrowsShot);
	}
	return Math.max(0, ...totals.values());
}

/**
 * Whether the end holds every arrow the round asks for. A badge for what an end did is only ever
 * looked for in a round that was finished, and then only in a full end of it: a round abandoned
 * after one good volley is not what any of these are meant to mark.
 */
function fullEnd(activity: BadgeActivity, end: BadgeEnd): boolean {
	const asked = activity.round?.stages[end.stageIndex]?.arrowsPerEnd;
	return asked !== undefined && end.arrows >= asked;
}

/**
 * How far apart the two widest arrows of an end fell, in face radii. Every arrow has to have been
 * plotted: six tight arrows out of seven say nothing about where the seventh went.
 */
function groupSpread(end: BadgeEnd): number | null {
	if (end.plots.length < GROUP_ARROWS || end.plots.length < end.arrows) return null;

	let widest = 0;
	for (let i = 0; i < end.plots.length; i++) {
		for (let j = i + 1; j < end.plots.length; j++) {
			const a = end.plots[i];
			const b = end.plots[j];
			widest = Math.max(widest, Math.hypot(a.x - b.x, a.y - b.y));
		}
	}
	return widest;
}

/** How many times a round of each kind was shot to the end, in the order they were shot. */
function whenRepeated(history: History, target: number): number | null {
	const counts = new Map<string, number>();
	for (const activity of history.finished) {
		const count = (counts.get(roundKey(activity)) ?? 0) + 1;
		counts.set(roundKey(activity), count);
		if (count >= target) return activity.startedAt;
	}
	return null;
}

function mostRepeated(history: History): number {
	const counts = new Map<string, number>();
	for (const activity of history.finished) {
		counts.set(roundKey(activity), (counts.get(roundKey(activity)) ?? 0) + 1);
	}
	return Math.max(0, ...counts.values());
}

/** A place, as something two outings can be compared on: spelling and case are not the point. */
function placeOf(activity: BadgeActivity): string | null {
	const place = activity.location?.trim().toLowerCase();
	return place ? place : null;
}

/**
 * A round that was shot outdoors. Field, 3D and clout courses always are, whatever distance they
 * record: half of them are unmarked, and an unmarked course is not an indoor one.
 */
function outdoors(activity: BadgeActivity): boolean {
	const discipline = activity.round?.discipline;
	if (discipline === 'field' || discipline === '3d' || discipline === 'clout') return true;
	return longestDistance(activity) >= OUTDOOR_METRES;
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
		earnedAt: (h) => whenReached(h.shooting, (a) => a.arrowsShot, target),
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

/**
 * The FFTA progression arrows, from the federation's Règlements Généraux (édition février 2023),
 * see doc/badges.md. Thirty six arrows on the competition face for the distance, and a score to
 * beat. The first five are open to any bow, the metal ones ask for the bow they were written for.
 */
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
	{
		key: 'halfMarathon',
		family: 'volume',
		icon: 'chart',
		hintParams: { arrows: 210 },
		earnedAt: (h) => whenSessionReached(h, 210),
		progress: (h) => ({ current: biggestSession(h), target: 210 })
	},
	{
		key: 'marathon',
		family: 'volume',
		icon: 'chart',
		hintParams: { arrows: 420 },
		earnedAt: (h) => whenSessionReached(h, 420),
		progress: (h) => ({ current: biggestSession(h), target: 420 })
	},
	volume('thousandArrows', 1_000),
	volume('fiveThousandArrows', 5_000),
	volume('tenThousandArrows', 10_000),
	volume('twentyFiveThousandArrows', 25_000),

	habitDays('sevenDays', 7),
	habitDays('thirtyDays', 30),
	habitDays('hundredDays', 100),
	{
		key: 'threeDaysRunning',
		family: 'habit',
		icon: 'star',
		earnedAt: (h) => dayRuns(h).find((entry) => entry.run >= 3)?.at ?? null,
		progress: (h) => ({ current: Math.max(0, ...dayRuns(h).map((e) => e.run)), target: 3 })
	},
	{
		key: 'fourSeasons',
		family: 'habit',
		icon: 'star',
		earnedAt: (h) => monthRuns(h).find((entry) => entry.run >= 12)?.at ?? null,
		progress: (h) => ({ current: Math.max(0, ...monthRuns(h).map((e) => e.run)), target: 12 })
	},
	{
		key: 'groundhogDay',
		family: 'habit',
		icon: 'star',
		hintParams: { rounds: 25 },
		earnedAt: (h) => whenRepeated(h, 25),
		progress: (h) => ({ current: mostRepeated(h), target: 25 })
	},
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
				h.finished,
				(a) => a.countX > 0 && SEVENTY_METRE_ROUNDS.includes(a.roundDefinitionId ?? '')
			)
	},
	{
		key: 'thirtyAt18',
		family: 'accuracy',
		icon: 'target',
		earnedAt: (h) =>
			first(
				h.finished,
				(a) =>
					EIGHTEEN_METRE_ROUNDS.includes(a.roundDefinitionId ?? '') &&
					a.ends.some((end) => fullEnd(a, end) && end.arrows === 3 && end.subtotal === 30)
			)
	},
	{
		key: 'goldenEnd',
		family: 'accuracy',
		icon: 'target',
		// Ten ring rounds only: a 9 is the gold there, and means nothing on a field or 3D face.
		earnedAt: (h) =>
			first(
				h.finished,
				(a) =>
					a.round?.scoreSetId === TEN_RING &&
					a.ends.some(
						(end) => end.arrows >= GOLD_ARROW_END && fullEnd(a, end) && end.golds === end.arrows
					)
			)
	},

	{
		key: 'handfulOfArrows',
		family: 'accuracy',
		icon: 'target',
		hintParams: { arrows: GROUP_ARROWS },
		earnedAt: (h) =>
			first(h.finished, (a) =>
				a.ends.some((end) => {
					if (!fullEnd(a, end)) return false;
					const spread = groupSpread(end);
					return spread !== null && spread <= HANDFUL_SPREAD;
				})
			)
	},
	{
		key: 'iSeeRed',
		family: 'accuracy',
		icon: 'target',
		hintParams: { value: RED_VALUE },
		// Only on the ten ring face: a 7 on a field or 3D round is a different arrow entirely.
		earnedAt: (h) =>
			first(
				h.finished,
				(a) =>
					a.round?.scoreSetId === TEN_RING &&
					a.ends.length > 0 &&
					a.ends.every((end) => end.lowest !== null && end.lowest >= RED_VALUE)
			)
	},
	{
		key: 'tourist',
		family: 'milestone',
		icon: 'sun',
		earnedAt: (h) => whenDistinct(h.shooting, placeOf, 5),
		progress: (h) => ({ current: distinctCount(h.shooting, placeOf), target: 5 })
	},
	{
		key: 'frostbite',
		family: 'milestone',
		icon: 'snow',
		hintParams: { temp: COLD_C, metres: OUTDOOR_METRES },
		earnedAt: (h) =>
			first(
				h.finished,
				(a) => a.temperatureC !== null && a.temperatureC < COLD_C && outdoors(a)
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
		hintParams: { kmh: STRONG_WIND_KMH, metres: OUTDOOR_METRES },
		earnedAt: (h) =>
			first(
				h.finished,
				(a) => a.windKmh !== null && windBand(a.windKmh) === 'strong' && outdoors(a)
			)
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
