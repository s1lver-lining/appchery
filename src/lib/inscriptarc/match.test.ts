import { describe, it, expect } from 'vitest';
import { entryFor, marks, normalise, overlaps, unmatched } from './match';
import type { Entry } from './types';

const day = (d: number, m = 8, y = 2026) => Date.UTC(y, m - 1, d);

function entry(over: Partial<Entry> = {}): Entry {
	return {
		site: 'https://brouchy-beursault.inscriptarc.fr',
		name: 'Tir Beursault de Brouchy',
		club: "Cie D'arc De Brouchy",
		affiliation: '0780305',
		dates: 'du 26/08/2026 au 29/08/2026',
		from: day(26),
		to: day(29),
		links: [{ label: 'Inscription', href: 'https://brouchy-beursault.inscriptarc.fr/inscription' }],
		...over
	};
}

const shoot = (town: string, from: number, to = from) => ({ name: 'Whatever', town, from, to });

describe('normalise', () => {
	it('reduces a name to the letters two sources can agree on', () => {
		expect(normalise("Cie D'arc De PÉROLS")).toBe('cie d arc de perols');
	});
});

describe('overlaps', () => {
	it('is true where the days touch at all', () => {
		expect(overlaps(shoot('brouchy', day(29), day(30)), entry())).toBe(true);
		expect(overlaps(shoot('brouchy', day(20), day(26)), entry())).toBe(true);
	});

	it('is false where they do not', () => {
		expect(overlaps(shoot('brouchy', day(30), day(31)), entry())).toBe(false);
	});

	it('is false where either side has no dates to compare', () => {
		expect(overlaps({ name: '', town: 'brouchy', from: null, to: null }, entry())).toBe(false);
		expect(overlaps(shoot('brouchy', day(26)), entry({ from: null, to: null }))).toBe(false);
	});
});

describe('marks', () => {
	it('keeps the words that tell one competition from another', () => {
		expect(marks('Tir Beursault de Brouchy')).toEqual(['brouchy']);
	});
});

describe('entryFor', () => {
	const entries = [entry()];

	it('finds the entry form for a competition on the same days in the same town', () => {
		expect(entryFor(shoot('BROUCHY', day(26), day(29)), entries)?.site).toBe(entry().site);
	});

	it('finds it through the club’s name, which is where the town usually is', () => {
		const named = [entry({ name: 'Tir Beursault', club: "Cie D'arc De Brouchy" })];
		expect(entryFor(shoot('Brouchy', day(27)), named)).not.toBe(null);
	});

	/** The two halves of the rule, each shown to be doing its job on its own. */
	it('offers nothing for the right town on the wrong days', () => {
		expect(entryFor(shoot('Brouchy', day(15), day(16)), entries)).toBe(null);
	});

	it('offers nothing for the right days in the wrong town', () => {
		expect(entryFor(shoot('Rennes', day(26), day(29)), entries)).toBe(null);
	});

	it('never matches on half a word', () => {
		// Brou is not Brouchy, and an entry form is not something to guess at.
		expect(entryFor(shoot('Brou', day(26), day(29)), entries)).toBe(null);
	});

	it('refuses to choose between two entries that both answer', () => {
		const twins = [entry(), entry({ site: 'https://other.inscriptarc.fr' })];
		expect(entryFor(shoot('Brouchy', day(27)), twins)).toBe(null);
	});

	it('offers nothing for a competition whose town is too short to mean anything', () => {
		expect(entryFor(shoot('Ay', day(27)), entries)).toBe(null);
	});
});

describe('unmatched', () => {
	it('keeps the entries no competition on screen accounts for', () => {
		const entries = [entry(), entry({ site: 'https://x.inscriptarc.fr', name: 'Tir de Rennes', club: 'Archers de Rennes' })];
		const shown = [shoot('Brouchy', day(27))];
		expect(unmatched(shown, entries).map((one) => one.site)).toEqual(['https://x.inscriptarc.fr']);
	});

	it('keeps every entry when nothing is on screen to match', () => {
		expect(unmatched([], [entry()])).toHaveLength(1);
	});
});
