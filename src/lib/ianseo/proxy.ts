/**
 * What the proxy in front of ianseo is allowed to ask for, shared by the Cloudflare function that
 * serves the deployed site and the middleware that serves the development one.
 *
 * An open proxy is a gift to whoever finds it, so the paths are named rather than passed through:
 * these are the four kinds of page the app reads, and nothing else is anybody's business.
 */

export const IANSEO_ORIGIN = 'https://www.ianseo.net';

const ALLOWED = [
	/^\/TourList\.php$/,
	/^\/Details\.php$/,
	/^\/TourData\/\d{4}\/\d+\/[A-Za-z0-9_-]+\.(php|pdf)$/
];

export function allowedPath(path: string): boolean {
	return ALLOWED.some((pattern) => pattern.test(path));
}

/** The ianseo URL a proxied request stands for, or null where it stands for nothing the app reads. */
export function targetOf(url: URL, prefix = '/ianseo-api'): string | null {
	if (!url.pathname.startsWith(prefix)) return null;
	const path = url.pathname.slice(prefix.length) || '/';
	if (!allowedPath(path)) return null;
	// Only the query ianseo itself understands is carried over, and `toId` is the whole of it.
	const toId = url.searchParams.get('toId');
	return `${IANSEO_ORIGIN}${path}${toId ? `?toId=${encodeURIComponent(toId)}` : ''}`;
}
