/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';
import { SHARE_CACHE, SHARE_KEY } from '$lib/import/incoming';
import { PROXY_PREFIX } from '$lib/competitions/proxy';
import { announcements, afterAnnouncing, notices } from '$lib/ianseo/announce';
import { readWatchState, writeWatchState } from '$lib/ianseo/watch';
import { parseTournaments, TOURNAMENT_LIST } from '$lib/ianseo/parse/list';

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

	// The proxy in front of the competition sources answers with somebody else's results, which change
	// while they are being read. Cached here they would freeze, and the app would date them as fresh.
	if (url.pathname.startsWith(PROXY_PREFIX)) return;

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

/**
 * Telling an archer about a result while the app is shut, with nothing behind it.
 *
 * No server sends this. The browser wakes the worker every so often, and the worker asks ianseo the
 * one question the app asks whenever it opens: has anything I follow been rebuilt? The browser
 * decides how often, and a phone saving power decides not at all, which is the price of there being
 * nobody to pay for a push service.
 */

const CHECK_TAG = 'ianseo-results';

async function checkResults(): Promise<void> {
	const state = await readWatchState();
	if (!state.enabled || state.watches.length === 0) return;

	let list;
	try {
		const response = await fetch(`${PROXY_PREFIX}/ianseo${TOURNAMENT_LIST}`);
		if (!response.ok) return;
		list = parseTournaments(await response.text());
	} catch {
		// Asleep on a train with no signal. There is nothing to say and nothing to remember.
		return;
	}
	if (list.length === 0) return;

	const found = announcements(state.watches, list);
	if (found.length === 0) return;

	// Written before anything is shown, so a notification that fails to raise is not repeated hourly.
	await writeWatchState({ ...state, watches: afterAnnouncing(state.watches, found) });

	for (const notice of notices(found, state.words)) {
		await worker.registration.showNotification(notice.title, {
			body: notice.body,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			// One competition replaces its own earlier notice rather than stacking up beside it.
			tag: notice.toId ? `ianseo-${notice.toId}` : 'ianseo-several',
			data: { path: notice.toId ? `/ianseo/${notice.toId}` : '/ianseo' }
		});
	}
}

worker.addEventListener('periodicsync', (event) => {
	const sync = event as ExtendableEvent & { tag?: string };
	if (sync.tag !== CHECK_TAG) return;
	sync.waitUntil(checkResults());
});

// The one-off kind, which is what a browser without the periodic sort still offers on reconnecting.
worker.addEventListener('sync', (event) => {
	const sync = event as ExtendableEvent & { tag?: string };
	if (sync.tag !== CHECK_TAG) return;
	sync.waitUntil(checkResults());
});

/** Straight to the competition it is about, reusing the window the app is already open in. */
worker.addEventListener('notificationclick', (event) => {
	const click = event as NotificationEvent;
	click.notification.close();
	const path = (click.notification.data?.path as string | undefined) ?? '/ianseo';
	const target = new URL(path, location.origin).href;

	click.waitUntil(
		(async () => {
			const open = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of open) {
				if ('navigate' in client) {
					await client.navigate(target);
					return void (await client.focus());
				}
			}
			await worker.clients.openWindow(target);
		})()
	);
});
