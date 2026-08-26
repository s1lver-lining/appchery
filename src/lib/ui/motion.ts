import { get } from 'svelte/store';
import { noAnimations } from '$lib/prefs';

/**
 * How long a row takes to slide into or out of a list. Short on purpose: the move is there to say
 * which row changed, and anything slower puts the answer behind the animation.
 */
export const LIST_MS = 180;

/**
 * Zero while the archer has turned motion off, so a list still settles, just instantly. Read at the
 * moment the animation starts rather than bound, because that is when Svelte asks for the options.
 */
export function listMs(): number {
	return get(noAnimations) ? 0 : LIST_MS;
}
