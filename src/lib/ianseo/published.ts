import { get } from 'svelte/store';
import { ianseoDocumentsSeen } from '$lib/prefs';
import type { CompetitionDocument } from './types';

/**
 * Which of a competition's documents have been published since the archer last opened it.
 *
 * The list already says a whole competition has something new, which is what lights the chip beside
 * it and the dot on the home page. This is the same question one level down, and it is the one an
 * archer standing at the notice board actually asks: not "has anything happened" but "which of
 * these ninety is the one that happened".
 *
 * One stamp a competition rather than one a document, because that is all it takes: the documents
 * carry their own publishing times, so anything stamped later than the newest one seen last time is
 * new, and nothing else is. A competition opened for the first time has nothing new in it, since
 * nothing can have happened since a moment this device had not read yet.
 */

const KEY = (toId: string) => `${toId}|`;
/** How many competitions are remembered, so reading around ianseo never becomes a store to clear. */
const REMEMBERED = 400;

export function seenPublished(toId: string, saved = get(ianseoDocumentsSeen)): number | null {
	const found = saved.find((one) => one.startsWith(KEY(toId)));
	if (!found) return null;
	const stamp = Number(found.slice(KEY(toId).length));
	return Number.isFinite(stamp) ? stamp : null;
}

/** Only ever forwards: reading a competition again with nothing new in it must not unsee anything. */
export function notePublished(toId: string, published: number | null): void {
	if (published === null) return;
	const saved = get(ianseoDocumentsSeen);
	if ((seenPublished(toId, saved) ?? 0) >= published) return;
	const rest = saved.filter((one) => !one.startsWith(KEY(toId)));
	ianseoDocumentsSeen.set([...rest, `${toId}|${published}`].slice(-REMEMBERED));
}

/**
 * The documents published since `seen`. Empty where this device has never read the competition,
 * which is an archer opening it for the first time rather than a competition that has just
 * published everything it holds.
 */
export function newDocuments(
	documents: CompetitionDocument[],
	seen: number | null
): Set<CompetitionDocument> {
	if (seen === null) return new Set();
	return new Set(documents.filter((one) => one.updatedAt !== null && one.updatedAt > seen));
}
