import { isRoundComplete } from './rounds/geometry';
import { startOfDay, startOfWeek } from './dates';
import { ROUNDS, WA_10_RING, getScoreSet } from './rounds/seed';
import type { RoundDefinition } from './rounds/types';

export interface ScoredActivity {
	id: string;
	sessionId: string;
	startedAt: number;
	totalScore: number;
	arrowsShot: number;
	count10s: number;
	countX: number;
	roundDefinitionId: string | null;
	round: RoundDefinition | null;
}

/** A scored round carries what it scored; anything else that was shot only carries its arrows. */
export interface ActivityLike extends ScoredActivity {
	kind: string;
}

/**
 * The kinds of activity that put arrows downrange. Strength work and running are activities of a
 * session too, and neither shoots anything: an hour of bandwork must never turn up as arrows, as a
 * score, or as a round average, because a volume that counted it would be a lie about the shooting.
 *
 * An unknown kind counts as shooting nothing, so a kind added without being thought about here
 * stays out of the figures rather than quietly joining them.
 */
export const SHOOTING_KINDS = ['scoring', 'match', 'tuning', 'freeScore', 'training'] as const;

export function shootsArrows(kind: string): boolean {
	return (SHOOTING_KINDS as readonly string[]).includes(kind);
}

/**
 * Every arrow the app knows about, whatever produced it: a scored round, a match, a tuning procedure
 * or the free arrows counter. Volume is a count of arrows, so leaving any of them out makes one
 * figure disagree with another over the same afternoon.
 *
 * Only a round carries a score, so everything else arrives with none: an average, a personal best
 * and a round card are questions a round answers, and a bare shaft session is not one.
 */
export function toVolume(activities: ActivityLike[]): ActivityLike[] {
	return activities
		.filter((activity) => activity.arrowsShot > 0 && shootsArrows(activity.kind))
		.map((activity) =>
			activity.kind === 'scoring'
				? activity
				: {
						...activity,
						totalScore: 0,
						count10s: 0,
						countX: 0,
						roundDefinitionId: null,
						round: null
					}
		);
}

/** What the round chip calls the arrows that belong to no round, in the order it offers them. */
export const VOLUME_KINDS = ['match', 'tuning', 'freeScore', 'training'] as const;

/**
 * What the round chip files an activity under: the shape it was shot at, or what it was when there
 * was no round. A match, a procedure and the free arrows counter are arrows shot, so a chip reading
 * volume has to be able to name them rather than dropping them into one nameless heap.
 */
export function volumeRoundKey(activity: ScoredActivity & { kind?: string }): string {
	const kind = activity.kind ?? 'scoring';
	return kind === 'scoring' ? shapeKey(activity.round) : `kind:${kind}`;
}

/** Completion is derived from the arrows entered, so an edited round never needs a status fixing up. */
export function isComplete(activity: ScoredActivity): boolean {
	return isRoundComplete(activity.round, activity.arrowsShot);
}

export type StatsRange = 'all' | 'year' | 'month';

/**
 * A rolling window rather than a calendar one: on the second of the month an archer wants the last
 * thirty days of work, not the two days since the first.
 */
export function withinRange(range: StatsRange, at: number, now = Date.now()): boolean {
	if (range === 'all') return true;
	const from = new Date(now);
	const day = from.getDate();
	if (range === 'year') from.setFullYear(from.getFullYear() - 1);
	else from.setMonth(from.getMonth() - 1);
	// A day the shorter month does not have rolls into the next one, which would cut the window short.
	if (from.getDate() !== day) from.setDate(0);
	return at >= from.getTime();
}

export function inRange(
	activities: ScoredActivity[],
	range: StatsRange,
	now = Date.now()
): ScoredActivity[] {
	return activities.filter((a) => withinRange(range, a.startedAt, now));
}

export interface MonthVolume {
	/** Sortable and locale free: the UI formats it for display. */
	month: string;
	arrows: number;
}

export interface DayVolume {
	/** Midnight local time, so the UI can format it however the language asks. */
	at: number;
	arrows: number;
}

/**
 * One bar per day over the last `days`, contiguous. A month of monthly bars is a single bar, which
 * says nothing: over a short window the useful grain is the day.
 */
export function dailyVolume(
	activities: ScoredActivity[],
	days = 30,
	now = Date.now()
): DayVolume[] {
	const perDay = new Map<number, number>();
	for (const activity of activities) {
		if (activity.arrowsShot <= 0) continue;
		perDay.set(
			startOfDay(activity.startedAt),
			(perDay.get(startOfDay(activity.startedAt)) ?? 0) + activity.arrowsShot
		);
	}

	const today = new Date(startOfDay(now));
	const series: DayVolume[] = [];
	for (let i = days - 1; i >= 0; i--) {
		// Stepped through the Date constructor so a daylight saving change cannot drop a day.
		const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i).getTime();
		series.push({ at, arrows: perDay.get(at) ?? 0 });
	}
	return series;
}

export type Grain = 'day' | 'week' | 'month';

const DAY_MS = 86_400_000;

/** Enough bars to show a shape, few enough to stay a finger wide on a phone. */
export function pickGrain(from: number, to: number): Grain {
	const days = (to - from) / DAY_MS;
	if (days <= 70) return 'day';
	if (days <= 400) return 'week';
	return 'month';
}

function startOfGrain(at: number, grain: Grain): number {
	if (grain === 'day') return startOfDay(at);
	if (grain === 'week') return startOfWeek(at);
	const date = new Date(at);
	return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function nextGrain(at: number, grain: Grain): number {
	// Stepped through the Date constructor so a daylight saving change cannot drop a bucket.
	const date = new Date(at);
	if (grain === 'day')
		return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
	if (grain === 'week')
		return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getTime();
	return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
}

export interface VolumeBucket {
	/** Start of the bucket, local midnight, which doubles as its key. */
	at: number;
	arrows: number;
	rounds: number;
	/** Score per arrow over the bucket, null where nothing was shot rather than a misleading zero. */
	perArrow: number | null;
	/** Split by the key the bars are coloured on, usually the kind of session. */
	byKey: Record<string, { arrows: number; rounds: number }>;
}

/** The last day a bucket covers, so a bar can say which span it stands for and not just where it starts. */
export function grainEnd(at: number, grain: Grain): number {
	return startOfDay(nextGrain(at, grain) - DAY_MS);
}

/**
 * The main chart's series: contiguous buckets between two instants, each split by a key so the bars
 * can be stacked. Every arrow counts, finished round or not, because volume is what was loosed.
 */
export function volumeSeries(
	activities: ScoredActivity[],
	from: number,
	to: number,
	grain: Grain,
	keyOf: (activity: ScoredActivity) => string
): VolumeBucket[] {
	const buckets = new Map<number, VolumeBucket & { score: number }>();
	for (let at = startOfGrain(from, grain); at <= to; at = nextGrain(at, grain)) {
		buckets.set(at, {
			at,
			arrows: 0,
			rounds: 0,
			perArrow: null,
			byKey: {},
			score: 0
		});
	}

	for (const activity of activities) {
		if (activity.arrowsShot <= 0) continue;
		const bucket = buckets.get(startOfGrain(activity.startedAt, grain));
		if (!bucket) continue;
		const key = keyOf(activity);
		bucket.arrows += activity.arrowsShot;
		bucket.rounds += 1;
		bucket.score += activity.totalScore;
		const slice = bucket.byKey[key] ?? { arrows: 0, rounds: 0 };
		bucket.byKey[key] = {
			arrows: slice.arrows + activity.arrowsShot,
			rounds: slice.rounds + 1
		};
	}

	return [...buckets.values()].map(({ score, ...bucket }) => ({
		...bucket,
		perArrow: bucket.arrows > 0 ? score / bucket.arrows : null
	}));
}

export interface Overview {
	/** Every arrow entered, whether or not its round was finished. */
	arrows: number;
	rounds: number;
	completeRounds: number;
	/** Distinct calendar days shot, a better measure of habit than a round count. */
	days: number;
	sessions: number;
	averagePerArrow: number;
	/** Contiguous months so gaps in the bar chart read as time off, not as missing data. */
	byMonth: MonthVolume[];
	byRound: { name: string; arrows: number }[];
}

function monthKey(at: number): string {
	const date = new Date(at);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The picture across everything shot, regardless of discipline. Volume is the honest total: leaving
 * out unfinished rounds would undercount arrows the archer actually loosed.
 */
export function overview(activities: ScoredActivity[], months = 12): Overview {
	const shot = activities.filter((a) => a.arrowsShot > 0);
	const arrows = shot.reduce((sum, a) => sum + a.arrowsShot, 0);
	const score = shot.reduce((sum, a) => sum + a.totalScore, 0);

	const perMonth = new Map<string, number>();
	const perRound = new Map<string, number>();
	const days = new Set<string>();
	for (const a of shot) {
		perMonth.set(monthKey(a.startedAt), (perMonth.get(monthKey(a.startedAt)) ?? 0) + a.arrowsShot);
		// Named by what was shot rather than by what it was called, the way the round cards group.
		const name = roundName(a.round);
		perRound.set(name, (perRound.get(name) ?? 0) + a.arrowsShot);
		days.add(new Date(a.startedAt).toDateString());
	}

	const now = new Date();
	const byMonth: MonthVolume[] = [];
	for (let i = months - 1; i >= 0; i--) {
		const at = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
		byMonth.push({
			month: monthKey(at),
			arrows: perMonth.get(monthKey(at)) ?? 0
		});
	}

	return {
		arrows,
		rounds: shot.length,
		completeRounds: shot.filter(isComplete).length,
		days: days.size,
		sessions: new Set(shot.map((a) => a.sessionId)).size,
		averagePerArrow: arrows > 0 ? score / arrows : 0,
		byMonth,
		byRound: [...perRound.entries()]
			.map(([name, count]) => ({ name, arrows: count }))
			.sort((a, b) => b.arrows - a.arrows)
	};
}

export interface RoundSummary {
	key: string;
	name: string;
	/**
	 * Whether the shape matches a round the rules define. Practice shapes are still summarised, but
	 * the page keeps its per round cards to the standard distances.
	 */
	known: boolean;
	/** Best score, and the activity that holds it. */
	best: ScoredActivity;
	/** Chronological, oldest first, for the trend line. */
	history: ScoredActivity[];
	average: number;
	/** Change between the first and last third of the history, null when too short to mean anything. */
	trend: number | null;
}

/**
 * Personal bests are a query, never a stored column, so there is no denormalised state to invalidate
 * when an arrow is edited.
 *
 * Only complete activities count: a half-shot round has a lower total for a reason that has nothing
 * to do with how well it was shot.
 */
export function summariseByRound(activities: ScoredActivity[]): RoundSummary[] {
	const complete = activities.filter(isComplete);

	const buckets = new Map<string, ScoredActivity[]>();
	for (const activity of complete) {
		const key = roundKey(activity);
		const bucket = buckets.get(key);
		if (bucket) bucket.push(activity);
		else buckets.set(key, [activity]);
	}

	return [...buckets.entries()]
		.map(([key, list]) => {
			const history = [...list].sort((a, b) => a.startedAt - b.startedAt);
			const best = history.reduce((top, a) => (compareScores(a, top) > 0 ? a : top));
			const average = history.reduce((sum, a) => sum + a.totalScore, 0) / history.length;
			const standard = standardRound(history[0].round);
			return {
				key,
				name: roundName(history[0].round),
				known: standard !== null,
				best,
				history,
				average,
				trend: trendOf(history)
			};
		})
		.sort(
			(a, b) =>
				b.history[b.history.length - 1].startedAt - a.history[a.history.length - 1].startedAt
		);
}

/**
 * What a round is compared against: what was shot, never what it was called. A WA 720 picked from
 * the list and the same twelve ends built by hand are one round type, and two rounds sharing a name
 * but not a distance are not.
 */
export function roundKey(activity: ScoredActivity): string {
	return shapeKey(activity.round);
}

/** The round the rules define with this shape, null for a practice shape of its own invention. */
export function standardRound(round: RoundDefinition | null): RoundDefinition | null {
	if (!round) return null;
	return ROUNDS.find((known) => shapeKey(known) === shapeKey(round)) ?? null;
}

/** What an unnamed shape is called: what it is made of, in the order an archer would say it. */
export function shapeName(round: RoundDefinition | null): string {
	if (!round) return '?';
	const stage = round.stages[0];
	if (!stage) return '?';
	const arrows = round.stages.reduce((sum, s) => sum + s.ends * s.arrowsPerEnd, 0);
	// A field course judged by eye has no distance to name, and a placeholder zero would be a lie.
	const marked =
		stage.distance && stage.distance.value > 0
			? [`${stage.distance.value}${stage.distance.unit}`]
			: [];
	const shape = [...marked, `${stage.faceSize}cm`, String(arrows)].join(' · ');
	// The face is named only when it is not the ten ring everything else on the page assumes.
	if (round.scoreSetId === WA_10_RING.id) return shape;
	return `${shape} · ${getScoreSet(round.scoreSetId).name}`;
}

/**
 * What one round type is called, wherever it is listed. Read from the round rather than from a
 * summary, so a round still being shot is named too: it has not earned a card yet, but it is on the
 * chart and in the filters from the first arrow.
 */
export function roundName(round: RoundDefinition | null): string {
	return standardRound(round)?.name ?? shapeName(round);
}

/**
 * Whether a finished round beats every earlier one of its kind. A first round of a kind is not a
 * record: there is nothing it improved on, and saying so cheapens the ones that follow.
 */
export function isPersonalBest(activity: ScoredActivity, history: ScoredActivity[]): boolean {
	if (!isComplete(activity)) return false;
	const earlier = history.filter(
		(a) =>
			a.id !== activity.id &&
			a.startedAt <= activity.startedAt &&
			isComplete(a) &&
			roundKey(a) === roundKey(activity)
	);
	return earlier.length > 0 && earlier.every((a) => compareScores(activity, a) > 0);
}

/** The score set is part of the shape: identical geometry on a field face is a different round. */
export function shapeKey(round: RoundDefinition | null): string {
	if (!round) return 'unknown';
	const stages = round.stages
		.map(
			(s) =>
				`${s.distance?.value ?? 'u'}${s.distance?.unit ?? ''}-${s.faceSize}-${s.ends}x${s.arrowsPerEnd}`
		)
		.join('|');
	return `${round.scoreSetId}:${stages}`;
}

/** Ties break on tens then Xs, the standard rule. */
export function compareScores(a: ScoredActivity, b: ScoredActivity): number {
	if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
	if (a.count10s !== b.count10s) return a.count10s - b.count10s;
	return a.countX - b.countX;
}

/**
 * Spread of the last `window` rounds, as a standard deviation of the score per arrow. An archer
 * plateaus on average long before they plateau on consistency, so the mean alone hides the work.
 */
export function consistency(history: ScoredActivity[], window = 10): number | null {
	const recent = history.slice(-window).filter((a) => a.arrowsShot > 0);
	if (recent.length < 3) return null;
	const rates = recent.map((a) => a.totalScore / a.arrowsShot);
	const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
	const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length;
	return Math.sqrt(variance);
}

export interface ProgressionPoint {
	at: number;
	score: number;
	/** Mean of this round and the ones before it, up to `window`, which is the line worth reading. */
	rolling: number;
	isBest: boolean;
}

/** The history of one round, chronological, with the running average and the best marked. */
export function progression(history: ScoredActivity[], window = 5): ProgressionPoint[] {
	let best: number | null = null;
	return history.map((activity, i) => {
		const slice = history.slice(Math.max(0, i - window + 1), i + 1);
		const rolling = slice.reduce((sum, a) => sum + a.totalScore, 0) / slice.length;
		// The first round improved on nothing, so it is no record here either, see isPersonalBest.
		const isBest = best !== null && activity.totalScore > best;
		if (best === null || activity.totalScore > best) best = activity.totalScore;
		return {
			at: activity.startedAt,
			score: activity.totalScore,
			rolling,
			isBest
		};
	});
}

export interface EndLike {
	activityId: string;
	stageIndex: number;
	endNo: number;
	subtotal: number;
	arrows: number;
}

export interface EndPosition {
	/** 1 for the first end of the round, counting straight through the stages. */
	position: number;
	perArrow: number;
	/** How many rounds contributed an end here, which is what says whether the figure means anything. */
	ends: number;
}

/**
 * How the score moves through a round, end by end. Averaged per arrow so stages of different
 * lengths compare, and positioned by where the end fell rather than by its number inside its stage:
 * the thing being looked for is the point in a round where an archer starts to drop, and that runs
 * across stage boundaries.
 */
export function scoreByEndPosition(ends: EndLike[]): EndPosition[] {
	const byActivity = new Map<string, EndLike[]>();
	for (const end of ends) {
		if (end.arrows <= 0) continue;
		const list = byActivity.get(end.activityId);
		if (list) list.push(end);
		else byActivity.set(end.activityId, [end]);
	}

	const slots = new Map<number, { score: number; arrows: number; ends: number }>();
	for (const list of byActivity.values()) {
		const ordered = [...list].sort((a, b) => a.stageIndex - b.stageIndex || a.endNo - b.endNo);
		ordered.forEach((end, i) => {
			const slot = slots.get(i + 1) ?? { score: 0, arrows: 0, ends: 0 };
			slot.score += end.subtotal;
			slot.arrows += end.arrows;
			slot.ends += 1;
			slots.set(i + 1, slot);
		});
	}

	return [...slots.entries()]
		.map(([position, slot]) => ({
			position,
			perArrow: slot.arrows > 0 ? slot.score / slot.arrows : 0,
			ends: slot.ends
		}))
		.sort((a, b) => a.position - b.position);
}

export interface ValueCount {
	label: string;
	value: number;
	count: number;
}

/**
 * How the arrows fell, by the zone they landed in rather than by their number: an X and a ten score
 * the same and say different things.
 */
export function distribution(shots: { value: number; zoneLabel: string }[]): ValueCount[] {
	const counts = new Map<string, ValueCount>();
	for (const shot of shots) {
		const entry = counts.get(shot.zoneLabel);
		if (entry) entry.count += 1;
		else
			counts.set(shot.zoneLabel, {
				label: shot.zoneLabel,
				value: shot.value,
				count: 1
			});
	}
	// Highest scoring first, X ahead of the ten it ties with.
	return [...counts.values()].sort(
		(a, b) => b.value - a.value || (a.label === 'X' ? -1 : b.label === 'X' ? 1 : 0)
	);
}

export interface ArrowPosition {
	/** 1 for the first arrow called in an end. */
	ordinal: number;
	mean: number;
	/** How many ends contributed an arrow here, which says whether the mean means anything. */
	arrows: number;
}

/**
 * How the score moves through an end, arrow by arrow. An archer who drops the last arrow of every
 * end is losing it to the hold, not to the sight, which is the whole reason arrows are numbered.
 */
export function scoreByArrowNumber(shots: { ordinal: number; value: number }[]): ArrowPosition[] {
	const slots = new Map<number, { score: number; arrows: number }>();
	for (const shot of shots) {
		const slot = slots.get(shot.ordinal) ?? { score: 0, arrows: 0 };
		slot.score += shot.value;
		slot.arrows += 1;
		slots.set(shot.ordinal, slot);
	}
	return [...slots.entries()]
		.map(([ordinal, slot]) => ({ ordinal, mean: slot.score / slot.arrows, arrows: slot.arrows }))
		.sort((a, b) => a.ordinal - b.ordinal);
}

export interface Band {
	key: string;
	rounds: number;
	arrows: number;
	/** Score per arrow, the only figure comparable between two different rounds. */
	perArrow: number;
}

/** Where a strong wind starts. Named because the storm badge quotes the figure it is judged on. */
export const STRONG_WIND_KMH = 25;

const WIND_BANDS = [
	{ key: 'calm', upTo: 5 },
	{ key: 'light', upTo: 15 },
	{ key: 'moderate', upTo: STRONG_WIND_KMH },
	{ key: 'strong', upTo: Infinity }
] as const;

export function windBand(speedKmh: number): string {
	return (WIND_BANDS.find((band) => speedKmh < band.upTo) ?? WIND_BANDS[3]).key;
}

/** Cut where a shooting day changes: numb fingers, a jumper on, comfortable, and too hot to hold. */
const TEMPERATURE_BANDS = [
	{ key: 'cold', upTo: 5 },
	{ key: 'cool', upTo: 15 },
	{ key: 'mild', upTo: 25 },
	{ key: 'hot', upTo: Infinity }
] as const;

export function temperatureBand(celsius: number): string {
	return (TEMPERATURE_BANDS.find((band) => celsius < band.upTo) ?? TEMPERATURE_BANDS[3]).key;
}

export const TEMPERATURE_BAND_KEYS = TEMPERATURE_BANDS.map((band) => band.key);

/** Groups anything with a key into bands of score per arrow, dropping bands nothing was shot in. */
export function bandBy<T>(
	activities: ScoredActivity[],
	keyOf: (activity: ScoredActivity) => string | null,
	order?: readonly string[]
): Band[] {
	const bands = new Map<string, Band>();
	for (const activity of activities) {
		const key = keyOf(activity);
		if (key === null || activity.arrowsShot <= 0) continue;
		const band = bands.get(key) ?? { key, rounds: 0, arrows: 0, perArrow: 0 };
		band.rounds += 1;
		band.arrows += activity.arrowsShot;
		// perArrow holds the running score until every activity is in, then it is divided out.
		band.perArrow += activity.totalScore;
		bands.set(key, band);
	}

	const result = [...bands.values()].map((band) => ({
		...band,
		perArrow: band.perArrow / band.arrows
	}));
	if (!order) return result.sort((a, b) => b.arrows - a.arrows);
	// A key the order does not name goes last rather than ahead of every band it was meant to follow.
	const rank = (key: string) => (order.indexOf(key) < 0 ? order.length : order.indexOf(key));
	return result.sort((a, b) => rank(a.key) - rank(b.key));
}

export const WIND_BAND_KEYS = WIND_BANDS.map((band) => band.key);

function trendOf(history: ScoredActivity[]): number | null {
	// Under six rounds the difference is noise, and showing it invites reading meaning into nothing.
	if (history.length < 6) return null;
	const span = Math.floor(history.length / 3);
	const mean = (list: ScoredActivity[]) =>
		list.reduce((sum, a) => sum + a.totalScore / Math.max(a.arrowsShot, 1), 0) / list.length;
	return mean(history.slice(-span)) - mean(history.slice(0, span));
}
