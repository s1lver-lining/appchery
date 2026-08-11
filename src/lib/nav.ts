import { writable } from 'svelte/store';

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
