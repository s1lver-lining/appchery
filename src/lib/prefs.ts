import { derived, writable } from 'svelte/store';
import { locale } from './i18n';

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

/**
 * Dates follow the language chosen in the app, not the one the browser happens to be set to. An
 * English speaking archer on a French phone was reading "lundi" in an otherwise English interface.
 */
export const dateFormats = derived([locale, use24Hour], ([$locale, $use24]) => {
	const clock: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: !$use24 };
	const on = (options: Intl.DateTimeFormatOptions) => {
		const formatter = new Intl.DateTimeFormat($locale, options);
		return (value: number) => formatter.format(value);
	};

	return {
		dateTime: on({ dateStyle: 'medium', ...clock }),
		/** The weekday matters in a list: a Sunday reads differently from a Tuesday. */
		dayDateTime: on({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...clock }),
		time: on(clock),
		date: on({ dateStyle: 'medium' }),
		shortDate: on({ day: 'numeric', month: 'short' }),
		weekdayShort: on({ weekday: 'short' }),
		weekdayNarrow: on({ weekday: 'narrow' }),
		monthNarrow: on({ month: 'narrow' }),
		monthYear: on({ month: 'long', year: 'numeric' })
	};
});

export const formatDateTime = derived(dateFormats, ($f) => $f.dateTime);
export const formatDayDateTime = derived(dateFormats, ($f) => $f.dayDateTime);
export const formatTime = derived(dateFormats, ($f) => $f.time);

/**
 * Off by default: an archer checking the sheet against the target reads the arrows in the order they
 * were called, not sorted. Turning it on shows the paper scoresheet order instead.
 */
export const sortArrowsDescending = flag('appchery.sortArrows', false);

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
