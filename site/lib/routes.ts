import type { Locale } from '$lib/i18n';

/**
 * Where each page lives, per language.
 *
 * The two languages need two addresses. With one URL choosing its language from the browser, only
 * one of them is ever indexed: a crawler asking for appchery.com is served English and the French
 * copy has nowhere to be found, which is half the page's words invisible to anybody searching in
 * French. English keeps the bare paths, since those are the addresses already in the wild.
 */
export type Page = 'home' | 'faq' | 'terms';

const PATHS: Record<Page, string> = { home: '/', faq: '/faq/', terms: '/terms/' };

export function path(locale: Locale, page: Page): string {
	return locale === 'en' ? PATHS[page] : `/${locale}${PATHS[page]}`;
}

/**
 * The language the visitor was served, read from the address itself.
 *
 * The address rather than `documentElement.lang`: the i18n store rewrites that attribute from the
 * browser's own preference the moment it is imported, so by the time the page hydrates it no longer
 * says which page was served. The path is never rewritten.
 */
export function localeOf(pathname: string): Locale {
	return pathname.startsWith('/fr/') || pathname === '/fr' ? 'fr' : 'en';
}

export const ORIGIN = 'https://appchery.com';

export function url(locale: Locale, page: Page): string {
	return `${ORIGIN}${path(locale, page)}`.replace(/\/$/, '/');
}
