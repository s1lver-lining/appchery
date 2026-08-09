import { derived, writable } from 'svelte/store';

const DEFAULT_BOW_KEY = 'appchery.defaultBowId';

function flag(key: string, initial = false) {
	// An absent key means the preference was never set, which is not the same as it being off.
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	const store = writable<boolean>(saved === null ? initial : saved === 'true');
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, String(value));
	});
	return store;
}

/** Clock format is a display preference, so stored timestamps never change with it. */
export const use24Hour = flag('appchery.use24Hour', true);

/** Formatters follow the preference, so every timestamp in the app reads the same way. */
export const formatDateTime = derived(use24Hour, ($use24) => (value: number) =>
	new Date(value).toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
		hour12: !$use24
	})
);

/** The weekday matters in a list: shooting on a Sunday reads differently from shooting on a Tuesday. */
export const formatDayDateTime = derived(use24Hour, ($use24) => (value: number) =>
	new Date(value).toLocaleString(undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: !$use24
	})
);

export const formatTime = derived(use24Hour, ($use24) => (value: number) =>
	new Date(value).toLocaleTimeString(undefined, { timeStyle: 'short', hour12: !$use24 })
);

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
