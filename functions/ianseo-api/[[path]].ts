import { targetOf } from '../../src/lib/ianseo/proxy';

/**
 * ianseo sends no header that would let the app read its pages from another origin, so the web build
 * asks this instead and it asks ianseo. It passes the page through untouched: the parsing is the
 * app's own, on the phone as much as in the browser, so that both read the same thing.
 */
export const onRequestGet: PagesFunction = async ({ request }) => {
	const target = targetOf(new URL(request.url));
	if (!target) return new Response('Not an ianseo page this app reads', { status: 404 });

	const answer = await fetch(target, {
		headers: { 'User-Agent': 'Appchery (https://appchery.com)', Accept: 'text/html,application/pdf' },
		// ianseo rebuilds a competition's pages as it is shot, and a cached result is a wrong result.
		cf: { cacheTtl: 60, cacheEverything: false }
	});

	const headers = new Headers({
		'Content-Type': answer.headers.get('Content-Type') ?? 'text/html; charset=UTF-8',
		'Cache-Control': 'public, max-age=60',
		// The app is served cross-origin isolated, which every subresource has to opt into.
		'Cross-Origin-Resource-Policy': 'same-origin'
	});
	return new Response(answer.body, { status: answer.status, headers });
};
