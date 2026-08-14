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

/**
 * The Android status bar takes its colour from this tag, and it sits directly above the page
 * header, so it is the header's colour it has to match — the page background leaves a band, which
 * in dark theme reads as a black bar above the app rather than part of it.
 *
 * Blended here from the same two variables the header uses, rather than written out as two more
 * hex constants that would quietly drift from the palette. Custom properties come back as their
 * literal tokens, which is enough because both are plain hex.
 */
function syncStatusBar() {
	const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (!meta) return;
	const styles = getComputedStyle(document.documentElement);
	const bg = styles.getPropertyValue('--c-bg').trim();
	const brand = styles.getPropertyValue('--c-brand').trim();
	const blended = mix(brand, bg, 0.1);
	if (blended) meta.content = blended;
}

/** `bg-brand/10`, done in JS: the header paints brand over the page at a tenth. */
function mix(top: string, bottom: string, alpha: number): string | null {
	const a = hex(top);
	const b = hex(bottom);
	if (!a || !b) return null;
	const channel = (i: number) => Math.round(a[i] * alpha + b[i] * (1 - alpha));
	return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

function hex(value: string): [number, number, number] | null {
	const match = /^#([0-9a-f]{6})$/i.exec(value);
	if (!match) return null;
	const n = parseInt(match[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

theme.subscribe((value) => {
	if (typeof document === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, value);
	// System leaves the attribute off so the prefers-color-scheme rules apply.
	if (value === 'system') document.documentElement.removeAttribute('data-theme');
	else document.documentElement.setAttribute('data-theme', value);
	syncStatusBar();
});

// On `system` the palette moves without the store moving, so the bar has to be told separately.
if (typeof window !== 'undefined') {
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncStatusBar);
}
