import { timeOfDay } from './dates';

/**
 * The name an unnamed session carries: the part of the day it was shot in, said differently for a
 * competition, because "Morning session" is the wrong word for the day someone drove to a shoot.
 * Returns a translation key rather than a string, so the name follows the language at display time.
 */
export function defaultNameKey(kind: string, startedAt: number): string {
	const group = kind === 'competition' ? 'competition' : 'practice';
	return `sessions.name.${group}.${timeOfDay(startedAt)}`;
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
