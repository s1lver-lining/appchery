import { proxyHeaders, targetOf } from '../../src/lib/competitions/proxy';

/**
 * Neither ianseo nor the FFTA sends a header that would let the app read their pages from another
 * origin, so the web build asks this instead and it asks them. It passes the page through untouched:
 * the parsing is the app's own, on the phone as much as in the browser, so both read the same thing.
 */
export const onRequestGet: PagesFunction = async ({ request }) => {
	const target = targetOf(new URL(request.url));
	if (!target) return new Response('Not a page this app reads', { status: 404 });

	const answer = await fetch(target, {
		// Named rather than anonymous: the FFTA's site refuses a request that does not say what it is.
		headers: {
			'User-Agent': 'Mozilla/5.0 (compatible; Appchery/1.0; +https://appchery.com)',
			Accept: 'text/html,application/pdf'
		},
		// A competition's pages are rebuilt as it is shot, and a cached result is a wrong result.
		cf: { cacheTtl: 60, cacheEverything: false }
	});

	const headers = new Headers(proxyHeaders(answer.headers.get('Content-Type')));
	return new Response(answer.body, { status: answer.status, headers });
};
