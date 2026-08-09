import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { dateFormats } from './prefs';
import { locale } from './i18n';

/**
 * Intl throws on an invalid option combination only when a formatter is constructed, which happens
 * lazily inside a component. A page crash is the first sign of it, so every formatter is built here.
 */
describe('dateFormats', () => {
	const at = new Date('2026-08-09T14:30:00').getTime();

	it('builds every formatter without an invalid option combination', () => {
		for (const tag of ['en', 'fr'] as const) {
			locale.set(tag);
			const formats = get(dateFormats);
			for (const [name, format] of Object.entries(formats)) {
				expect(() => format(at), `${tag}.${name}`).not.toThrow();
				expect(format(at), `${tag}.${name}`).toBeTruthy();
			}
		}
		locale.set('en');
	});

	it('formats in the app language rather than the platform one', () => {
		locale.set('fr');
		expect(get(dateFormats).weekdayShort(at).toLowerCase()).toContain('dim');
		locale.set('en');
		expect(get(dateFormats).weekdayShort(at).toLowerCase()).toContain('sun');
	});

	it('shows a 24 hour time when that preference is on', () => {
		expect(get(dateFormats).time(at)).toContain('14');
	});
});
