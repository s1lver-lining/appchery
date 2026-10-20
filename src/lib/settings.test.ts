import { describe, it, expect } from 'vitest';
import { SETTINGS, SETTINGS_PAGES, pageTitle, pageSummary, searchSettings, settingHref } from './settings';
import { en } from './i18n/en';
import { fr } from './i18n/fr';

function lookup(dict: unknown, key: string): unknown {
	return key.split('.').reduce<unknown>((node, part) => (node as never)?.[part], dict);
}

const translate = (key: string) => String(lookup(en, key) ?? key);

describe('settings catalogue', () => {
	it('names a phrase for every entry, in both languages', () => {
		for (const entry of SETTINGS) {
			for (const key of [entry.title, entry.hint]) {
				if (!key) continue;
				expect(typeof lookup(en, key), `${entry.key}: ${key}`).toBe('string');
				expect(typeof lookup(fr, key), `${entry.key}: ${key}`).toBe('string');
			}
		}
	});

	it('gives every entry a key of its own', () => {
		const keys = SETTINGS.map((entry) => entry.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('names every page, in both languages', () => {
		for (const page of SETTINGS_PAGES) {
			for (const key of [pageTitle(page.key), pageSummary(page.key)]) {
				expect(typeof lookup(en, key), key).toBe('string');
				expect(typeof lookup(fr, key), key).toBe('string');
			}
		}
	});

	it('links a setting to the page that holds it', () => {
		expect(settingHref('weather')).toBe('/settings/shooting?setting=weather');
		expect(settingHref('clock')).toBe('/settings/language?setting=clock');
		expect(settingHref('nothing-of-the-sort')).toBeUndefined();
	});
});

describe('searching the settings', () => {
	it('finds nothing until something is typed', () => {
		expect(searchSettings('', translate)).toEqual([]);
		expect(searchSettings('   ', translate)).toEqual([]);
	});

	it('finds a setting by its name', () => {
		expect(searchSettings('weather', translate).map((e) => e.key)).toContain('weather');
	});

	it('finds a setting by its description alone', () => {
		// The word is in the hint of the halves break and in no setting's name.
		expect(searchSettings('WA 720', translate).map((e) => e.key)).toContain('halfBreak');
	});

	it('ranks a name match above a description match', () => {
		const found = searchSettings('weather', translate);
		expect(found[0].key).toBe('weather');
	});

	it('narrows rather than widens as words are added', () => {
		const one = searchSettings('turn', translate);
		const two = searchSettings('turn animations', translate);
		expect(two.length).toBeLessThanOrEqual(one.length);
		expect(two.map((e) => e.key)).toContain('noAnimations');
	});

	it('reads through accents, which a phone keyboard rarely offers', () => {
		const accented = (key: string) => (key === 'x.y' ? 'Réglage du blason' : translate(key));
		const entries = [{ key: 'x', page: 'display' as const, title: 'x.y' }];
		expect(searchSettings('reglage', accented, entries)).toHaveLength(1);
		expect(searchSettings('Réglage', accented, entries)).toHaveLength(1);
	});
});
