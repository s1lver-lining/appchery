import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from './en';
import { fr } from './fr';
import { LOCALES } from './index';
import { tricksEn, type TricksDictionary } from './tricks.en';
import { tricksFr } from './tricks.fr';
import { TUNING_TEMPLATES } from '../domain/tuning/templates';
import { planSeason } from '../domain/plans';

const FROM = new Date('2026-08-10T00:00').getTime();
const TO = new Date('2026-09-30T00:00').getTime();
const SEASONS = {
	betweenDates: { startDate: FROM, endDate: TO },
	fromDate: { startDate: FROM, endDate: null },
	untilDate: { startDate: null, endDate: TO }
};

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

/**
 * The tricks are lists rather than keys, so the types only hold their shape: a French list one
 * trick short would compile. These check what the types cannot.
 */
describe('tricks', () => {
	const LOCALISED: Record<string, TricksDictionary> = { fr: tricksFr };

	for (const [name, dictionary] of Object.entries(LOCALISED)) {
		it(`${name} keeps the same groups in the same order`, () => {
			expect(dictionary.groups.map((group) => group.key)).toEqual(
				tricksEn.groups.map((group) => group.key)
			);
		});

		it(`${name} translates every trick of every group`, () => {
			const counts = (dict: TricksDictionary) =>
				Object.fromEntries(dict.groups.map((group) => [group.key, group.tricks.length]));
			expect(counts(dictionary)).toEqual(counts(tricksEn));
		});

		it(`${name} leaves no trick blank`, () => {
			const blank = dictionary.groups.flatMap((group) =>
				group.tricks
					.filter((trick) => trick.lead.trim() === '' || trick.body.trim() === '')
					.map((trick) => `${group.key}: ${trick.lead}`)
			);
			expect(blank).toEqual([]);
		});
	}

	it('leads every trick with the move, ending in a full stop', () => {
		const unended = [tricksEn, ...Object.values(LOCALISED)].flatMap((dict) =>
			dict.groups.flatMap((group) =>
				group.tricks.filter((trick) => !/[.?!]$/.test(trick.lead)).map((trick) => trick.lead)
			)
		);
		expect(unended).toEqual([]);
	});
});

/**
 * The procedures carry an English name of their own, because the domain has to be readable and
 * testable without a dictionary. That leaves two copies of the same words, so they are checked
 * against each other rather than trusted to stay in step.
 */
describe('tuning procedure names', () => {
	it('names every procedure in every language', () => {
		for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
			const flat = flatten(dictionary);
			const missing = TUNING_TEMPLATES.filter((t) => !flat.has(`tuning.template.${t.key}`));
			expect(missing.map((t) => `${name}: ${t.key}`)).toEqual([]);
		}
	});

	it('agrees with the English the templates carry', () => {
		for (const template of TUNING_TEMPLATES) {
			expect(reference.get(`tuning.template.${template.key}`)).toBe(template.name);
		}
	});

	it('names no procedure that no longer exists', () => {
		const keys = new Set(TUNING_TEMPLATES.map((t) => t.key));
		const stale = [...reference.keys()]
			.filter((key) => key.startsWith('tuning.template.'))
			.filter((key) => !keys.has(key.slice('tuning.template.'.length)));
		expect(stale).toEqual([]);
	});
});

/**
 * The plan list picks its sentence at runtime from `planSeason`, so the key it builds is never
 * checked by the compiler. These are the three it can build, filled the way the page fills them.
 */
describe('plan season sentences', () => {
	const filled = { from: '10 Aug', to: '30 Sep', date: '10 Aug' };

	for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
		const flat = flatten(dictionary);

		it(`${name} says each of them with nothing left to fill in`, () => {
			for (const season of ['betweenDates', 'fromDate', 'untilDate'] as const) {
				const key = `plans.${planSeason(SEASONS[season])!.key}`;
				const text = flat.get(key);
				expect(text, key).toBeDefined();
				const said = text!.replace(/\{(\w+)\}/g, (match, slot) =>
					slot in filled ? filled[slot as keyof typeof filled] : match
				);
				expect(said).not.toMatch(/[{}]/);
				expect(said).toContain('10 Aug');
			}
		});
	}
});

/**
 * A key with nothing behind it falls back to itself, so the label an archer reads is the key. Two
 * had been doing exactly that: a page asking for a third step of an exercise written with two, and
 * a chart naming the group of metric labels where it needed the one label that names the group.
 *
 * Only keys written out in full can be checked this way. The ones built at runtime, `stats.metric.`
 * plus a metric and the like, are covered by the dictionaries agreeing with each other above.
 */
describe('the keys the app actually asks for', () => {
	function walk(dir: string, out: string[] = []): string[] {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) walk(path, out);
			else if (/\.(svelte|ts)$/.test(path) && !/\.test\.ts$/.test(path)) out.push(path);
		}
		return out;
	}

	function resolves(key: string): boolean {
		const value = key
			.split('.')
			.reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
		// A group of labels is not a label: naming one leaves the caller with the key on screen.
		return typeof value === 'string';
	}

	it('all exist, and are labels rather than groups of them', () => {
		const missing: string[] = [];
		let checked = 0;

		for (const file of walk('src')) {
			for (const match of readFileSync(file, 'utf8').matchAll(/\$?\bt\(\s*(['"])([A-Za-z0-9_.]+)\1/g)) {
				checked += 1;
				if (!resolves(match[2])) missing.push(`${match[2]} in ${file}`);
			}
		}

		// A guard that stopped finding anything to guard would pass in silence.
		expect(checked).toBeGreaterThan(1000);
		expect([...new Set(missing)]).toEqual([]);
	});
});
