import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from './document';
import type { BracketDocument, TableDocument } from '../types';

const load = (name: string) => parseDocument(readFileSync(`test/ianseo/${name}.html`, 'utf8'));
const table = (name: string) => load(name) as TableDocument;

describe('parseDocument, on a result list', () => {
	const document = table('IQRM');

	it('takes the title ianseo gives it', () => {
		expect(document.kind).toBe('table');
		expect(document.title).toBe('Recurve Men [After 60 Arrows]');
	});

	it('reads the columns, marking the ones ianseo itself folds away on a narrow screen', () => {
		expect(document.sections[0].columns.map((column) => column.label)).toEqual([
			'Pos.',
			'Athlete',
			'Country',
			'18m-1',
			'18m-2',
			'Tot.',
			'10',
			'9'
		]);
		expect(document.sections[0].columns.map((column) => column.secondary)).toEqual([
			false,
			false,
			true,
			true,
			true,
			false,
			false,
			false
		]);
	});

	it('reads a row whole', () => {
		expect(document.sections[0].rows[0].cells.map((cell) => cell.text)).toEqual([
			'1',
			'DUCROCQ Tanguy',
			'KOSH - Kohav Hasharon Archers',
			'287/ 3',
			'296/ 1',
			'583',
			'0',
			'0'
		]);
	});

	it('keeps the lines behind "show details" as the row detail rather than as rows of their own', () => {
		const [first] = document.sections[0].rows;
		expect(first.detail).toEqual([
			'KOSH - Kohav Hasharon Archers',
			'18m-1: 287, 18m-2: 296'
		]);
		expect(document.sections[0].rows.every((row) => row.cells[0].text !== '')).toBe(true);
	});

	it('drops the spacer column ianseo ends the table with', () => {
		const widths = document.sections.flatMap((section) => [
			section.columns.length,
			...section.rows.map((row) => row.cells.length)
		]);
		expect(new Set(widths).size).toBe(1);
	});
});

describe('parseDocument, on a document of many classes', () => {
	const document = table('IC');

	it('splits it into a section for each class', () => {
		expect(document.title).toBe('Class & Division Result List - Individual');
		expect(document.sections.map((section) => section.heading)).toEqual([
			'Recurve - Men [After 60 Arrows]',
			'Recurve - Women [After 60 Arrows]',
			'Recurve - Under 21 Men [After 60 Arrows]',
			'Recurve - Under 21 Women [After 60 Arrows]',
			'Compound - Men [After 60 Arrows]'
		]);
	});

	it('lets a class name its own distances without losing the columns above it', () => {
		expect(document.sections[0].columns.map((column) => column.label)).toEqual([
			'Pos.',
			'Athlete',
			'Country',
			'18m-1',
			'18m-2',
			'Total',
			'10',
			'9'
		]);
	});

	it('marks the podium ianseo sets in bold', () => {
		const recurveMen = document.sections[0];
		expect(recurveMen.rows.filter((row) => row.strong).map((row) => row.cells[0].text)).toEqual([
			'1',
			'2',
			'3'
		]);
	});
});

describe('parseDocument, on an entry list', () => {
	const document = table('ENA');

	it('groups the archers under the letter they are filed by', () => {
		expect(document.title).toBe('Participant List in Alphabetical Order');
		expect(document.sections[0].heading).toBe('B');
		expect(document.sections[0].rows[0].cells[0].text).toBe('BARNIER Salome');
	});
});

describe('parseDocument, on a table of entries by country', () => {
	const document = table('STC');

	it('reads it as one section with no heading', () => {
		expect(document.sections).toHaveLength(1);
		expect(document.sections[0].heading).toBe(null);
		expect(document.sections[0].rows[0].cells.map((cell) => cell.text)).toEqual([
			'ALG - Algeria',
			'3',
			'2',
			'5',
			'1',
			'6'
		]);
	});
});

describe('parseDocument, on an elimination bracket', () => {
	const document = load('IBBM') as BracketDocument;

	it('reads the rounds in the order they are shot, and halves them each time', () => {
		expect(document.kind).toBe('bracket');
		expect(document.title).toBe('Barebow Men');
		expect(document.rounds.map((round) => round.title)).toEqual([
			'1/16',
			'1/8',
			'1/4',
			'1/2',
			'Finals'
		]);
		// The last round is the gold match and the bronze match, so it does not halve.
		expect(document.rounds.map((round) => round.matches.length)).toEqual([16, 8, 4, 2, 2]);
	});

	it('names both sides of a first round match, with the seeding and the club', () => {
		expect(document.rounds[0].matches[0].entries).toEqual([
			{ seed: '1', name: 'Hijamad Nusuningsih', country: null, club: 'Grobogan', score: '7' },
			{ seed: '32', name: 'Nudiputri Sitirul', country: null, club: 'Pati', score: '1' }
		]);
	});

	it('keeps the set scores drawn between the two sides, one line each', () => {
		expect(document.rounds[0].matches[0].sets).toEqual([
			['23', '24', '28', '25'],
			['23', '14', '17', '17']
		]);
	});

	it('carries a winner forward into the round above', () => {
		const [semi] = document.rounds[3].matches;
		const finalists = document.rounds[4].matches.flatMap((match) =>
			match.entries.map((entry) => entry.name)
		);
		const winner = semi.entries.reduce((best, entry) =>
			Number(entry.score ?? -1) > Number(best.score ?? -1) ? entry : best
		);
		expect(finalists).toContain(winner.name);
	});

	it('never invents a match for a slot nobody reached', () => {
		expect(
			document.rounds.every((round) =>
				round.matches.every((match) => match.entries.some((entry) => entry.name !== ''))
			)
		).toBe(true);
	});
});

describe('parseDocument, on a page with no table at all', () => {
	it('says so rather than returning an empty document', () => {
		expect(parseDocument('<html><body>Not found</body></html>')).toBe(null);
	});
});
