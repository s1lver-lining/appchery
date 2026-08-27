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
		if (url.origin !== new URL(origin).origin) return undefined;
		/*
		 * Resolving encodes the spaces and the accents, which is most of what a competition names its
		 * paperwork with. It leaves the brackets, and a square bracket is reserved for an address of
		 * quite another kind: a file called `Feuilles de marque [U13-U18].pdf` produced a link that
		 * some readers of an address take and others refuse outright.
		 */
		url.pathname = url.pathname.replace(
			/[[\]{}|^`]/g,
			(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
		);
		return url.href;
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
