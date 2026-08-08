import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark' | 'system';
export const THEMES: Theme[] = ['light', 'dark', 'system'];

const STORAGE_KEY = 'appchery.theme';

function stored(): Theme {
	if (typeof window === 'undefined') return 'system';
	const value = window.localStorage.getItem(STORAGE_KEY);
	return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
}

export const theme = writable<Theme>(stored());

theme.subscribe((value) => {
	if (typeof document === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, value);
	// System leaves the attribute off so the prefers-color-scheme rules apply.
	if (value === 'system') document.documentElement.removeAttribute('data-theme');
	else document.documentElement.setAttribute('data-theme', value);
});
