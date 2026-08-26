import { describe, it, expect } from 'vitest';
import { clubName } from './clubs';

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
