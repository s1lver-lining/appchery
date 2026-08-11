import { isRoundComplete } from './rounds/geometry';
import { startOfDay } from './dates';
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
	if (range === 'year') from.setFullYear(from.getFullYear() - 1);
	else from.setMonth(from.getMonth() - 1);
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
export function dailyVolume(activities: ScoredActivity[], days = 30, now = Date.now()): DayVolume[] {
	const perDay = new Map<number, number>();
	for (const activity of activities) {
		if (activity.arrowsShot <= 0) continue;
		perDay.set(startOfDay(activity.startedAt), (perDay.get(startOfDay(activity.startedAt)) ?? 0) + activity.arrowsShot);
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
		const name = a.round?.name ?? 'Round';
		perRound.set(name, (perRound.get(name) ?? 0) + a.arrowsShot);
		days.add(new Date(a.startedAt).toDateString());
	}

	const now = new Date();
	const byMonth: MonthVolume[] = [];
	for (let i = months - 1; i >= 0; i--) {
		const at = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
		byMonth.push({ month: monthKey(at), arrows: perMonth.get(monthKey(at)) ?? 0 });
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
		// Custom rounds get their own identity by shape, so two 3x3 at 25m compare against each other.
		const key = activity.roundDefinitionId ?? shapeKey(activity.round);
		const bucket = buckets.get(key);
		if (bucket) bucket.push(activity);
		else buckets.set(key, [activity]);
	}

	return [...buckets.entries()]
		.map(([key, list]) => {
			const history = [...list].sort((a, b) => a.startedAt - b.startedAt);
			const best = history.reduce((top, a) => (compareScores(a, top) > 0 ? a : top));
			const average = history.reduce((sum, a) => sum + a.totalScore, 0) / history.length;
			return {
				key,
				name: history[0].round?.name ?? key,
				best,
				history,
				average,
				trend: trendOf(history)
			};
		})
		.sort((a, b) => b.history[b.history.length - 1].startedAt - a.history[a.history.length - 1].startedAt);
}

function shapeKey(round: RoundDefinition | null): string {
	if (!round) return 'unknown';
	return round.stages
		.map((s) => `${s.distance?.value ?? 'u'}${s.distance?.unit ?? ''}-${s.faceSize}-${s.ends}x${s.arrowsPerEnd}`)
		.join('|');
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
	let best = -Infinity;
	return history.map((activity, i) => {
		const slice = history.slice(Math.max(0, i - window + 1), i + 1);
		const rolling = slice.reduce((sum, a) => sum + a.totalScore, 0) / slice.length;
		const isBest = activity.totalScore > best;
		if (isBest) best = activity.totalScore;
		return { at: activity.startedAt, score: activity.totalScore, rolling, isBest };
	});
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
		else counts.set(shot.zoneLabel, { label: shot.zoneLabel, value: shot.value, count: 1 });
	}
	// Highest scoring first, X ahead of the ten it ties with.
	return [...counts.values()].sort(
		(a, b) => b.value - a.value || (a.label === 'X' ? -1 : b.label === 'X' ? 1 : 0)
	);
}

export interface Band {
	key: string;
	rounds: number;
	arrows: number;
	/** Score per arrow, the only figure comparable between two different rounds. */
	perArrow: number;
}

const WIND_BANDS = [
	{ key: 'calm', upTo: 5 },
	{ key: 'light', upTo: 15 },
	{ key: 'moderate', upTo: 25 },
	{ key: 'strong', upTo: Infinity }
] as const;

export function windBand(speedKmh: number): string {
	return (WIND_BANDS.find((band) => speedKmh < band.upTo) ?? WIND_BANDS[3]).key;
}

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

	const result = [...bands.values()].map((band) => ({ ...band, perArrow: band.perArrow / band.arrows }));
	if (!order) return result.sort((a, b) => b.arrows - a.arrows);
	return result.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
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
