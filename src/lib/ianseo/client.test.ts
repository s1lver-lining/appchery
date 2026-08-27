import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * What the app says when ianseo answers with a page it cannot read.
 *
 * Two failures that look identical on screen and are not the same at all: a range with no signal,
 * which waiting fixes, and a page that has been rearranged, which waiting never fixes. Telling an
 * archer to try again later when the app needs updating is telling them something untrue.
 */

const pages = new Map<string, string>();
let thrown: Error | null = null;

vi.mock('./fetch', async () => {
	const actual = await vi.importActual<typeof import('./fetch')>('./fetch');
	return {
		...actual,
		fetchIanseo: async (path: string) => {
			if (thrown) throw thrown;
			const page = pages.get(path);
			if (page === undefined) throw new actual.IanseoError('missing', path);
			return page;
		}
	};
});

const cache = new Map<string, { value: unknown; cachedAt: number }>();
vi.mock('./store', () => ({
	readCache: async (path: string) => cache.get(path) ?? null,
	writeCache: async (path: string, value: unknown) => void cache.set(path, { value, cachedAt: Date.now() })
}));

const { loadTournaments, loadCompetition, loadResultDocument, TOURNAMENT_LIST } = await import('./client');
const { IanseoError } = await import('./fetch');

const DOC = '/TourData/2026/26053/IQRM.php';

beforeEach(() => {
	cache.clear();
	pages.clear();
	thrown = null;
	pages.set(TOURNAMENT_LIST, readFileSync('test/ianseo/TourList.html', 'utf8'));
	pages.set('/Details.php?toId=26053', readFileSync('test/ianseo/Details.html', 'utf8'));
	pages.set(DOC, readFileSync('test/ianseo/IQRM.html', 'utf8'));
});

/** A page that still plainly holds competitions, written in a way this build cannot read. */
const rearranged = (html: string) => html.replace(/<t([dhr])\b/g, '<x$1').replace(/<\/t([dhr])>/g, '</x$1>');

describe('the tournament list', () => {
	it('reads cleanly when ianseo is itself', async () => {
		const loaded = await loadTournaments();
		expect(loaded.value.length).toBeGreaterThan(10);
		expect(loaded.problem).toBe(null);
	});

	it('says the page has changed rather than blaming the network', async () => {
		pages.set(TOURNAMENT_LIST, rearranged(pages.get(TOURNAMENT_LIST)!));
		await expect(loadTournaments()).rejects.toMatchObject({ kind: 'unreadable' });
	});

	it('keeps what it read before, and names why it could not refresh it', async () => {
		await loadTournaments();
		pages.set(TOURNAMENT_LIST, rearranged(pages.get(TOURNAMENT_LIST)!));

		const loaded = await loadTournaments({ refresh: true });
		expect(loaded.value.length).toBeGreaterThan(10);
		expect(loaded.problem).toBe('unreadable');
	});

	it('calls it offline when that is what it is', async () => {
		await loadTournaments();
		thrown = new IanseoError('offline', 'no signal');
		expect((await loadTournaments({ refresh: true })).problem).toBe('offline');
	});

	it('is not a changed page when ianseo simply has nothing to list', async () => {
		pages.set(TOURNAMENT_LIST, '<html><body><p>Maintenance</p></body></html>');
		const loaded = await loadTournaments();
		expect(loaded.value).toEqual([]);
		expect(loaded.problem).toBe(null);
	});
});

describe('a competition', () => {
	it('says the page has changed when its documents can no longer be found on it', async () => {
		const page = pages.get('/Details.php?toId=26053')!;
		pages.set('/Details.php?toId=26053', page.replace(/results-item-container/g, 'x'));
		await expect(loadCompetition('26053')).rejects.toMatchObject({ kind: 'unreadable' });
	});

	it('is not a changed page when the competition has published nothing yet', async () => {
		pages.set('/Details.php?toId=26053', '<html><body>Nothing yet</body></html>');
		expect((await loadCompetition('26053')).problem).toBe(null);
	});
});

describe('a document', () => {
	it('says the page has changed when nothing could be read out of its table', async () => {
		pages.set(DOC, rearranged(pages.get(DOC)!));
		await expect(loadResultDocument(DOC)).rejects.toMatchObject({ kind: 'unreadable' });
	});

	it('still says gone when ianseo no longer publishes it at all', async () => {
		pages.set(DOC, '<html><body>Not found</body></html>');
		await expect(loadResultDocument(DOC)).rejects.toMatchObject({ kind: 'missing' });
	});
});

/**
 * A competition marked new that opens on the results from before it was marked.
 *
 * Age alone cannot tell a cached page from a current one: ianseo republishes a competition several
 * times an evening as each class finishes, and the list says exactly when it last did. A reading
 * taken before that moment is the previous round's, however few minutes old it is.
 */
describe('a page ianseo has published since it was read', () => {
	it('is read again rather than served from a cache younger than its time to live', async () => {
		const first = await loadCompetition('26053');
		expect(first.value.documents.length).toBeGreaterThan(0);

		// ianseo publishes another class, and the list stamps the competition a minute from now.
		pages.set(
			'/Details.php?toId=26053',
			pages
				.get('/Details.php?toId=26053')!
				.replace('IQRM.php', 'IQRM.php')
				.replace('Recurve Men [After 60 Arrows]', 'Recurve Men [After 72 Arrows]')
		);

		const again = await loadCompetition('26053', { since: Date.now() + 60_000 });
		expect(again.value.documents.some((one) => one.title.includes('72 Arrows'))).toBe(true);
	});

	it('and is still served from the cache when nothing has been published since', async () => {
		const first = await loadCompetition('26053');
		pages.clear();
		const again = await loadCompetition('26053', { since: first.cachedAt });
		expect(again.value.documents.length).toBe(first.value.documents.length);
		expect(again.problem).toBe(null);
	});
});
