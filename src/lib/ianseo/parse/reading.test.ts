import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { looksLike, readEach } from './reading';
import { parseTournaments } from './list';
import { parseCompetition } from './details';
import { parseDocument } from './document';
import type { TableDocument } from '../types';

/**
 * What happens the day ianseo rearranges a page. Half a result list is worth far more than an error,
 * so every reader here is shown a page it cannot fully understand and asked what it saved.
 */

const list = readFileSync('test/ianseo/TourList.html', 'utf8');
const details = readFileSync('test/ianseo/Details.html', 'utf8');
const result = readFileSync('test/ianseo/IQRM.html', 'utf8');

describe('readEach', () => {
	it('keeps what could be read and steps over what could not', () => {
		const read = readEach([1, 2, 3, 4], (n) => {
			if (n === 2) throw new Error('unreadable');
			return n === 3 ? null : n * 10;
		});
		expect(read).toEqual([10, 40]);
	});
});

describe('a tournament list ianseo has half rearranged', () => {
	it('keeps every row that still reads', () => {
		const whole = parseTournaments(list).length;
		// One row mangled beyond recognition, as a change to the markup would leave it.
		const damaged = list.replace('<td class="column2 mobile-noshow">26MEDGAM</td>', '<td');
		const read = parseTournaments(damaged);
		expect(read.length).toBeGreaterThanOrEqual(whole - 1);
		expect(read.some((row) => row.toId === '29566')).toBe(true);
	});

	it('reads nothing out of a page that is no longer a list at all', () => {
		expect(parseTournaments('<html><body><p>Maintenance</p></body></html>')).toEqual([]);
	});
});

describe('a competition page ianseo has half rearranged', () => {
	it('keeps the documents that still read', () => {
		const whole = parseCompetition('26053', details).documents.length;
		const damaged = details.replace('results-item-container', 'results-item-CHANGED');
		const read = parseCompetition('26053', damaged).documents;
		expect(read.length).toBeGreaterThan(0);
		expect(read.length).toBeLessThan(whole);
	});
});

describe('a result list ianseo has half rearranged', () => {
	it('keeps the rows that still read', () => {
		const document = parseDocument(result) as TableDocument;
		const rows = document.sections[0].rows.length;
		expect(rows).toBeGreaterThan(3);

		// A cell left unclosed, which is the shape most markup changes take.
		const damaged = result.replace('<td class="text-right">583</td>', '<td class="text-right">583');
		const after = parseDocument(damaged) as TableDocument;
		expect(after.sections[0].rows.length).toBeGreaterThan(rows - 3);
	});
});

describe('looksLike', () => {
	it('recognises a page that had competitions on it', () => {
		expect(looksLike.tournamentList(list)).toBe(true);
		expect(looksLike.tournamentList('<html><body>Maintenance</body></html>')).toBe(false);
	});

	it('recognises a competition that had published something', () => {
		expect(looksLike.competition(details)).toBe(true);
		expect(looksLike.competition('<html><body>Nothing yet</body></html>')).toBe(false);
	});

	it('recognises a document that had a table in it', () => {
		expect(looksLike.document(result)).toBe(true);
		expect(looksLike.document('<html><body>Gone</body></html>')).toBe(false);
	});
});
