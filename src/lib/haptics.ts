import { get } from 'svelte/store';
import { haptics } from './prefs';

/** As short as a key press: long enough to feel, short enough that a fast count does not blur. */
export function tap(ms = 8) {
	if (!get(haptics)) return;
	navigator.vibrate?.(ms);
}
