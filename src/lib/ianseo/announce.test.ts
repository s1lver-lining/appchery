import { describe, expect, it } from 'vitest';
import { afterAnnouncing, announcements, notices, type Watch } from './announce';
import type { Tournament } from './types';

const tournament = (toId: string, updatedAt: number | null): Tournament =>
	({
		toId,
		name: `Competition ${toId}`,
		code: '',
		organiser: '',
		city: '',
		country: null,
		dates: '',
		from: null,
		to: null,
		updatedAt,
		major: false
	}) as Tournament;

const WORDS = {
	one: 'New results for {name}',
	body: 'Published on ianseo.',
	many: '{n} competitions have published',
	manyBody: 'Including {names}.'
};

describe('what an archer is told about while the app is shut', () => {
	it('says nothing about a competition that has not been rebuilt', () => {
		const watches: Watch[] = [{ toId: '1', label: 'Rennes', announcedAt: 500 }];
		expect(announcements(watches, [tournament('1', 500)])).toEqual([]);
		expect(announcements(watches, [tournament('1', 400)])).toEqual([]);
	});

	it('says so once it has', () => {
		const watches: Watch[] = [{ toId: '1', label: 'Rennes', announcedAt: 500 }];
		expect(announcements(watches, [tournament('1', 900)])).toEqual([
			{ toId: '1', label: 'Rennes', publishedAt: 900 }
		]);
	});

	/** Following something must never announce it straight back at the archer who just followed it. */
	it('says nothing about a competition it has never had a reading for', () => {
		const watches: Watch[] = [{ toId: '1', label: 'Rennes', announcedAt: null }];
		expect(announcements(watches, [tournament('1', null)])).toEqual([]);
		expect(announcements(watches, [])).toEqual([]);
	});

	it('never says the same thing twice', () => {
		let watches: Watch[] = [{ toId: '1', label: 'Rennes', announcedAt: 500 }];
		const list = [tournament('1', 900)];
		const found = announcements(watches, list);
		expect(found).toHaveLength(1);

		watches = afterAnnouncing(watches, found);
		expect(announcements(watches, list)).toEqual([]);
	});

	it('puts the most recently published first', () => {
		const watches: Watch[] = [
			{ toId: '1', label: 'Rennes', announcedAt: 0 },
			{ toId: '2', label: 'Brest', announcedAt: 0 }
		];
		const found = announcements(watches, [tournament('1', 100), tournament('2', 900)]);
		expect(found.map((one) => one.toId)).toEqual(['2', '1']);
	});
});

describe('how it is put', () => {
	it('names the competition when there are one or two', () => {
		const found = [{ toId: '1', label: 'Rennes', publishedAt: 900 }];
		expect(notices(found, WORDS)).toEqual([
			{ title: 'New results for Rennes', body: 'Published on ianseo.', toId: '1' }
		]);
	});

	/** A phone asleep all weekend has a tournament to catch up on, not a buzz for every class. */
	it('counts them instead of buzzing once each when there are several', () => {
		const found = ['1', '2', '3', '4'].map((toId) => ({
			toId,
			label: `Club ${toId}`,
			publishedAt: 900
		}));
		const [notice] = notices(found, WORDS);
		expect(notices(found, WORDS)).toHaveLength(1);
		expect(notice.title).toBe('4 competitions have published');
		expect(notice.body).toBe('Including Club 1, Club 2, Club 3.');
		// Nowhere in particular: somebody with four to look at was going to the list anyway.
		expect(notice.toId).toBe(null);
	});

	it('says nothing at all when there is nothing to say', () => {
		expect(notices([], WORDS)).toEqual([]);
	});
});
