import { describe, it, expect } from 'vitest';
import { bodyColumn, followable, marked, personColumn } from './rows';
import type { DocumentColumn, DocumentRow } from './types';

const columns = (...labels: string[]): DocumentColumn[] =>
	labels.map((label) => ({ label, secondary: false }));

const row = (...cells: string[]): DocumentRow => ({
	cells: cells.map((text) => ({ text, flag: null })),
	detail: [],
	strong: false
});

describe('personColumn', () => {
	it('finds the column ianseo names the archer in', () => {
		expect(personColumn(columns('Pos.', 'Athlete', 'Country', 'Total'))).toBe(1);
	});

	it('reads the label whatever its case and spacing', () => {
		expect(personColumn(columns('Pos.', ' ARCHER '))).toBe(1);
	});

	/** ianseo heads each competition's columns in the organiser's own language. */
	it('reads the label whatever accents the organiser writes it with', () => {
		expect(personColumn(columns('Pos.', 'Athlète', 'Clubs / Pays', 'Epreuve'))).toBe(1);
	});

	it('has no answer for a table of numbers', () => {
		expect(personColumn(columns('NOC', 'Men', 'Women', 'Total'))).toBe(null);
	});
});

describe('bodyColumn', () => {
	it('finds the club, which a national event still files under Country', () => {
		expect(bodyColumn(columns('Pos.', 'Athlete', 'Country', 'Total'))).toBe(2);
	});

	it('finds a French club column, however it is headed', () => {
		expect(bodyColumn(columns('Athlète', 'Cible', 'Clubs / Pays', 'Epreuve'))).toBe(2);
	});

	it('never gives back the column the archer was read from', () => {
		const found = columns('Pos.', 'Team', 'Total');
		expect(personColumn(found)).toBe(null);
		expect(bodyColumn(found)).toBe(1);
	});
});

describe('followable', () => {
	const shape = columns('Pos.', 'Athlete', 'Country', 'Total');

	it('offers the archer and the body they shoot for', () => {
		expect(followable(row('1', 'DUCROCQ Tanguy', 'KOSH - Kohav Hasharon Archers', '583'), shape)).toEqual([
			{ kind: 'archer', label: 'DUCROCQ Tanguy' },
			{ kind: 'club', label: 'KOSH - Kohav Hasharon Archers' }
		]);
	});

	it('offers nothing it cannot name', () => {
		expect(followable(row('1', '', '', '583'), shape)).toEqual([]);
	});

	it('offers nothing from a table with nobody in it, such as the entries each country sent', () => {
		expect(followable(row('ALG - Algeria', '3'), columns('NOC', 'Men'))).toEqual([]);
	});
});

describe('marked', () => {
	const followed = new Set(['ducrocq tanguy']);

	it('marks the row of somebody followed, whatever column they are in', () => {
		expect(marked(row('1', 'DUCROCQ Tanguy', 'KOSH', '583'), followed)).toBe(true);
		expect(marked(row('2', 'JOURDAIN Gaspard', 'HRZ', '581'), followed)).toBe(false);
	});

	it('never marks a row on an empty cell, which every table is full of', () => {
		expect(marked(row('', '', ''), new Set(['']))).toBe(false);
	});

	it('marks nothing when nobody is followed', () => {
		expect(marked(row('1', 'DUCROCQ Tanguy'), new Set())).toBe(false);
	});
});
