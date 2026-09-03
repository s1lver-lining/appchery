import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { ianseoDocumentsSeen } from '$lib/prefs';
import { newDocuments, notePublished, seenPublished } from './published';
import type { CompetitionDocument } from './types';

const document = (title: string, updatedAt: number | null): CompetitionDocument => ({
	path: `/TourData/2026/1/${title}.php`,
	pdfPath: null,
	url: null,
	title,
	group: 'Qualification Round',
	updatedAt
});

describe('what a competition has published since it was last opened', () => {
	beforeEach(() => ianseoDocumentsSeen.set([]));

	it('says nothing is new the first time a competition is opened', () => {
		expect(seenPublished('29887')).toBe(null);
		expect(newDocuments([document('IQRM', 5000)], null).size).toBe(0);
	});

	it('marks what was stamped after the last visit, and only that', () => {
		notePublished('29887', 5000);
		const documents = [document('IQRM', 4000), document('IQRW', 5000), document('IC', 6000)];
		const found = newDocuments(documents, seenPublished('29887'));
		expect([...found].map((one) => one.title)).toEqual(['IC']);
	});

	it('never unsees a competition read again with nothing new in it', () => {
		notePublished('29887', 5000);
		notePublished('29887', 4000);
		expect(seenPublished('29887')).toBe(5000);
	});

	it('keeps one competition out of another', () => {
		notePublished('29887', 5000);
		notePublished('29418', 9000);
		expect(seenPublished('29887')).toBe(5000);
		expect(seenPublished('29418')).toBe(9000);
	});

	it('remembers nothing about a competition that has published nothing', () => {
		notePublished('29887', null);
		expect(get(ianseoDocumentsSeen)).toEqual([]);
	});
});
