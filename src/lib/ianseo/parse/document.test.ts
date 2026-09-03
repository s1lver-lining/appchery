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
			'Compound - Men [After 60 Arrows]',
			// The last class on the page, whose rows sit in a `<tbody>` the document never closes.
			'Compound - Women [After 60 Arrows]'
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

describe('parseDocument, on a bracket with a bye in it', () => {
	const document = load('IBBW') as BracketDocument;
	const [first] = document.rounds;

	it('draws the bye as a match with one archer in it', () => {
		const bye = first.matches[0];
		expect(bye.entries[0].name).toBe('Bananingsih Ghabamad Falidi');
		expect(bye.entries[0].score).toBe('Bye');
		expect(bye.entries[1].name).toBe('');
	});

	it('gives the bye no set scores, because nobody shot it', () => {
		expect(first.matches[0].sets).toEqual([]);
	});

	it('leaves every match after the bye holding its own arrows', () => {
		const second = first.matches[1];
		expect(second.entries.map((entry) => entry.name)).toEqual([
			'Risuto Butisan Tuna',
			'Kasuzul Piwiwati Nasusyah'
		]);
		expect(second.sets).toEqual([
			['21', '18', '8', '13', '16'],
			['14', '15', '17', '15', '18']
		]);
	});

	/**
	 * The arrows and the result are two different readings of the same match, so they have to agree.
	 * This is the assertion that catches one archer's sets being handed to another: a bracket with a
	 * bye in it has fewer sets than matches, and everything after the bye slid up by one.
	 */
	it('gives every match the arrows that add up to the result beside it', () => {
		const played = document.rounds
			.flatMap((round) => round.matches)
			.filter((match) => match.sets.length === 2 && match.entries.length === 2);
		expect(played.length).toBeGreaterThan(10);

		for (const match of played) {
			const [ours, theirs] = match.sets;
			let won = 0;
			for (let set = 0; set < Math.min(ours.length, theirs.length); set++) {
				if (Number(ours[set]) > Number(theirs[set])) won++;
				else if (Number(ours[set]) < Number(theirs[set])) won--;
			}
			const scores = match.entries.map((entry) => Number(entry.score));
			const named = match.entries.map((entry) => entry.name).join(' v ');
			if (won === 0) {
				// Level on sets is a shoot-off, which separates the two of them by a single point.
				expect(Math.abs(scores[0] - scores[1]), named).toBe(1);
			} else {
				// Otherwise whoever took more sets is whoever the bracket says took the match.
				expect(Math.sign(won), named).toBe(Math.sign(scores[0] - scores[1]));
			}
		}
	});

	it('never gives two matches the same set scores', () => {
		const shot = document.rounds
			.flatMap((round) => round.matches)
			.filter((match) => match.sets.length > 0)
			.map((match) => JSON.stringify(match.sets));
		expect(new Set(shot).size).toBe(shot.length);
	});
});

describe('parseDocument, on a page with no table at all', () => {
	it('says so rather than returning an empty document', () => {
		expect(parseDocument('<html><body>Not found</body></html>')).toBe(null);
	});
});

/**
 * A team standing, whose `<tbody>` ianseo never closes. Read for the shape rather than for this one
 * competition: a document the app throws away is an archer told their class was never shot.
 */
describe('parseDocument, on a table left open', () => {
	const document = table('TQD2F');

	it('reads the rows the markup never closed', () => {
		expect(document.title).toBe('D2 - Femmes [Après 216 flèches]');
		expect(document.sections).toHaveLength(1);
		expect(document.sections[0].rows.length).toBeGreaterThan(5);
		expect(document.skipped).toBe(0);
	});

	it('and keeps each team with its club and its archers', () => {
		const first = document.sections[0].rows[0];
		expect(first.cells.map((cell) => cell.text)).toEqual([
			'1',
			'0441103 - Vineuil',
			'COLBERT Noemie DUPLESSIS Anouk OLLIVIER Diane',
			'1635',
			'17',
			'4',
			''
		]);
	});
});

/**
 * A qualification too wide for the page, which ianseo wraps onto a second line under the same
 * columns: eight distances printed as five and three, with the last three headed by nothing at all.
 */
describe('parseDocument, on a row ianseo wrapped', () => {
	const document = table('IQHCL');

	it('names every distance, not only the ones the header had room for', () => {
		expect(document.sections[0].columns.map((column) => column.label)).toEqual([
			'Pos.',
			'Athlète',
			'Clubs / Pays',
			'70m-1',
			'70m-2',
			'70m-3',
			'70m-4',
			'70m-5',
			'70m-6',
			'70m-7',
			'70m-8',
			'Tot.',
			'10+X',
			'X'
		]);
	});

	it('folds the wrapped distances as the archer may fold the printed ones', () => {
		const secondary = new Map(
			document.sections[0].columns.map((column) => [column.label, column.secondary])
		);
		expect(secondary.get('70m-8')).toBe(secondary.get('70m-1'));
	});

	it('keeps the wrapped half on the row it belongs to rather than as a row of its own', () => {
		const first = document.sections[0].rows[0];
		expect(first.cells.map((cell) => cell.text)).toEqual([
			'1',
			'CORMIER Boaz',
			'0163151 - Clermont Ferrand Cie',
			'340/ 2',
			'346/ 1',
			'346/ 1',
			'337/ 3',
			'341/ 2',
			'338/ 1',
			'341/ 1',
			'342/ 1',
			'2731',
			'156',
			'50'
		]);
		// ianseo's own unfolded line says the same eight scores, which is what makes this checkable.
		expect(first.detail.at(-1)).toContain('70m-8: 342');
		expect(document.skipped).toBe(0);
	});

	it('reads every archer, none of them eaten by the line above', () => {
		expect(document.sections[0].rows).toHaveLength(19);
	});
});
