import { describe, it, expect } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { LOCALES } from './index';

/**
 * A missing translation is a blank label found by whoever speaks that language, which is nobody on
 * the team. The types catch a key the reference has and a locale does not; these catch the rest:
 * a key nothing references any more, an empty string, and a placeholder lost in translation.
 */
const DICTIONARIES: Record<string, unknown> = { en, fr };

function flatten(node: unknown, prefix = ''): Map<string, string> {
	const flat = new Map<string, string>();
	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'string') flat.set(path, value);
		else if (value && typeof value === 'object') {
			for (const [inner, text] of flatten(value, path)) flat.set(inner, text);
		}
	}
	return flat;
}

/** The names inside the braces, which are what a caller passes: {n} and {date} are the contract. */
const placeholders = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const reference = flatten(en);

describe('translations', () => {
	it('covers every supported language', () => {
		expect(Object.keys(DICTIONARIES).sort()).toEqual([...LOCALES].sort());
	});

	for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
		const flat = flatten(dictionary);

		it(`${name} translates every key, and no key the reference dropped`, () => {
			const missing = [...reference.keys()].filter((key) => !flat.has(key));
			const extra = [...flat.keys()].filter((key) => !reference.has(key));
			expect({ missing, extra }).toEqual({ missing: [], extra: [] });
		});

		it(`${name} leaves no label blank`, () => {
			const blank = [...flat.entries()]
				.filter(([, text]) => text.trim() === '')
				.map(([key]) => key);
			expect(blank).toEqual([]);
		});

		it(`${name} keeps the placeholders the caller fills in`, () => {
			const broken = [...flat.entries()]
				.filter(([key, text]) => {
					const source = reference.get(key);
					return source !== undefined && placeholders(source).join() !== placeholders(text).join();
				})
				.map(([key]) => key);
			expect(broken).toEqual([]);
		});
	}
});
