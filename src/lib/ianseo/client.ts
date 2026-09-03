import { readPdfText } from '$lib/pdf/text';
import { parseCompetition } from './parse/details';
import { parseDocument } from './parse/document';
import { countTournaments, parseTournaments, TOURNAMENT_LIST } from './parse/list';
import { looksLike } from './parse/reading';
import { fetchIanseo, fetchIanseoBytes, IanseoError, type Asked } from './fetch';
import { parseSchedule, type Schedule } from './schedule';
import { readCache, touchCache, writeCache } from './store';
import type { Competition, ResultDocument, Tournament } from './types';

/**
 * Reading ianseo, cache first. Every screen paints from what the device already holds and then says
 * whether that is current, because the app is used at a shooting line where the signal is somebody
 * else's problem: a result from an hour ago, clearly dated, beats a spinner that never resolves.
 */

/** The list is a rebuild of every competition ianseo has ever hosted, and it changes by the day, not the minute. */
const LIST_TTL = 6 * 3600_000;
/** A competition's index of documents, which grows a line each time a class finishes. */
const COMPETITION_TTL = 15 * 60_000;
/** A result that is being shot moves end by end, so it is only ever trusted for a few minutes. */
const DOCUMENT_TTL = 5 * 60_000;

export { TOURNAMENT_LIST };

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
	/**
	 * Lines ianseo plainly published that this build could not read. A page half of which has changed
	 * shape is still worth showing: what was read stays reachable, and the screen says the rest is
	 * missing rather than quietly presenting a short list as the whole of one.
	 */
	skipped: number;
};

/** What a read came back with, before it is known whether it came from ianseo or from the device. */
type Parsed<T> = {
	value: T;
	skipped: number;
	/** What ianseo called this version of the page, so the next read can ask whether it is still it. */
	tag?: string | null;
};

/**
 * A cache row, whether or not it was written before pages counted what they could not read. The old
 * rows hold the value on its own, and a value of that shape is never a `Parsed` itself.
 */
function unwrap<T>(payload: Parsed<T> | T): Parsed<T> {
	const held = payload as Parsed<T>;
	const wrapped =
		held !== null &&
		typeof held === 'object' &&
		!Array.isArray(held) &&
		'value' in held &&
		typeof held.skipped === 'number';
	return wrapped ? held : { value: payload as T, skipped: 0 };
}

export type LoadOptions = {
	refresh?: boolean;
	signal?: AbortSignal;
	/**
	 * When ianseo last published this, where something the app already trusts says so: the list
	 * stamps every competition, and a competition stamps every document it holds. Anything read
	 * before that moment is out of date whatever its age, which is what an archer is being told by
	 * a competition marked new that then opens on yesterday's results.
	 */
	since?: number | null;
};

/**
 * Reading a page, where `null` back from the read means ianseo answered that it has not changed and
 * what the device holds still stands.
 */
async function load<T>(
	path: string,
	read: (asked: Asked) => Promise<Parsed<T> | null>,
	ttl: number,
	options: LoadOptions = {}
): Promise<Loaded<T>> {
	const cached = await readCache<Parsed<T> | T>(path);
	const held = cached ? unwrap<T>(cached.value) : null;
	// Age is only a guess at whether this has changed. A publishing time is knowledge, and wins.
	const published = options.since ?? 0;
	const current = cached && Date.now() - cached.cachedAt < ttl && cached.cachedAt >= published;
	if (cached && held && current && !options.refresh) {
		return { ...held, cachedAt: cached.cachedAt, problem: null };
	}

	try {
		// Asked only where there is something to keep: an answer of "still that one" is no use otherwise.
		const parsed = await read({ signal: options.signal, tag: held ? (held.tag ?? null) : null });
		if (!parsed) {
			// Nothing has changed, so nothing is parsed and nothing is written but the hour.
			if (held) {
				await touchCache(path);
				return { ...held, cachedAt: Date.now(), problem: null };
			}
			throw new IanseoError('unreadable', path);
		}
		await writeCache(path, parsed);
		return { ...parsed, cachedAt: Date.now(), problem: null };
	} catch (error) {
		const problem =
			error instanceof IanseoError && error.kind === 'unreadable' ? 'unreadable' : 'offline';
		// What the device already has is worth more than the reason it could not be refreshed.
		if (cached && held) return { ...held, cachedAt: cached.cachedAt, problem };
		throw error;
	}
}

/**
 * What the device already holds for a page, without asking ianseo for it at all. For a screen that
 * has to paint before the six megabytes the whole list is could possibly have been read.
 */
export async function heldValue<T>(path: string): Promise<Loaded<T> | null> {
	const cached = await readCache<Parsed<T> | T>(path);
	if (!cached) return null;
	return { ...unwrap<T>(cached.value), cachedAt: cached.cachedAt, problem: null };
}

export function loadTournaments(options?: LoadOptions): Promise<Loaded<Tournament[]>> {
	return load(
		TOURNAMENT_LIST,
		async (asked) => {
			const page = await fetchIanseo(TOURNAMENT_LIST, asked);
			if (page.unchanged) return null;
			const html = page.body;
			const list = parseTournaments(html);
			// A page with competitions on it out of which none could be read is a page that has changed.
			if (list.length === 0 && looksLike.tournamentList(html)) {
				throw new IanseoError('unreadable', TOURNAMENT_LIST);
			}
			// Some read and some not is the same change caught earlier, and the ones read still stand.
			return {
				value: list,
				skipped: Math.max(0, countTournaments(html) - list.length),
				tag: page.tag
			};
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
		async (asked) => {
			const page = await fetchIanseo(competitionPath(toId), asked);
			if (page.unchanged) return null;
			const html = page.body;
			const competition = parseCompetition(toId, html);
			// A competition that has published documents, none of which could be read, has changed shape.
			if (competition.documents.length === 0 && looksLike.competition(html)) {
				throw new IanseoError('unreadable', competitionPath(toId));
			}
			return { value: competition, skipped: competition.skipped, tag: page.tag };
		},
		COMPETITION_TTL,
		options
	);
}

export function loadResultDocument(path: string, options?: LoadOptions): Promise<Loaded<ResultDocument>> {
	return load(
		path,
		async (asked) => {
			const page = await fetchIanseo(path, asked);
			if (page.unchanged) return null;
			const html = page.body;
			const document = parseDocument(html);
			// ianseo answers with a page either way, so an empty one is the only sign a document is gone.
			if (!document) throw new IanseoError('missing', path);

			const empty =
				document.kind === 'table'
					? document.sections.length === 0
					: document.rounds.every((round) => round.matches.length === 0);
			// A table this app could not read a single row out of is not an empty table.
			if (empty && looksLike.document(html)) throw new IanseoError('unreadable', path);
			return { value: document, skipped: document.skipped, tag: page.tag };
		},
		DOCUMENT_TTL,
		options
	);
}

/**
 * The competition's timetable, read out of the PDF ianseo prints it as.
 *
 * A schedule this build cannot make sense of raises `unreadable` like any other page that has
 * changed shape, and the screen answers it the way the rest of the feature does: by handing the
 * archer the PDF, which has everything and always did.
 */
export function loadSchedule(path: string, options?: LoadOptions): Promise<Loaded<Schedule>> {
	return load(
		path,
		async (asked) => {
			// The one thing ianseo stamps itself, so this is the one page it can answer for.
			const file = await fetchIanseoBytes(path, asked);
			if (file.unchanged) return null;
			const schedule = parseSchedule(await readPdfText(file.body));
			if (!schedule) throw new IanseoError('unreadable', path);
			// A day the parser could not place sends the whole timetable to the PDF, so none is partly read.
			return { value: schedule, skipped: 0, tag: file.tag };
		},
		// A timetable is settled days before it is shot and changes about as often as the paperwork.
		COMPETITION_TTL,
		options
	);
}
