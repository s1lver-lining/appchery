import { isRoundComplete } from './rounds/geometry';
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

function trendOf(history: ScoredActivity[]): number | null {
	// Under six rounds the difference is noise, and showing it invites reading meaning into nothing.
	if (history.length < 6) return null;
	const span = Math.floor(history.length / 3);
	const mean = (list: ScoredActivity[]) =>
		list.reduce((sum, a) => sum + a.totalScore / Math.max(a.arrowsShot, 1), 0) / list.length;
	return mean(history.slice(-span)) - mean(history.slice(0, span));
}
