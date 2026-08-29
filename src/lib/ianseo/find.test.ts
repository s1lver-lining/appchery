import { describe, it, expect } from 'vitest';
import { countRows, findInRounds, findInSections, namesFound, terms } from './find';
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

describe('namesFound', () => {
	const table = {
		kind: 'table' as const,
		title: 'Qualification',
		skipped: 0,
		sections: [
			{
				heading: 'Recurve Men',
				columns: [
					{ label: 'Rank', secondary: false },
					{ label: 'Athlete', secondary: false },
					{ label: 'Score', secondary: false }
				],
				rows: [
					{
						cells: [{ text: '1' }, { text: 'DUPONT Marie' }, { text: '650' }],
						detail: ['Rennes Cie'],
						strong: false
					},
					{
						cells: [{ text: '2' }, { text: 'MARTIN Paul' }, { text: '640' }],
						detail: ['Boé'],
						strong: false
					}
				]
			}
		]
	};

	it('gives back the archer it found rather than only that it found one', () => {
		expect(namesFound(table as never, 'dupont')).toEqual(['DUPONT Marie']);
	});

	it('finds a name typed without the accents the organiser wrote it with', () => {
		expect(namesFound(table as never, 'boe')).toEqual(['MARTIN Paul']);
	});

	it('takes the words in whatever order they were typed', () => {
		expect(namesFound(table as never, 'marie dupont')).toEqual(['DUPONT Marie']);
	});

	it('gives back the archer on a line that answered on its club, not the club', () => {
		expect(namesFound(table as never, 'rennes')).toEqual(['DUPONT Marie']);
	});

	it('says nothing about a document nobody asked about, and nothing where nobody matches', () => {
		expect(namesFound(table as never, '')).toEqual([]);
		expect(namesFound(table as never, 'nobody')).toEqual([]);
	});

	it('reads both sides of a bracket, which is where a name appears without a row of its own', () => {
		const bracket = {
			kind: 'bracket' as const,
			title: '1/8',
			skipped: 0,
			rounds: [
				{
					title: '1/8',
					matches: [
						{
							entries: [
								{ seed: '1', name: 'DUPONT Marie', country: null, club: 'Rennes', score: '6' },
								{ seed: '16', name: 'MARTIN Paul', country: null, club: 'Boé', score: '0' }
							]
						}
					]
				}
			]
		};
		expect(namesFound(bracket as never, 'marie')).toEqual(['DUPONT Marie']);
	});
});
