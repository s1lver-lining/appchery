import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { ianseoDocumentsSeen } from '$lib/prefs';
import { newDocuments, notePublished, seenInCache, seenPublished } from './published';
import type { Competition, CompetitionDocument } from './types';

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

/**
 * A competition the archer already follows, first opened after this was built. Without a fallback
 * it would go one whole round of publishing marking nothing, which reads as a feature that does not
 * work rather than as one waiting its turn.
 */
describe('what the device already held', () => {
	const kept = (stamps: (number | null)[]): Competition => ({
		toId: '29742',
		name: 'A competition',
		organiser: 'A club',
		where: 'Somewhere',
		documents: stamps.map((at, index) => document(`D${index}`, at)),
		skipped: 0
	});

	it('is the newest thing in the copy it kept', () => {
		expect(seenInCache(kept([3000, 7000, 5000]))).toBe(7000);
	});

	it('is nothing at all for a competition it has never read', () => {
		expect(seenInCache(null)).toBe(null);
		expect(seenInCache(kept([null]))).toBe(null);
	});

	it('marks what has arrived since that copy was taken', () => {
		const before = seenInCache(kept([3000, 7000]));
		const now = [document('D0', 3000), document('D1', 7000), document('D2', 9000)];
		expect([...newDocuments(now, before)].map((one) => one.title)).toEqual(['D2']);
	});
});
