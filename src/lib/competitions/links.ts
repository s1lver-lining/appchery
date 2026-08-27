/**
 * Addresses read off somebody else's page, turned into something a browser may be handed.
 *
 * Every link in this feature was written by whoever runs the competition, which makes it typing
 * rather than data. A link is followed only where it goes somewhere the app meant to send people:
 * a file under the source it came from, or a page on the open web. Anything else, a scheme of its
 * own choosing above all, becomes no link at all rather than an attribute nobody looked at.
 */

/** A file published by a source, as an address under that source and nowhere else. */
export function fileLink(path: string | null | undefined, origin: string): string | undefined {
	if (!path) return undefined;
	try {
		const url = new URL(path, origin);
		// Resolved rather than matched, so a path with a space in it is encoded on the way through.
		return url.origin === new URL(origin).origin ? url.href : undefined;
	} catch {
		return undefined;
	}
}

/** A page somewhere else entirely, which the entry platforms are: only ever over http. */
export function webLink(url: string | null | undefined): string | undefined {
	if (!url) return undefined;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
	} catch {
		return undefined;
	}
}
