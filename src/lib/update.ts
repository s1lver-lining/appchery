/**
 * Keeping the installed app on the current build.
 *
 * A service worker only looks for a new version of itself when something asks it to, and an
 * installed app that is never closed properly may not ask for days. The shell is fetched fresh when
 * there is a network, so a launch already shows the current build; this is what gets the assets
 * behind it swapped over without waiting for a launch that happens to line up.
 */

/** Often enough to catch a deploy between two ends, rarely enough not to poll a range's phone signal. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let lastCheck = 0;

async function check() {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	if (!navigator.onLine) return;
	if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
	lastCheck = Date.now();
	const registration = await navigator.serviceWorker.getRegistration();
	await registration?.update().catch(() => undefined);
}

/** Called once by the layout. Returns the teardown, as an effect expects. */
export function watchForUpdates(): () => void {
	void check();
	const onVisible = () => {
		if (document.visibilityState === 'visible') void check();
	};
	document.addEventListener('visibilitychange', onVisible);
	return () => document.removeEventListener('visibilitychange', onVisible);
}

/**
 * The button in Settings, for when a deploy still has not appeared. Drops every cache the app has
 * put aside and loads it again from the network, which is the only thing left that can be stale.
 * Refuses while offline rather than emptying the cache the app is about to need.
 */
export async function refreshApp(): Promise<boolean> {
	if (!navigator.onLine) return false;
	if ('caches' in window) {
		const keys = await caches.keys();
		await Promise.all(keys.map((key) => caches.delete(key)));
	}
	const registration = await navigator.serviceWorker?.getRegistration();
	await registration?.update().catch(() => undefined);
	location.reload();
	return true;
}
