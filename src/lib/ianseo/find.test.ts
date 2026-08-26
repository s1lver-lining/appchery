import { describe, it, expect } from 'vitest';
import { countRows, findInRounds, findInSections, terms } from './find';
import type { BracketRound, DocumentSection } from './types';

const row = (...cells: string[]) => ({
	cells: cells.map((text) => ({ text, flag: null })),
	detail: [],
	strong: false
});

const section = (heading: string | null, rows: ReturnType<typeof row>[]): DocumentSection => ({
	heading,
	columns: [
		{ label: 'Pos.', secondary: false },
		{ label: 'Athlète', secondary: false },
		{ label: 'Club', secondary: false }
	],
	rows
});

const sections = [
	section('Recurve Men', [
		row('1', 'DUCROCQ Tanguy', 'KOSH - Kohav Hasharon Archers'),
		row('2', 'JOURDAIN Gaspard', 'HRZ - Maccabi Tel-Aviv')
	]),
	section('Recurve Women', [row('1', 'LACHANCE Madeleine', 'HRZ - Maccabi Tel-Aviv')])
];

describe('terms', () => {
	it('splits on spaces and drops the accents a name is spelled with', () => {
		expect(terms('  LEMERCIER  Jonas ')).toEqual(['lemercier', 'jonas']);
	});
});

describe('findInSections', () => {
	it('gives everything back when nothing was typed', () => {
		expect(findInSections(sections, '  ')).toBe(sections);
	});

	it('keeps the line that answers, and drops the section with none', () => {
		const found = findInSections(sections, 'ducrocq');
		expect(found).toHaveLength(1);
		expect(found[0].heading).toBe('Recurve Men');
		expect(countRows(found)).toBe(1);
	});

	it('wants every word, in any order', () => {
		expect(countRows(findInSections(sections, 'tanguy ducrocq'))).toBe(1);
		expect(countRows(findInSections(sections, 'ducrocq gaspard'))).toBe(0);
	});

	it('searches the club as readily as the archer', () => {
		expect(countRows(findInSections(sections, 'maccabi'))).toBe(2);
	});

	it('ignores the accents the organiser wrote a name with', () => {
		const accented = [section(null, [row('1', 'LEMERCIER Jonas', 'Club')])];
		expect(countRows(findInSections(accented, 'lemercier'))).toBe(1);
		expect(countRows(findInSections(accented, 'LEMERCIER'))).toBe(1);
	});

	it('leaves the original alone', () => {
		findInSections(sections, 'ducrocq');
		expect(countRows(sections)).toBe(3);
	});
});

describe('findInRounds', () => {
	const rounds: BracketRound[] = [
		{
			title: '1/8',
			matches: [
				{
					entries: [
						{ seed: '1', name: 'Hijamad Nusuningsih', country: null, club: 'Grobogan', score: '7' },
						{ seed: '32', name: 'Nudiputri Sitirul', country: null, club: 'Pati', score: '1' }
					],
					sets: []
				},
				{
					entries: [
						{ seed: '2', name: 'Pirasan Nuhano', country: null, club: 'Wonogiri', score: '6' },
						{ seed: '31', name: 'Pinana Wajahab', country: null, club: 'Kota Semarang', score: '2' }
					],
					sets: []
				}
			]
		}
	];

	it('keeps a match where either side is the one wanted', () => {
		expect(findInRounds(rounds, 'sitirul')[0].matches).toHaveLength(1);
		expect(findInRounds(rounds, 'nuhano')[0].matches).toHaveLength(1);
	});

	it('drops a round with nobody in it rather than showing it empty', () => {
		expect(findInRounds(rounds, 'nobody')).toEqual([]);
	});

	it('searches the club too', () => {
		expect(findInRounds(rounds, 'wonogiri')[0].matches).toHaveLength(1);
	});
});
