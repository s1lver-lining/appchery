import { writable } from 'svelte/store';

/**
 * Chrome does not offer installation on its own: it fires `beforeinstallprompt` when the app
 * qualifies and leaves the asking to the page. The event arrives once, early, and is spent when
 * used, so it is caught at import and held until something asks for it.
 *
 * Firefox and Safari never fire it, since their install lives in the browser's own share menu, so
 * the store simply stays false there and the button that reads it never appears.
 */

type InstallPromptEvent = Event & {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallPromptEvent | null = null;

/** True only while a real prompt is in hand: the button cannot promise what the browser withheld. */
export const installable = writable(false);

if (typeof window !== 'undefined') {
	window.addEventListener('beforeinstallprompt', (event) => {
		// Chrome's own mini banner is suppressed by this, which is the point: Settings asks instead,
		// rather than a bar appearing over the scorecard mid-end.
		event.preventDefault();
		deferred = event as InstallPromptEvent;
		installable.set(true);
	});

	window.addEventListener('appinstalled', () => {
		deferred = null;
		installable.set(false);
	});
}

/** Must run from a user gesture, and only once: Chrome discards the event after a single use. */
export async function promptInstall(): Promise<void> {
	const event = deferred;
	if (!event) return;
	deferred = null;
	installable.set(false);
	try {
		await event.prompt();
		await event.userChoice;
	} catch {
		// Dismissed or already spent. Either way the event is gone and the button is right to hide.
	}
}
