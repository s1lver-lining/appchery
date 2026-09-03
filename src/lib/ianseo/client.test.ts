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
/** What each page is stamped with, where anything stamps it at all. */
const tags = new Map<string, string>();
/** Every read that was made, and what it said it already held. */
let asks: { path: string; tag: string | null }[] = [];
let thrown: Error | null = null;

vi.mock('./fetch', async () => {
	const actual = await vi.importActual<typeof import('./fetch')>('./fetch');
	return {
		...actual,
		fetchIanseo: async (path: string, asked: { tag?: string | null } = {}) => {
			if (thrown) throw thrown;
			const page = pages.get(path);
			if (page === undefined) throw new actual.IanseoError('missing', path);
			asks.push({ path, tag: asked.tag ?? null });
			// ianseo, or the proxy in front of it, answering that the page is the one already held.
			const tag = tags.get(path) ?? null;
			if (tag && asked.tag === tag) return { unchanged: true };
			return { unchanged: false, body: page, tag };
		}
	};
});

const cache = new Map<string, { value: unknown; cachedAt: number }>();
let written = 0;
vi.mock('./store', () => ({
	readCache: async (path: string) => cache.get(path) ?? null,
	writeCache: async (path: string, value: unknown) => {
		written++;
		cache.set(path, { value, cachedAt: Date.now() });
	},
	touchCache: async (path: string) => {
		const row = cache.get(path);
		if (row) cache.set(path, { ...row, cachedAt: Date.now() });
	}
}));

const { loadTournaments, loadCompetition, loadResultDocument, TOURNAMENT_LIST } = await import('./client');
const { IanseoError } = await import('./fetch');

const DOC = '/TourData/2026/26053/IQRM.php';

beforeEach(() => {
	cache.clear();
	pages.clear();
	tags.clear();
	asks = [];
	written = 0;
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

/**
 * A page ianseo has rearranged half of. Reading none of it is already caught; reading some of it
 * used to pass for the whole, so a list quietly a hundred competitions short looked complete.
 */
describe('a page only half of which could be read', () => {
	it('keeps every competition it did read, and says the rest are missing', async () => {
		const whole = pages.get(TOURNAMENT_LIST)!;
		const all = await loadTournaments();
		expect(all.skipped).toBe(0);

		// One row rewritten the way a change to ianseo would rewrite it: the app can no longer see it.
		const broken = whole.replace(/onclick="[^"]*toId=(\d+)[^"]*"/, 'data-to="$1"');
		pages.set(TOURNAMENT_LIST, broken);
		cache.clear();

		const some = await loadTournaments();
		expect(some.value.length).toBe(all.value.length - 1);
		expect(some.skipped).toBe(1);
	});

	it('counts the documents of a competition it could not read', async () => {
		const whole = await loadCompetition('26053');
		expect(whole.skipped).toBe(0);
		cache.clear();

		// One document's links rewritten: with no href left, the index can no longer navigate to it.
		const broken = pages
			.get('/Details.php?toId=26053')!
			.replace(/href="([^"]*IQRM[^"]*)"/g, 'data-was="$1"');
		pages.set('/Details.php?toId=26053', broken);

		const some = await loadCompetition('26053');
		expect(some.value.documents.length).toBeLessThan(whole.value.documents.length);
		expect(some.skipped).toBeGreaterThan(0);
	});

	it('reads a row cached before pages counted what they could not read', async () => {
		// The old shape: the value on its own, with nothing wrapped around it.
		cache.set(TOURNAMENT_LIST, { value: [{ toId: '1', name: 'Kept' }], cachedAt: Date.now() });
		const loaded = await loadTournaments();
		expect(loaded.value).toEqual([{ toId: '1', name: 'Kept' }]);
		expect(loaded.skipped).toBe(0);
	});
});

/**
 * Asking ianseo whether a page is still the one already held.
 *
 * ianseo stamps none of the pages it builds with PHP, so the proxy in front of it stamps them from
 * the bytes it read; the PDFs it serves off disk carry a stamp of their own. Either way the app says
 * what it holds and is answered in a line where nothing has changed, which is most of the time.
 */
describe('a page that has not changed', () => {
	it('says what it holds on the second read', async () => {
		tags.set(TOURNAMENT_LIST, '"abc"');
		await loadTournaments();
		expect(asks.at(-1)).toEqual({ path: TOURNAMENT_LIST, tag: null });

		await loadTournaments({ refresh: true });
		expect(asks.at(-1)).toEqual({ path: TOURNAMENT_LIST, tag: '"abc"' });
	});

	it('keeps what it had rather than reading it again', async () => {
		tags.set(TOURNAMENT_LIST, '"abc"');
		const first = await loadTournaments();
		const wrote = written;

		const again = await loadTournaments({ refresh: true });
		expect(again.value).toEqual(first.value);
		expect(again.problem).toBe(null);
		// Nothing was parsed and nothing was written: only the hour it was current at moved.
		expect(written).toBe(wrote);
		expect(again.cachedAt).toBeGreaterThanOrEqual(first.cachedAt!);
	});

	it('reads the page again once the stamp on it changes', async () => {
		tags.set(TOURNAMENT_LIST, '"abc"');
		await loadTournaments();
		const wrote = written;

		tags.set(TOURNAMENT_LIST, '"def"');
		pages.set(TOURNAMENT_LIST, pages.get(TOURNAMENT_LIST)!);
		const again = await loadTournaments({ refresh: true });
		expect(again.value.length).toBeGreaterThan(0);
		expect(written).toBe(wrote + 1);
	});

	it('asks nothing where it holds nothing, so a first read is never answered short', async () => {
		tags.set(TOURNAMENT_LIST, '"abc"');
		const first = await loadTournaments();
		expect(first.value.length).toBeGreaterThan(0);
	});

	it('still reads a page ianseo stamps with nothing at all', async () => {
		const first = await loadTournaments();
		const again = await loadTournaments({ refresh: true });
		expect(again.value).toEqual(first.value);
		expect(written).toBe(2);
	});

	it('carries the stamp through a competition and a document too', async () => {
		tags.set('/Details.php?toId=26053', '"one"');
		tags.set(DOC, '"two"');
		await loadCompetition('26053');
		await loadCompetition('26053', { refresh: true });
		expect(asks.at(-1)).toEqual({ path: '/Details.php?toId=26053', tag: '"one"' });

		await loadResultDocument(DOC);
		const wrote = written;
		const again = await loadResultDocument(DOC, { refresh: true });
		expect(again.value.kind).toBe('table');
		expect(written).toBe(wrote);
	});
});
