import type { Tournament } from './types';

/**
 * What an archer should be told about while the app is shut.
 *
 * The app already knows how to spot a new result: the list stamps every competition with the moment
 * ianseo last rebuilt it, and a competition is new when that is later than what the archer has seen.
 * This is the same question asked from a background task, where there is nobody to look at a badge.
 *
 * Nothing here talks to the network, the database or the notification API, so the rule that decides
 * whether somebody's phone buzzes at seven in the morning can be read and tested on its own.
 */

export type Watch = {
	toId: string;
	label: string;
	/** The publishing time the archer has already been told about, or seen for themselves. */
	announcedAt: number | null;
};

export type Announcement = { toId: string; label: string; publishedAt: number };

/** A competition followed and rebuilt since the archer last heard about it. */
export function announcements(watches: Watch[], list: Tournament[]): Announcement[] {
	const published = new Map(list.map((row) => [row.toId, row.updatedAt]));

	const found: Announcement[] = [];
	for (const watch of watches) {
		const at = published.get(watch.toId);
		// Never on the first sighting: following a competition must not announce it straight back.
		if (at === undefined || at === null || at <= (watch.announcedAt ?? 0)) continue;
		found.push({ toId: watch.toId, label: watch.label, publishedAt: at });
	}
	return found.sort((a, b) => b.publishedAt - a.publishedAt);
}

/** The watches again, with everything just announced marked as told. */
export function afterAnnouncing(watches: Watch[], found: Announcement[]): Watch[] {
	const told = new Map(found.map((one) => [one.toId, one.publishedAt]));
	return watches.map((watch) =>
		told.has(watch.toId) ? { ...watch, announcedAt: told.get(watch.toId)! } : watch
	);
}

export type Notice = {
	title: string;
	body: string;
	/** Where tapping it goes, or null for the several competitions that share one notice. */
	toId: string | null;
};

/**
 * One notice, or one notice about several.
 *
 * A phone that has been asleep all weekend has a whole tournament to catch up on, and a buzz per
 * class is the app being unusable rather than helpful. Past a couple it says how many and opens the
 * list, which is where somebody with four competitions to look at was going anyway.
 */
const SEPARATELY = 2;

export function notices(
	found: Announcement[],
	words: { one: string; body: string; many: string; manyBody: string }
): Notice[] {
	if (found.length === 0) return [];
	if (found.length <= SEPARATELY) {
		return found.map((one) => ({
			title: fill(words.one, { name: one.label }),
			body: words.body,
			toId: one.toId
		}));
	}

	const names = found.slice(0, 3).map((one) => one.label);
	return [
		{
			title: fill(words.many, { n: String(found.length) }),
			body: fill(words.manyBody, { names: names.join(', ') }),
			toId: null
		}
	];
}

function fill(text: string, values: Record<string, string>): string {
	return text.replace(/\{(\w+)\}/g, (whole, key) => values[key] ?? whole);
}
