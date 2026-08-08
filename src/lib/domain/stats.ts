import type { RoundDefinition } from './rounds/types';

export interface ScoredActivity {
	id: string;
	sessionId: string;
	startedAt: number;
	totalScore: number;
	arrowsShot: number;
	count10s: number;
	countX: number;
	status: string;
	roundDefinitionId: string | null;
	round: RoundDefinition | null;
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
	const complete = activities.filter((a) => a.status === 'complete' && a.arrowsShot > 0);

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
