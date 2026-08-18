import { hasBuiltInServer } from './config';

/**
 * When an exchange happens: signing in, the app coming back to the front, and the network coming
 * back. Never on a timer, and never while an archer is in the middle of scoring: the change log
 * keeps what is owed, so an exchange can always wait for a natural pause.
 *
 * Nothing here is on the boot path. A device with no server configured, or nobody signed in, does
 * not load the sync module at all, let alone the client library.
 */

/** The key supabase-js writes its session under. Reading it costs nothing and answers the question. */
function looksSignedIn(): boolean {
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith('sb-') && key.endsWith('-auth-token')) return true;
		}
	} catch {
		// A browser refusing localStorage is a browser that cannot have signed in either.
	}
	return false;
}

let listening: (() => void) | null = null;

/**
 * Registers the triggers, at most once. Called by the layout for a device that was already signed
 * in, and again by the account card the moment somebody signs in: without that second call, an
 * archer who signs in today gets no resume and no reconnect trigger until they next restart the app,
 * because at boot there was no session to find.
 */
export async function startWatching(): Promise<void> {
	if (typeof window === 'undefined' || listening) return;

	const [{ syncNow }, { initAuth }] = await Promise.all([import('./index'), import('./auth')]);
	await initAuth().catch(() => {});

	const trigger = () => void syncNow();
	const onVisible = () => {
		if (document.visibilityState === 'visible') trigger();
	};

	document.addEventListener('visibilitychange', onVisible);
	window.addEventListener('online', trigger);
	listening = () => {
		document.removeEventListener('visibilitychange', onVisible);
		window.removeEventListener('online', trigger);
		listening = null;
	};

	trigger();
}

/** Called once by the layout. Returns the teardown, as an effect expects. */
export function watchSync(): () => void {
	if (typeof window === 'undefined' || !hasBuiltInServer() || !looksSignedIn()) return () => {};

	let cancelled = false;
	void startWatching().then(() => {
		if (cancelled) listening?.();
	});

	return () => {
		cancelled = true;
		listening?.();
	};
}
