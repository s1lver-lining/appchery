import { hasBuiltInServer } from './config';

// When an exchange happens: signing in, coming back to the front, regaining the network. Never on a
// timer. A device with nobody signed in does not load the sync module at all.

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
 * Registered at most once, by the layout for a device already signed in and by the account card the
 * moment somebody signs in: at boot there was no session to find, so without both there are no
 * triggers until the app is restarted.
 */
export async function startWatching(): Promise<void> {
	if (typeof window === 'undefined' || listening) return;

	const [{ syncNow }, { initAuth }] = await Promise.all([import('./index'), import('./auth')]);
	await initAuth().catch(() => {});

	const trigger = () => void syncNow('automatic');
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
