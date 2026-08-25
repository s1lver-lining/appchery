import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from '$lib/db/schema';
import { MIGRATIONS } from '$lib/db/migrations';

/**
 * What the archer follows on ianseo, against a real SQLite: the badge that says a result is new is
 * a comparison of two stamps across two writes, and a store that loses one of them is a page that
 * lies about having nothing to show.
 */

const sqlite = new DatabaseSync(':memory:');
const proxy = drizzle(
	async (sql, params, method) => {
		const statement = sqlite.prepare(sql);
		if (method === 'run') {
			statement.run(...(params as never[]));
			return { rows: [] };
		}
		const rows = statement.all(...(params as never[])).map((r) => Object.values(r as object));
		return { rows: method === 'get' ? (rows[0] ?? []) : rows };
	},
	{ schema }
);

vi.mock('$lib/db', async () => {
	const actual = await import('$lib/db/schema');
	return { db: () => proxy, schema: actual };
});

const store = await import('./store');

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

beforeEach(() => {
	sqlite.exec('DELETE FROM ianseo_favourite; DELETE FROM ianseo_cache;');
});

const competition = (toId: string, label = 'A shoot') => ({
	id: store.favouriteId('competition', toId),
	kind: 'competition' as const,
	toId,
	label,
	detail: null
});

describe('following', () => {
	it('keeps what was followed, newest first', async () => {
		await store.addFavourite(competition('1', 'First'));
		await store.addFavourite(competition('2', 'Second'));
		const list = await store.favourites();
		expect(list.map((one) => one.label)).toEqual(['Second', 'First']);
	});

	it('follows a competition once however many times it is asked for', async () => {
		await store.addFavourite(competition('1', 'Old name'));
		await store.addFavourite(competition('1', 'New name'));
		const list = await store.favourites();
		expect(list).toHaveLength(1);
		expect(list[0].label).toBe('New name');
	});

	it('takes the archers followed inside a competition with it when it is dropped', async () => {
		await store.addFavourite(competition('1'));
		await store.addFavourite({
			id: store.favouriteId('archer', 'ducrocq tanguy', '1'),
			kind: 'archer',
			toId: '1',
			label: 'DUCROCQ Tanguy',
			detail: null
		});
		await store.addFavourite(competition('2'));

		await store.removeCompetition('1');
		expect((await store.favourites()).map((one) => one.toId)).toEqual(['2']);
	});

	it('follows the same archer separately at two competitions, which are two different shoots', async () => {
		for (const toId of ['1', '2']) {
			await store.addFavourite({
				id: store.favouriteId('archer', 'ducrocq tanguy', toId),
				kind: 'archer',
				toId,
				label: 'DUCROCQ Tanguy',
				detail: null
			});
		}
		expect(await store.favourites()).toHaveLength(2);
	});
});

describe('what is new', () => {
	it('is nothing until ianseo has published something', async () => {
		await store.addFavourite(competition('1'));
		expect((await store.favourites()).map(store.isNew)).toEqual([false]);
	});

	it('is nothing the first time the list says what a competition is at', async () => {
		await store.addFavourite(competition('1'));
		await store.notePublished('1', 1000);
		expect((await store.favourites()).some(store.isNew)).toBe(false);
	});

	it('is anything published since the archer last looked', async () => {
		await store.addFavourite(competition('1'));
		await store.notePublished('1', 1000);
		await store.markSeen(store.favouriteId('competition', '1'), 1000);
		expect((await store.favourites()).some(store.isNew)).toBe(false);

		await store.notePublished('1', 2000);
		expect((await store.favourites()).every(store.isNew)).toBe(true);
	});

	it('is nothing at all for a competition followed knowing what it had already published', async () => {
		await store.addFavourite({ ...competition('1'), publishedAt: 5000 });
		expect((await store.favourites()).some(store.isNew)).toBe(false);

		await store.notePublished('1', 6000);
		expect((await store.favourites()).every(store.isNew)).toBe(true);

		await store.markCompetitionSeen('1');
		expect((await store.favourites()).some(store.isNew)).toBe(false);
	});

	it('marks a competition seen up to what was published, not up to the clock', async () => {
		await store.addFavourite(competition('1'));
		await store.notePublished('1', 6000);
		await store.markCompetitionSeen('1');
		expect((await store.favourites())[0].seenAt).toBe(6000);
	});

	it('records nothing for a competition nobody follows', async () => {
		await store.notePublished('99', 1000);
		expect(await store.favourites()).toEqual([]);
	});
});

describe('the cache', () => {
	it('gives back what was written, and nothing for what was not', async () => {
		await store.writeCache('/TourList.php', [{ toId: '1' }]);
		expect((await store.readCache<{ toId: string }[]>('/TourList.php'))?.value).toEqual([
			{ toId: '1' }
		]);
		expect(await store.readCache('/nothing')).toBe(null);
	});

	it('overwrites a page rather than keeping both readings of it', async () => {
		await store.writeCache('/a', 1);
		await store.writeCache('/a', 2);
		expect((await store.readCache<number>('/a'))?.value).toBe(2);
		expect(sqlite.prepare('SELECT count(*) AS n FROM ianseo_cache').get()).toEqual({ n: 1 });
	});

	it('says nothing rather than throwing when a payload cannot be read back', async () => {
		sqlite
			.prepare('INSERT INTO ianseo_cache (path, payload, cached_at) VALUES (?, ?, ?)')
			.run('/bad', '{not json', 1);
		expect(await store.readCache('/bad')).toBe(null);
	});

	it('drops the oldest pages rather than growing without end', async () => {
		for (let index = 0; index < 260; index++) await store.writeCache(`/page/${index}`, index);
		const { n } = sqlite.prepare('SELECT count(*) AS n FROM ianseo_cache').get() as { n: number };
		expect(n).toBeLessThanOrEqual(200);
		// The most recent are the ones kept: the pages just read are the ones about to be read again.
		expect((await store.readCache<number>('/page/259'))?.value).toBe(259);
		expect(await store.readCache('/page/0')).toBe(null);
	});

	it('leaves what the archer follows alone when the pages are dropped', async () => {
		await store.addFavourite(competition('1'));
		for (let index = 0; index < 260; index++) await store.writeCache(`/page/${index}`, index);
		expect(await store.favourites()).toHaveLength(1);
	});
});
