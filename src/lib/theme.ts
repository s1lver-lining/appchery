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
/**
 * A page whose top is its own colour rather than the app's claims the bar while it is open. The
 * scoring pages are the case: they wear the plain page background, not the brand band the rest of
 * the app wears, and a bar in the brand tint sits over them as a stripe of somewhere else.
 *
 * Stacked, because these nest: the camera opens over a scoring page and has to take the bar from
 * it, then hand it back rather than to the app. The innermost claim wins, and each claim is undone
 * by the caller it was given to.
 *
 * A `--custom-property` is resolved at every sync rather than once here, so a claim on a palette
 * colour follows the theme; a literal colour is used as written, for a screen that is one colour
 * whatever the theme says.
 */
/**
 * A scrim claims the bar too, but as a shade rather than a colour: it darkens whatever is under it,
 * including the band above the page, and a bar left bright over a dimmed page reads as a strip of
 * another app. It is applied on top of the colour claim below it, so a dialog that names its own
 * colour still wins.
 */
type Claim = { colour: string } | { dim: number };
const claims: Claim[] = [];

function push(claim: Claim): () => void {
	claims.push(claim);
	if (typeof document !== 'undefined') syncStatusBar();
	return () => {
		const at = claims.indexOf(claim);
		if (at >= 0) claims.splice(at, 1);
		if (typeof document !== 'undefined') syncStatusBar();
	};
}

export function overrideStatusBar(colour: string): () => void {
	return push({ colour });
}

export function dimStatusBar(alpha: number): () => void {
	return push({ dim: alpha });
}

function syncStatusBar() {
	const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (!meta) return;
	const styles = getComputedStyle(document.documentElement);
	const resolve = (colour: string) =>
		colour.startsWith('--') ? styles.getPropertyValue(colour).trim() : colour;

	const bg = styles.getPropertyValue('--c-bg').trim();
	const brand = styles.getPropertyValue('--c-brand').trim();
	// The app's own band, worn by every page that has not claimed the bar for itself.
	let colour = mix(brand, bg, 0.1) ?? bg;

	const last = claims.map((claim) => 'colour' in claim).lastIndexOf(true);
	if (last >= 0) colour = resolve((claims[last] as { colour: string }).colour) || colour;

	// Only the scrims raised over that claim count: the ones below it are already painted over.
	for (const claim of claims.slice(last + 1)) {
		if ('dim' in claim) colour = mix('#000000', colour, claim.dim) ?? colour;
	}

	if (colour) meta.content = colour;
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
