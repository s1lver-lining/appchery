import { clock } from '$lib/domain/running';
import { formatPace, workoutPace, workoutTotals, type RunWorkout } from '$lib/domain/run/workout';
import { sayDistance } from './distance';

/**
 * What a programme comes to, in one line: how far, how long, and the pace that averages out at.
 *
 * Here rather than in each page that shows it, because the run's setup card and the library list
 * are the same sentence about the same thing, and two copies of it drift.
 */
export function workoutSummary(
	workout: RunWorkout,
	t: (key: string, values?: Record<string, string | number>) => string
): string {
	const totals = workoutTotals(workout);
	const distance = sayDistance(totals.metres, t);
	const time = clock(totals.seconds);
	if (totals.open > 0) return t('workouts.totalsOpen', { distance, time, n: totals.open });
	const pace = workoutPace(workout);
	return pace
		? t('workouts.totalsPace', { distance, time, pace: `${formatPace(pace)} ${t('running.perKm')}` })
		: t('workouts.totals', { distance, time });
}
