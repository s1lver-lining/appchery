import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCompetition, parseStamp, lastPublished } from './details';

const html = readFileSync('test/ianseo/Details.html', 'utf8');

describe('parseCompetition', () => {
	const competition = parseCompetition('26053', html);

	it('reads the heading the competition is published under', () => {
		expect(competition.name).toBe('Internal Squad Selection 600 Round (National Team)');
		expect(competition.organiser).toBe('Israeli Archery Association (ISRAA)');
		expect(competition.where).toBe('Wingate National Archery Center, 1 Jan 2026');
	});

	it('finds every document', () => {
		expect(competition.documents.length).toBeGreaterThan(10);
		expect(competition.documents.every((document) => document.path?.endsWith('.php'))).toBe(true);
		expect(competition.documents.every((document) => document.title.length > 0)).toBe(true);
	});

	it('keeps the title, the group and the PDF of a document together', () => {
		const men = competition.documents.find((document) => document.path?.endsWith('IQRM.php'));
		expect(men).toMatchObject({
			path: '/TourData/2026/26053/IQRM.php',
			title: 'Recurve Men [After 60 Arrows]',
			group: 'Qualification Round'
		});
		expect(men?.pdfPath).toContain('IQRM.pdf');
		expect(men?.updatedAt).toBe(Date.UTC(2026, 1, 23, 15, 7, 42));
	});

	it('groups the documents under more than one panel', () => {
		expect(new Set(competition.documents.map((document) => document.group)).size).toBeGreaterThan(1);
	});

	it('survives a page with nothing on it', () => {
		expect(parseCompetition('1', '<html></html>')).toEqual({
			toId: '1',
			name: '',
			organiser: '',
			where: '',
			documents: []
		});
	});
});

describe('parseStamp', () => {
	it('reads the timestamp a PDF link carries', () => {
		expect(parseStamp('2026-02-23+15%3A07%3A42')).toBe(Date.UTC(2026, 1, 23, 15, 7, 42));
	});

	it('gives up on anything else', () => {
		expect(parseStamp('yesterday')).toBe(null);
	});
});

describe('lastPublished', () => {
	it('takes the newest document, ignoring the ones with no stamp', () => {
		expect(
			lastPublished([
				{ path: 'a', pdfPath: null, title: '', group: '', updatedAt: 10 },
				{ path: 'b', pdfPath: null, title: '', group: '', updatedAt: null },
				{ path: 'c', pdfPath: null, title: '', group: '', updatedAt: 40 }
			])
		).toBe(40);
	});

	it('has no answer for a competition that has published nothing', () => {
		expect(lastPublished([])).toBe(null);
	});
});

/**
 * The panel a competition puts its own paperwork in. There is no page behind a mandate, only the
 * PDF, and an index that kept nothing but pages left the archers without the one document they
 * need before the competition rather than after it.
 */
describe('parseCompetition, on a competition with its own paperwork', () => {
	const paperwork = parseCompetition(
		'27949',
		readFileSync('test/ianseo/Details-27949.html', 'utf8')
	);

	it('keeps a document published as a PDF and nothing else', () => {
		const mandate = paperwork.documents.find((document) => document.title === 'Mandat');
		expect(mandate).toMatchObject({
			path: null,
			pdfPath: '/TourData/2026/27949/Mandat D2v.pdf?time=2026-04-27+10%3A33%3A43',
			group: 'Information'
		});
		expect(mandate?.updatedAt).toBe(Date.UTC(2026, 3, 27, 10, 33, 43));
	});

	it('without losing the documents that do have a page', () => {
		expect(paperwork.documents.filter((document) => document.path !== null)).toHaveLength(11);
	});

	/** A panel of panels: the qualification round is printed again as individual and as team. */
	it('and lists each document once, under the panel that prints it', () => {
		const paths = paperwork.documents.map((document) => document.path ?? document.pdfPath);
		expect(new Set(paths).size).toBe(paths.length);
		expect(paperwork.documents.find((document) => document.title === 'Mandat')?.group).toBe(
			'Information'
		);
	});
});
