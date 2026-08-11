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
