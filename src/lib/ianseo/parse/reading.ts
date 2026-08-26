/**
 * Reading somebody else's HTML, given that they will change it.
 *
 * ianseo publishes pages, not data, and the day it rearranges one the app is left holding markup it
 * no longer recognises. Two rules follow from that. A row that cannot be read must never take the
 * rest of the page down with it: half a result list is worth far more than an error. And a page that
 * plainly had something on it, out of which nothing could be read, has to say so in those words,
 * rather than blaming the network or claiming the competition published nothing.
 */

/** One item read, or skipped because it could not be. Never throws: that is the whole point. */
export function readEach<T, R>(items: T[], read: (item: T) => R | null): R[] {
	const found: R[] = [];
	for (const item of items) {
		try {
			const one = read(item);
			if (one !== null) found.push(one);
		} catch {
			// One unreadable row out of a thousand is a row missing, not a page lost.
		}
	}
	return found;
}

/**
 * Whether a page had the shape of the thing being looked for, whatever came of reading it. Asked
 * only once a parse has come back empty, to tell "ianseo published nothing" from "this app can no
 * longer read what ianseo publishes", which read the same on screen and are not the same at all.
 */
export const looksLike = {
	/** The list links every competition by its own identifier, whatever the rows around it look like. */
	tournamentList: (html: string) => /Details\.php\?toId=\d+/.test(html),
	/** A competition's page links the documents it has published under the year it filed them. */
	competition: (html: string) => /\/TourData\/\d{4}\/\d+\//.test(html),
	/** Every document ianseo publishes is a table, whether it holds a result list or a bracket. */
	document: (html: string) => /<table[\s>]/i.test(html)
};
