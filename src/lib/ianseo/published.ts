import { get } from 'svelte/store';
import { ianseoDocumentsSeen } from '$lib/prefs';
import { lastPublished } from './parse/details';
import type { Competition, CompetitionDocument } from './types';

// Which of a competition's documents were published since it was last opened: see doc/ianseo.md, "When a result is new".

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

/** What this device already held of a competition it has no record of, as a fallback for `seenPublished`. */
export function seenInCache(kept: Competition | null | undefined): number | null {
	return kept ? lastPublished(kept.documents) : null;
}

/** The documents published since `seen`. Empty where this device has never read the competition. */
export function newDocuments(
	documents: CompetitionDocument[],
	seen: number | null
): Set<CompetitionDocument> {
	if (seen === null) return new Set();
	return new Set(documents.filter((one) => one.updatedAt !== null && one.updatedAt > seen));
}
