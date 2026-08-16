import { get, writable } from 'svelte/store';

/** The pages reachable from the tab bar. They are the roots of the navigation tree. */
export const MAIN_PAGES = ['/', '/sessions', '/equipment', '/stats', '/settings'] as const;

const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export function isMainPage(path: string): boolean {
	return (MAIN_PAGES as readonly string[]).includes(strip(path));
}

/** Where the back key goes from `path`, or null when the path is already a root. */
export function parentPath(path: string): string | null {
	const here = strip(path);
	if (isMainPage(here)) return null;
	const up = here.slice(0, here.lastIndexOf('/')) || '/';
	return isMainPage(up) ? up : '/';
}

/**
 * A page whose parent is not its URL prefix publishes it here, because an activity lives under the
 * session that owns it while its route sits at the top level.
 */
export const pageUp = writable<string | null>(null);

export function setPageUp(href: string) {
	pageUp.set(href);
	return () => pageUp.update((c) => (c === href ? null : c));
}

/**
 * A page showing something dismissable claims the back key here, so pressing it closes that thing
 * instead of leaving the page behind it.
 */
const guards = writable<(() => boolean)[]>([]);
export const backGuards = { subscribe: guards.subscribe };

export function registerBackGuard(guard: () => boolean) {
	guards.update((list) => [...list, guard]);
	return () => guards.update((list) => list.filter((g) => g !== guard));
}

/** The last guard registered answers first: it is the innermost thing on screen. */
export function runBackGuards(list: (() => boolean)[]): boolean {
	for (let i = list.length - 1; i >= 0; i--) if (list[i]()) return true;
	return false;
}

// A page holding changes nobody saved claims the ways out a navigation never reaches, such as a swipe.
const leavers = writable<((leave: () => void) => void)[]>([]);

export function registerLeaveGuard(ask: (leave: () => void) => void) {
	leavers.update((list) => [...list, ask]);
	return () => leavers.update((list) => list.filter((g) => g !== ask));
}

/** True when a guard took the move: it asks the archer, and runs `leave` itself if they allow it. */
export function askToLeave(leave: () => void): boolean {
	const guard = get(leavers).at(-1);
	if (!guard) return false;
	guard(leave);
	return true;
}

/**
 * Where a page was opened from, when it can be reached from more than one place. The link carries
 * it, because the alternative is unwinding history: a page reached twice by different routes has to
 * go back to the one the archer actually came from, not to the one its URL sits under.
 */
export function originOf<T extends string | null>(url: URL, fallback: T): string | T {
	const from = url.searchParams.get('from');
	// Only in app paths, so a crafted link cannot send the back arrow somewhere else entirely.
	return from && from.startsWith('/') && !from.startsWith('//') ? from : fallback;
}

export function withOrigin(href: string, from: string): string {
	return `${href}${href.includes('?') ? '&' : '?'}from=${encodeURIComponent(from)}`;
}

/**
 * Bumped when a tab is tapped for the page already on show. Tapping the tab you are on is the one
 * gesture that asks a page for itself, so it is the one a page can answer by going back to where it
 * opens: the alternative is doing that on every arrival, which overrides the back key.
 */
export const tabAsked = writable<{ href: string; at: number } | null>(null);

export function askTab(href: string) {
	tabAsked.set({ href, at: Date.now() });
}

export type TabNav = { count: number; index: number; select: (index: number) => void };

/** The in page tabs of the current page, so a swipe moves between them instead of between pages. */
export const pageTabs = writable<TabNav | null>(null);

export function registerTabs(nav: TabNav) {
	pageTabs.set(nav);
	return () => pageTabs.update((current) => (current === nav ? null : current));
}

/** Where `path` sits in the pager, or -1 when it is not one of the swipeable main pages. */
export function mainPageIndex(path: string): number {
	return (MAIN_PAGES as readonly string[]).indexOf(strip(path));
}
