/**
 * What the proxy in front of the competition sources is allowed to ask for, shared by the Cloudflare
 * function that serves the deployed site and the middleware that serves the development one.
 *
 * Neither ianseo nor the FFTA sends a header that would let a browser read their pages from another
 * origin, so the web build asks this instead. An open proxy is a gift to whoever finds it, so both
 * the paths and the query are named rather than passed through.
 */

export const PROXY_PREFIX = '/competitions-api';

export const IANSEO_ORIGIN = 'https://www.ianseo.net';
export const FFTA_ORIGIN = 'https://www.ffta.fr';
export const INSCRIPTARC_ORIGIN = 'https://www.inscriptarc.fr';

type Source = {
	prefix: string;
	origin: string;
	paths: RegExp[];
	/** The query keys carried over. Everything else is dropped rather than forwarded. */
	query: string[];
	/** Repeated keys, such as the FFTA's départements, which arrive as `dep[]` more than once. */
	lists?: string[];
};

const SOURCES: Source[] = [
	{
		prefix: '/ianseo',
		origin: IANSEO_ORIGIN,
		paths: [
			/^\/TourList\.php$/,
			/^\/Details\.php$/,
			/^\/TourData\/\d{4}\/\d+\/[A-Za-z0-9_-]+\.(php|pdf)$/
		],
		query: ['toId']
	},
	{
		prefix: '/ffta',
		origin: FFTA_ORIGIN,
		paths: [/^\/competitions$/, /^\/epreuve\/\d+$/],
		query: ['start', 'end', 'sort_by', 'sort_order', 'page', 'discipline', 'univers'],
		lists: ['dep[]']
	},
	{
		prefix: '/inscriptarc',
		origin: INSCRIPTARC_ORIGIN,
		// One page holds every competition in the country that is open for entry, so one path does.
		paths: [/^\/competitions\/resultats$/],
		query: []
	}
];

export function sourceOf(path: string): Source | null {
	return SOURCES.find((source) => path.startsWith(`${source.prefix}/`)) ?? null;
}

export function allowedPath(source: Source, path: string): boolean {
	return source.paths.some((pattern) => pattern.test(path));
}

/** The URL a proxied request stands for, or null where it stands for nothing the app reads. */
export function targetOf(url: URL, prefix = PROXY_PREFIX): string | null {
	if (!url.pathname.startsWith(`${prefix}/`)) return null;

	const rest = url.pathname.slice(prefix.length);
	const source = sourceOf(rest);
	if (!source) return null;

	const path = rest.slice(source.prefix.length) || '/';
	if (!allowedPath(source, path)) return null;

	const query = new URLSearchParams();
	for (const key of source.query) {
		const value = url.searchParams.get(key);
		if (value !== null) query.set(key, value);
	}
	for (const key of source.lists ?? []) {
		for (const value of url.searchParams.getAll(key)) query.append(key, value);
	}

	const search = query.toString();
	return `${source.origin}${path}${search ? `?${search}` : ''}`;
}

/**
 * The headers a proxied page is answered with, shared by both servers.
 *
 * The app reads these pages with `fetch` and parses them itself, so nothing needs a browser to
 * render one. Handed to a browser it would be somebody else's markup running on the app's own
 * origin, where the archer's session is kept: a competition name is typed by whoever runs the
 * competition, and that is all it takes. The sandbox puts any such page in an origin of its own
 * with no script at all, and nosniff stops the type being talked into something else.
 */
export function proxyHeaders(contentType: string | null): Record<string, string> {
	return {
		'Content-Type': contentType ?? 'text/html; charset=UTF-8',
		'Content-Security-Policy': 'sandbox',
		'X-Content-Type-Options': 'nosniff',
		// A competition's pages are rebuilt as it is shot, and a cached result is a wrong result.
		'Cache-Control': 'public, max-age=60',
		// The app is served cross-origin isolated, which every subresource has to opt into.
		'Cross-Origin-Resource-Policy': 'same-origin'
	};
}
