import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pageCount, parseCompetitions, parseDates, parseDepartements, parseDetail } from './parse';

const calendar = readFileSync('test/ffta/competitions.html', 'utf8');
const finished = readFileSync('test/ffta/finished.html', 'utf8');
const epreuve = readFileSync('test/ffta/epreuve.html', 'utf8');

describe('parseCompetitions', () => {
	const list = parseCompetitions(calendar);

	it('reads every competition once, however many lines the page gives it', () => {
		expect(list.length).toBeGreaterThan(10);
		expect(new Set(list.map((one) => one.id)).size).toBe(list.length);
	});

	it('reads a row whole', () => {
		const rennes = list.find((one) => one.id === '27683');
		expect(rennes).toMatchObject({
			name: 'TAE - PRÉPARATION SELECTIONS à RENNES',
			dates: 'Du 27 au 28 août 2026',
			discipline: "Tir à l'arc extérieur",
			kind: 'Individuel',
			club: "COMPAGNIE D'ARCHERS DE RENNES",
			town: 'RENNES'
		});
	});

	it('resolves the printed dates to a span', () => {
		const rennes = list.find((one) => one.id === '27683');
		expect(rennes?.from).toBe(Date.UTC(2026, 7, 27));
		expect(rennes?.to).toBe(Date.UTC(2026, 7, 28));
	});

	it('keeps the announcement a club published, where it published one', () => {
		expect(list.find((one) => one.id === '24820')?.mandatPdf).toContain('extranet.ffta.fr');
		expect(list.find((one) => one.id === '25006')?.mandatPdf).toBe(null);
	});

	it('finds the results of a competition that has been shot', () => {
		const shot = parseCompetitions(finished).find((one) => one.id === '23744');
		expect(shot?.resultsPdf).toContain('pdfresultats');
		expect(shot?.town).toBe('TORPES');
	});

	it('leaves the town empty rather than guessing when the row does not name one', () => {
		expect(list.find((one) => one.id === '23187')?.town).toBe('');
	});

	it('reads nothing out of a page with no competitions on it', () => {
		expect(parseCompetitions('<html><body>Rien</body></html>')).toEqual([]);
	});
});

describe('parseDates', () => {
	it('reads a single day', () => {
		expect(parseDates('Le 23 août 2026')).toEqual({
			from: Date.UTC(2026, 7, 23),
			to: Date.UTC(2026, 7, 23)
		});
	});

	it('reads a run of days inside one month', () => {
		expect(parseDates('Du 25 au 28 août 2026')).toEqual({
			from: Date.UTC(2026, 7, 25),
			to: Date.UTC(2026, 7, 28)
		});
	});

	it('reads a span that crosses a month', () => {
		expect(parseDates('Du 28 août au 3 septembre 2026')).toEqual({
			from: Date.UTC(2026, 7, 28),
			to: Date.UTC(2026, 8, 3)
		});
	});

	it('starts a year earlier where the span crosses new year', () => {
		expect(parseDates('Du 28 décembre au 3 janvier 2027')).toEqual({
			from: Date.UTC(2026, 11, 28),
			to: Date.UTC(2027, 0, 3)
		});
	});

	it('gives up rather than guessing at something it does not recognise', () => {
		expect(parseDates('un de ces jours')).toEqual({ from: null, to: null });
	});
});

describe('parseDepartements', () => {
	const list = parseDepartements(calendar);

	it('reads the whole list the filter offers', () => {
		expect(list.length).toBeGreaterThan(100);
	});

	/**
	 * The one thing worth a test of its own: the filter wants a position in its own list where
	 * everybody else says 35, and the two stopped agreeing at Corsica.
	 */
	it('keeps the code apart from the value the filter wants for it', () => {
		expect(list.find((one) => one.code === '35')).toEqual({
			code: '35',
			name: 'Ille-et-Vilaine',
			value: '36'
		});
		expect(list.find((one) => one.code === '01')?.value).toBe('1');
		expect(list.find((one) => one.code === '2A')?.name).toBeTruthy();
	});

	it('reads nothing out of a page with no filter on it', () => {
		expect(parseDepartements('<html></html>')).toEqual([]);
	});
});

describe('pageCount', () => {
	it('counts the pages the calendar says it has', () => {
		expect(pageCount(calendar)).toBe(30);
	});

	it('is one page for a calendar with no pager at all', () => {
		expect(pageCount('<html></html>')).toBe(1);
	});
});

describe('parseDetail', () => {
	it('reads each fact up to the next one rather than up to the next space', () => {
		expect(parseDetail('27617', epreuve)).toEqual({
			id: '27617',
			region: 'COMITE REGIONAL DU CENTRE VAL DE LOIRE',
			departement: 'COMITE DEPARTEMENTAL EURE ET LOIR',
			organiser: "L'ARCHER DE BONNEVAL",
			venue: 'BONNEVAL',
			postcode: '28800',
			town: 'ALLUYES'
		});
	});

	it('says nothing rather than inventing it for a page it cannot read', () => {
		expect(parseDetail('1', '<html></html>')).toEqual({
			id: '1',
			region: null,
			departement: null,
			organiser: null,
			venue: null,
			postcode: null,
			town: null
		});
	});
});
