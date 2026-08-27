import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDates, parseEntries } from './parse';

const html = readFileSync('test/inscriptarc/competitions.html', 'utf8');

describe('parseEntries', () => {
	const entries = parseEntries(html);

	it('reads every competition open for entry', () => {
		expect(entries.length).toBeGreaterThan(15);
		expect(new Set(entries.map((one) => one.site)).size).toBe(entries.length);
	});

	it('reads one whole', () => {
		const brouchy = entries.find((one) => one.name.includes('Brouchy'));
		expect(brouchy).toMatchObject({
			name: 'Tir Beursault de Brouchy',
			club: "Cie D'arc De Brouchy",
			affiliation: '0780305',
			dates: 'du 26/08/2026 au 29/08/2026',
			from: Date.UTC(2026, 7, 26),
			to: Date.UTC(2026, 7, 29)
		});
		expect(brouchy?.site).toBe('https://brouchy-beursault.inscriptarc.fr');
	});

	it('gives every link a scheme, since the platform writes them without one', () => {
		expect(entries.every((one) => one.links.every((link) => link.href.startsWith('https://')))).toBe(
			true
		);
	});

	it('keeps the way in, in the platform’s own words', () => {
		const brouchy = entries.find((one) => one.name.includes('Brouchy'));
		expect(brouchy?.links.map((link) => link.label)).toEqual([
			'Mandat',
			'Inscription',
			'Archers Inscrits'
		]);
	});

	it('never invents a competition out of a page with none on it', () => {
		expect(parseEntries('<html><body>Rien</body></html>')).toEqual([]);
	});
});

describe('parseDates', () => {
	it('reads a single day', () => {
		expect(parseDates('le 30/08/2026')).toEqual({
			from: Date.UTC(2026, 7, 30),
			to: Date.UTC(2026, 7, 30)
		});
	});

	it('reads a run of days', () => {
		expect(parseDates('du 26/08/2026 au 29/08/2026')).toEqual({
			from: Date.UTC(2026, 7, 26),
			to: Date.UTC(2026, 7, 29)
		});
	});

	it('gives up on a line with no dates in it', () => {
		expect(parseDates('bientôt')).toEqual({ from: null, to: null });
	});
});

describe('the links a competition publishes', () => {
	it('keeps nothing that is not a page on the web', () => {
		const entries = parseEntries(`
			<div class="competition-block">
				<h2>Concours</h2>
				<a href="javascript:alert(1)">Inscription</a>
				<a href="https://x.inscriptarc.fr/inscription">Inscription</a>
			</div>
		`);
		for (const entry of entries) {
			for (const link of entry.links) expect(link.href.startsWith('https://')).toBe(true);
		}
	});
});
