import { timeOfDay } from './dates';
import { RUNNING_KIND } from './running';
import { STRENGTH_KIND } from './strength';

/**
 * The name an unnamed session carries: the part of the day it was shot in, said differently for a
 * competition, because "Morning session" is the wrong word for the day someone drove to a shoot.
 * Returns a translation key rather than a string, so the name follows the language at display time.
 */
export function defaultNameKey(kind: string, startedAt: number): string {
	const group =
		kind === 'competition' ? 'competition' : kind === RUNNING_KIND ? 'running' : 'practice';
	return `sessions.name.${group}.${timeOfDay(startedAt)}`;
}

/** What a session turns out to be, which is the icon it wears in the list. */
export type SessionShape = 'running' | 'strength' | 'match' | 'tuning' | 'training' | 'scoring';

/**
 * Read off the activities rather than stored, so a session is whatever it turns out to hold and
 * adding to one can change what it is. A finished round wins over everything else: it is what the
 * outing will be remembered for. Failing that a session of one kind is that kind, and a mixture is
 * scoring, which is what a session is for. See doc/data-model.md.
 */
export function sessionShape(activities: { kind: string; status?: string }[]): SessionShape {
	// Training arrows are a counter on the session rather than a row, so they never decide alone.
	const listed = activities.filter((a) => a.kind !== 'training');
	if (listed.some((a) => a.kind === 'scoring' && a.status === 'complete')) return 'scoring';
	if (listed.length === 0) return activities.length > 0 ? 'training' : 'scoring';
	const only = (kind: string) => listed.every((a) => a.kind === kind);
	if (only(RUNNING_KIND)) return 'running';
	if (only(STRENGTH_KIND)) return 'strength';
	if (only('match')) return 'match';
	if (only('tuning')) return 'tuning';
	return 'scoring';
}

/** Shown as the run itself rather than as an outing, both in the list and on its own page. */
export function isRunningSession(activities: { kind: string; status?: string }[]): boolean {
	return sessionShape(activities) === 'running';
}

/**
 * Whether an outing has taken place. A session still ahead is a plan for a day, not a day shot: it
 * belongs to what is coming rather than to what a week or a month holds. An outing nothing was
 * entered in still counts, because turning up and shooting nothing is a session that happened.
 */
export function hasHappened(
	session: { kind: string; startedAt: number },
	now = Date.now()
): boolean {
	return session.kind !== 'planned' && session.startedAt <= now;
}

// Re-exported so the callers that already searched sessions keep their one import.
export { matchesQuery } from './search';
