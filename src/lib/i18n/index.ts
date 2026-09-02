import { derived, writable } from 'svelte/store';
import { en } from './en';
import { fr } from './fr';
import { tricksEn, type TricksDictionary } from './tricks.en';
import { tricksFr } from './tricks.fr';

export type Locale = 'en' | 'fr';
export const LOCALES: Locale[] = ['en', 'fr'];

/**
 * `en` is the reference dictionary; every other locale must match its shape, so
 * a missing or misspelled French key is a type error rather than a blank label
 * discovered by a French-speaking user.
 */
export type Dictionary = typeof en;

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };

/**
 * The tricks are kept out of the dictionaries: they are paragraphs of prose read on one page, not
 * labels the UI fills in, and they would double the length of the file every other label lives in.
 */
const TRICKS: Record<Locale, TricksDictionary> = { en: tricksEn, fr: tricksFr };

const STORAGE_KEY = 'appchery.locale';

function initialLocale(): Locale {
	if (typeof window === 'undefined') return 'en';
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored && LOCALES.includes(stored as Locale)) return stored as Locale;
	const preferred = window.navigator.language.slice(0, 2);
	return LOCALES.includes(preferred as Locale) ? (preferred as Locale) : 'en';
}

export const locale = writable<Locale>(initialLocale());

export const tricks = derived(locale, ($locale) => TRICKS[$locale]);

locale.subscribe((value) => {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, value);
	document.documentElement.lang = value;
});

/**
 * Usage: `$t('sessions.title')`, or `$t('score.endOf', { n: 2, total: 6 })`.
 * Falls back to English for a missing key, then to the key itself: a visible
 * key in the UI is a bug report; an empty string hides one.
 */
export const t = derived(locale, ($locale) => {
	return (key: string, params?: Record<string, string | number>): string => {
		const template = lookup(DICTIONARIES[$locale], key) ?? lookup(en, key) ?? key;
		if (!params) return template;
		return template.replace(/\{(\w+)\}/g, (match, name) =>
			name in params ? String(params[name]) : match
		);
	};
});

function lookup(dict: unknown, key: string): string | undefined {
	const value = key
		.split('.')
		.reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dict);
	return typeof value === 'string' ? value : undefined;
}
