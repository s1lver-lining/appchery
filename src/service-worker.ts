/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';
import { SHARE_CACHE, SHARE_KEY } from '$lib/import/incoming';

/**
 * Precaches the whole app on install, because a scoring app that needs the network at the range is
 * useless. The database is separate: SQLite in OPFS holds the data, this only holds the app itself.
 */

const CACHE = `appchery-${version}`;

// `files` is everything in static/, but _headers and _redirects are Cloudflare Pages configuration:
// Pages reads them at deploy time and never serves them, so requesting them 404s. cache.addAll
// rejects as a unit, so leaving them in fails the install event, and a service worker that never
// installs costs both offline support and the install prompt that depends on it.
// Matched on the tail, because `files` entries carry the app's base path in front of them.
const HOST_CONFIG = ['/_headers', '/_redirects'];
const ASSETS = [...build, ...files].filter((path) => !HOST_CONFIG.some((c) => path.endsWith(c)));

const worker = self as unknown as ServiceWorkerGlobalScope;

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	// Drop caches from older versions, or a device keeps every build ever installed.
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => worker.clients.claim())
	);
});

// An export shared from another app arrives as a POST that no static host can answer, so the file is
// parked in a cache and the import page is told to come and collect it.
worker.addEventListener('fetch', (event) => {
	const request = event.request;
	const target = new URL(request.url);
	if (request.method === 'POST' && target.pathname.endsWith('/import')) {
		event.respondWith(
			(async () => {
				try {
					const form = await request.formData();
					const file = form.get('file');
					if (file instanceof File) {
						const cache = await caches.open(SHARE_CACHE);
						await cache.put(
							SHARE_KEY,
							new Response(file, { headers: { 'x-filename': file.name } })
						);
					}
				} catch {
					// A share the worker cannot read leaves the page to say nothing was handed over.
				}
				return Response.redirect(new URL(target.pathname, location.origin).href, 303);
			})()
		);
		return;
	}
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			/**
			 * The shell comes off the network first when there is one. Everything else is content
			 * hashed and safe to serve from the cache, but the page that names those hashes is not: a
			 * cached shell hands the old build back and the new one only appears after this worker has
			 * installed, activated, and the app has been opened a second time. Two launches to see a
			 * deploy is what that cost, so the shell pays a request instead.
			 */
			if (request.mode === 'navigate') {
				try {
					const fresh = await fetch(request);
					if (fresh.ok && fresh.type === 'basic') cache.put(request, fresh.clone());
					return fresh;
				} catch {
					// Offline, which is normal at a range: the cached shell is the whole point of it.
					const shell = (await cache.match(request)) ?? (await cache.match('/'));
					if (shell) return shell;
					throw new Error('Offline and not cached');
				}
			}

			// Build output is content hashed, so a hit is always the right version.
			const cached = await cache.match(request);
			if (cached) return cached;

			try {
				const response = await fetch(request);
				if (response.ok && response.type === 'basic') cache.put(request, response.clone());
				return response;
			} catch {
				throw new Error('Offline and not cached');
			}
		})()
	);
});
