import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { dateFormats, formatSince } from './prefs';
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

/**
 * Two clocks, neither of them ours. ianseo stamps what it publishes in UTC off its own server and
 * the device keeps its own time, so a result published a moment ago can arrive a little ahead of
 * now. Whatever the gap is, "in two hours" is the one answer that is certainly wrong.
 */
describe('formatSince', () => {
	const now = new Date('2026-09-03T09:45:00Z').getTime();

	it('says how long ago something happened', () => {
		locale.set('en');
		expect(get(formatSince)(now - 5 * 60_000, now)).toBe('5 minutes ago');
		expect(get(formatSince)(now - 26 * 3600_000, now)).toBe('yesterday');
	});

	it('never puts something that has already happened in the future', () => {
		locale.set('en');
		expect(get(formatSince)(now + 2 * 3600_000, now)).toBe('now');
		expect(get(formatSince)(now + 30_000, now)).toBe('now');
	});

	it('says it in the app language', () => {
		locale.set('fr');
		expect(get(formatSince)(now + 2 * 3600_000, now)).toBe('maintenant');
		locale.set('en');
	});
});
