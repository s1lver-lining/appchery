/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

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

worker.addEventListener('fetch', (event) => {
	const request = event.request;
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
