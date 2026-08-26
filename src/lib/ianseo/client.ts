import { parseCompetition } from './parse/details';
import { parseDocument } from './parse/document';
import { parseTournaments } from './parse/list';
import { looksLike } from './parse/reading';
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
	/**
	 * Why what is on screen is older than it should be, or null while it is current.
	 *
	 * `offline` is ianseo not answering, which waiting fixes. `unreadable` is ianseo answering with a
	 * page this build cannot make sense of, which waiting does not fix and which is worth saying in
	 * its own words rather than blaming a network that is working perfectly well.
	 */
	problem: 'offline' | 'unreadable' | null;
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
		return { value: cached.value, cachedAt: cached.cachedAt, problem: null };
	}

	try {
		const value = parse(await fetchIanseo(path, options.signal));
		await writeCache(path, value);
		return { value, cachedAt: Date.now(), problem: null };
	} catch (error) {
		const problem =
			error instanceof IanseoError && error.kind === 'unreadable' ? 'unreadable' : 'offline';
		// What the device already has is worth more than the reason it could not be refreshed.
		if (cached) return { value: cached.value, cachedAt: cached.cachedAt, problem };
		throw error;
	}
}

export function loadTournaments(options?: LoadOptions): Promise<Loaded<Tournament[]>> {
	return load(
		TOURNAMENT_LIST,
		(html) => {
			const list = parseTournaments(html);
			// A page with competitions on it out of which none could be read is a page that has changed.
			if (list.length === 0 && looksLike.tournamentList(html)) {
				throw new IanseoError('unreadable', TOURNAMENT_LIST);
			}
			return list;
		},
		LIST_TTL,
		options
	);
}

export function competitionPath(toId: string): string {
	return `/Details.php?toId=${encodeURIComponent(toId)}`;
}

export function loadCompetition(toId: string, options?: LoadOptions): Promise<Loaded<Competition>> {
	return load(
		competitionPath(toId),
		(html) => {
			const competition = parseCompetition(toId, html);
			// A competition that has published documents, none of which could be read, has changed shape.
			if (competition.documents.length === 0 && looksLike.competition(html)) {
				throw new IanseoError('unreadable', competitionPath(toId));
			}
			return competition;
		},
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

			const empty =
				document.kind === 'table'
					? document.sections.length === 0
					: document.rounds.every((round) => round.matches.length === 0);
			// A table this app could not read a single row out of is not an empty table.
			if (empty && looksLike.document(html)) throw new IanseoError('unreadable', path);
			return document;
		},
		DOCUMENT_TTL,
		options
	);
}
