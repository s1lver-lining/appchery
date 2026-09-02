/**
 * True fullscreen for the in-browser app, which is the only way to be rid of the URL bar without
 * installing. Not a preference: the browser owns the state, drops it on reload, and takes it back
 * on a system gesture, so this reads the browser rather than storing an answer of its own.
 *
 * Safari on iPhone has no element fullscreen at all, only video goes fullscreen there, so
 * `fullscreenSupported` is false and the setting hides itself rather than offering a dead switch.
 * Installing the app is the iPhone answer, and the manifest already covers it.
 */

/** Safari carried the prefixed names for years; iPad still answers to them on older versions. */
type PrefixedElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type PrefixedDocument = Document & {
	webkitFullscreenElement?: Element | null;
	webkitExitFullscreen?: () => Promise<void>;
	webkitFullscreenEnabled?: boolean;
};

const doc = () => document as PrefixedDocument;

export const fullscreenSupported = () =>
	typeof document !== 'undefined' &&
	Boolean(document.fullscreenEnabled || doc().webkitFullscreenEnabled);

export const isFullscreen = () =>
	typeof document !== 'undefined' &&
	Boolean(document.fullscreenElement || doc().webkitFullscreenElement);

/**
 * Must be called from a user gesture: browsers reject a fullscreen request that no tap asked for.
 * Rejection is not worth surfacing: the toggle reads the browser back, so a refused request simply
 * leaves the switch where it was.
 */
export async function setFullscreen(on: boolean): Promise<void> {
	try {
		if (on) {
			const el = document.documentElement as PrefixedElement;
			await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
		} else {
			await (document.exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
		}
	} catch {
		// Refused, or already in the requested state. Either way the listener below has the truth.
	}
}

/** Both event names, because the prefixed implementations emit only the prefixed one. */
export function onFullscreenChange(handler: () => void): () => void {
	document.addEventListener('fullscreenchange', handler);
	document.addEventListener('webkitfullscreenchange', handler);
	return () => {
		document.removeEventListener('fullscreenchange', handler);
		document.removeEventListener('webkitfullscreenchange', handler);
	};
}
