import { writable } from 'svelte/store';

const DEFAULT_BOW_KEY = 'appchery.defaultBowId';

function storedString(key: string) {
	const store = writable<string | null>(
		typeof window === 'undefined' ? null : window.localStorage.getItem(key)
	);
	store.subscribe((value) => {
		if (typeof window === 'undefined') return;
		if (value) window.localStorage.setItem(key, value);
		else window.localStorage.removeItem(key);
	});
	return store;
}

/**
 * The bow preselected on a new session. A device preference rather than user data, since which bow
 * you reach for depends on where you are, so it is deliberately not synced.
 */
export const defaultBowId = storedString(DEFAULT_BOW_KEY);
