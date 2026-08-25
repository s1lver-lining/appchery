import { parseCompetition } from './parse/details';
import { parseDocument } from './parse/document';
import { parseTournaments } from './parse/list';
import { fetchIanseo, IanseoError } from './fetch';
import { readCache, writeCache } from './store';
import type { Competition, ResultDocument, Tournament } from './types';

/**
 * Reading ianseo, cache first. Every screen paints from what the device already holds and then says
 * whether that is current, because the app is used at a shooting line where the signal is somebody
 * else's problem: a result from an hour ago, clearly dated, beats a spinner that never resolves.
 */

export const TOURNAMENT_LIST = '/TourList.php';

/** The list is a rebuild of every competition ianseo has ever hosted, and it changes by the day, not the minute. */
const LIST_TTL = 6 * 3600_000;
/** A competition's index of documents, which grows a line each time a class finishes. */
const COMPETITION_TTL = 15 * 60_000;
/** A result that is being shot moves end by end, so it is only ever trusted for a few minutes. */
const DOCUMENT_TTL = 5 * 60_000;

export type Loaded<T> = {
	value: T;
	/** When this was read from ianseo. Null for something that has never been read at all. */
	cachedAt: number | null;
	/** True when what is shown is older than it should be: no signal, or ianseo not answering. */
	stale: boolean;
};

export type LoadOptions = { refresh?: boolean; signal?: AbortSignal };

async function load<T>(
	path: string,
	parse: (html: string) => T,
	ttl: number,
	options: LoadOptions = {}
): Promise<Loaded<T>> {
	const cached = await readCache<T>(path);
	if (cached && !options.refresh && Date.now() - cached.cachedAt < ttl) {
		return { value: cached.value, cachedAt: cached.cachedAt, stale: false };
	}

	try {
		const value = parse(await fetchIanseo(path, options.signal));
		await writeCache(path, value);
		return { value, cachedAt: Date.now(), stale: false };
	} catch (error) {
		// What the device already has is worth more than the reason it could not be refreshed.
		if (cached) return { value: cached.value, cachedAt: cached.cachedAt, stale: true };
		throw error;
	}
}

export function loadTournaments(options?: LoadOptions): Promise<Loaded<Tournament[]>> {
	return load(TOURNAMENT_LIST, (html) => parseTournaments(html), LIST_TTL, options);
}

export function competitionPath(toId: string): string {
	return `/Details.php?toId=${encodeURIComponent(toId)}`;
}

export function loadCompetition(toId: string, options?: LoadOptions): Promise<Loaded<Competition>> {
	return load(
		competitionPath(toId),
		(html) => parseCompetition(toId, html),
		COMPETITION_TTL,
		options
	);
}

export function loadResultDocument(path: string, options?: LoadOptions): Promise<Loaded<ResultDocument>> {
	return load(
		path,
		(html) => {
			const document = parseDocument(html);
			// ianseo answers with a page either way, so an empty one is the only sign a document is gone.
			if (!document) throw new IanseoError('missing', path);
			return document;
		},
		DOCUMENT_TTL,
		options
	);
}
