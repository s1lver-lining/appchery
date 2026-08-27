import { describe, it, expect } from 'vitest';
import { clubName, namedColumns } from './clubs';

describe('clubName', () => {
	it('drops the number a French club is filed under', () => {
		expect(clubName('0702022 - JUSSY')).toBe('JUSSY');
	});

	it('drops the code an international entry is filed under', () => {
		expect(clubName('KOSH - Kohav Hasharon Archers')).toBe('Kohav Hasharon Archers');
		expect(clubName('ALG - Algeria')).toBe('Algeria');
	});

	it('gives the whole of it back when that is what was asked for', () => {
		expect(clubName('0702022 - JUSSY', true)).toBe('0702022 - JUSSY');
		expect(clubName('KOSH - Kohav Hasharon Archers', true)).toBe('KOSH - Kohav Hasharon Archers');
	});

	it('leaves a club that carries no reference alone', () => {
		expect(clubName('Kota Semarang')).toBe('Kota Semarang');
		expect(clubName('Compagnie des Archers de Rennes')).toBe('Compagnie des Archers de Rennes');
	});

	/** A name is not a reference just because it has a dash in it. */
	it('keeps a name whose first word is a word', () => {
		expect(clubName('Maccabi - Tel Aviv')).toBe('Maccabi - Tel Aviv');
		expect(clubName('Saint Quentin - Archers')).toBe('Saint Quentin - Archers');
	});

	it('keeps a club recorded as nothing but its number', () => {
		expect(clubName('0702022 - ')).toBe('0702022 - ');
	});

	it('leaves an empty cell empty', () => {
		expect(clubName('')).toBe('');
	});
});

describe('namedColumns', () => {
	const table = (...columns: string[][]) => ({
		columns: columns.map((_, at) => ({ label: `c${at}`, secondary: false })),
		rows: columns[0].map((_, row) => ({ cells: columns.map((values) => ({ text: values[row] })) }))
	});

	it('reads a club column off what it holds, whatever the organiser headed it', () => {
		const { columns, rows } = table(
			['1', '2', '3', '4'],
			['0702022 - RENNES CIE', '0702011 - JUSSY', '0350451 - BRUZ', '0290012 - BREST'],
			['Alice', 'Bob', 'Chloe', 'Dan']
		);
		expect(namedColumns(columns, rows)).toEqual([false, true, false]);
	});

	it('leaves a column alone where only the odd row is written that way', () => {
		const { columns, rows } = table(['Maccabi - Tel Aviv', 'Rennes', 'Brest', '0702022 - JUSSY']);
		expect(namedColumns(columns, rows)).toEqual([false]);
	});

	it('takes the column a club is known to sit in on its label alone', () => {
		const { columns, rows } = table(['0702022 - RENNES CIE']);
		columns[0].label = 'Clubs / Pays';
		expect(namedColumns(columns, rows)).toEqual([true]);
	});

	it('says nothing about a table too short to hold a pattern', () => {
		const { columns, rows } = table(['0702022 - JUSSY', '0350451 - BRUZ']);
		expect(namedColumns(columns, rows)).toEqual([false]);
	});
});
