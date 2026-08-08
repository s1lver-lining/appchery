/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

/**
 * Precaches the whole app on install, because a scoring app that needs the network at the range is
 * useless. The database is separate: SQLite in OPFS holds the data, this only holds the app itself.
 */

const CACHE = `appchery-${version}`;
const ASSETS = [...build, ...files];

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

			// Build output is content hashed, so a hit is always the right version.
			const cached = await cache.match(request);
			if (cached) return cached;

			try {
				const response = await fetch(request);
				if (response.ok && response.type === 'basic') cache.put(request, response.clone());
				return response;
			} catch {
				// An SPA navigation offline still has to resolve to the app shell.
				if (request.mode === 'navigate') {
					const shell = await cache.match('/');
					if (shell) return shell;
				}
				throw new Error('Offline and not cached');
			}
		})()
	);
});
