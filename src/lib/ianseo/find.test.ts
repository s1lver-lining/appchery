import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readPdfText } from '$lib/pdf/text';
import { countRows, findInRounds, findInSchedule, findInSections, namesFound, terms } from './find';
import { parseSchedule } from './schedule';
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

/**
 * Searching a schedule, where the answer is nearly always "when". ianseo names a session on the
 * line above its time and again on the line below, so the lines an archer searches for are the ones
 * printed with no time at all, and pulling them out of the block loses the only thing they were
 * being asked about.
 */
describe('findInSchedule', () => {
	const read = async (name: string) =>
		parseSchedule(await readPdfText(new Uint8Array(readFileSync(`test/ianseo/${name}.pdf`))))!.days;

	it('keeps only the lines that answer, and only the days that keep one', async () => {
		const all = await read('SCHEDULE');
		const days = findInSchedule(all, 'fclt4');
		expect(days.length).toBeGreaterThan(0);
		expect(days.length).toBeLessThan(all.length);
		expect(days.flatMap((day) => day.lines).every((line) => /fclt4/i.test(line.text))).toBe(true);
	});

	it('answers a day by its own heading with the whole of that day', async () => {
		const all = await read('SCHEDULE');
		const days = findInSchedule(all, 'mercredi');
		expect(days).toHaveLength(1);
		expect(days[0].lines).toEqual(all[1].lines);
	});

	it('gives a line the time of the session it was printed inside', async () => {
		const [day] = findInSchedule(await read('SCHEDULE'), 'match 5-6');
		// Printed under the match before it, with nothing else timed before the next block opens.
		expect(day.lines.map((line) => `${line.time} ${line.text}`)).toEqual([
			'10:10-10:45 Match 5-6: FCLT1B, HCLT1B',
			'12:10-12:45 Match 5-6: FCLT2B, HCLT2B',
			'15:30-16:05 Match 5-6: FCLT3B, HCLT3B',
			'17:30-18:05 Match 5-6: FCLT4B, HCLT4B'
		]);
		expect(day.lines.every((line) => line.duration === '00:35')).toBe(true);
	});

	it('answers on what was printed, never on the time it hands back', async () => {
		const [day] = findInSchedule(await read('SCHEDULE'), '12:00');
		// The one line that prints it. The rest of its session would otherwise come with it.
		expect(day.lines.map((line) => line.text)).toEqual(['Pause déjeuner']);
	});

	it('reaches downwards as readily as upwards, whichever is nearer', async () => {
		const [day] = findInSchedule(await read('SCHEDULE-3D'), 'distance 1');
		expect(day.lines.map((line) => `${line.time} ${line.text}`)).toEqual([
			'08:00-15:50 Distance 1'
		]);

		// This one is named on the line before its time, with another session's line above it.
		const [also] = findInSchedule(await read('SCHEDULE-3D'), 'parcours 2 - tir libre');
		expect(also.lines.map((line) => line.time)).toEqual(['08:00-16:00', '08:00-16:00']);
	});

	it('never borrows across the blank line that opens the next block', async () => {
		const [day] = findInSchedule(await read('SCHEDULE'), 'tours de qualifications');
		// The block heading itself, which nothing above it in the block gives a time to.
		expect(day.lines.map((line) => line.time)).toEqual(['09:30-11:45']);
	});
});
