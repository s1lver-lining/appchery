import { get } from 'svelte/store';
import { Capacitor } from '@capacitor/core';
import { haptics } from './prefs';

/**
 * A felt answer to a tap. Scoring is done by thumb at a target, so the buzz is what says the tap
 * landed without asking for a look away from the shot.
 *
 * Two ways to reach the motor, because neither covers both places this app runs. Inside the native
 * shell `navigator.vibrate` does nothing whatsoever on iOS, so the plugin drives the taptic engine
 * there; in a browser or an installed web app there is no plugin to call and the vibration API is
 * what Android exposes. iOS Safari has neither, and stays silent rather than pretending otherwise.
 */

export type Strength = 'light' | 'medium' | 'heavy';

/**
 * How long the web path asks for, per strength. Long compared to what the native engine needs,
 * because the two are not the same instrument. A phone's motor has to spin up before anything is
 * felt through a case and a grip, and on most Android hardware that takes something like forty
 * milliseconds; anything shorter is spent entirely on getting the weight moving and arrives as
 * silence. The taptic engine has no such warm-up, which is why only these numbers are generous.
 */
const WEB_MS: Record<Strength, number> = { light: 45, medium: 75, heavy: 110 };

/**
 * A pulse cancels whatever is still running, so two calls a few milliseconds apart leave one buzz
 * that is shorter than either asked for. That happens by design in places: a keypad button buzzes
 * for the press and the handler it calls buzzes for the arrow it wrote. The second call is dropped
 * rather than allowed to cut the first one short.
 */
const COALESCE_MS = 120;
let lastFired = 0;

/** Resolved once and remembered, including the failure: a missing plugin will not appear later. */
let loaded: typeof import('@capacitor/haptics') | null | undefined;

async function plugin() {
	if (loaded === undefined) {
		try {
			loaded = await import('@capacitor/haptics');
		} catch {
			loaded = null;
		}
	}
	return loaded;
}

/**
 * Never awaited by the caller and never able to throw: a buzz that fails is not a reason for an
 * arrow to go unrecorded, and the motor is busy often enough that a rejection is ordinary.
 */
function fire(run: (mod: NonNullable<typeof loaded>) => Promise<unknown>) {
	void plugin()
		.then((mod) => (mod ? run(mod) : undefined))
		.catch(() => {});
}

function buzz(strength: Strength) {
	if (!get(haptics)) return;
	if (!claim()) return;
	if (Capacitor.isNativePlatform()) {
		fire((mod) =>
			mod.Haptics.impact({
				style:
					strength === 'heavy'
						? mod.ImpactStyle.Heavy
						: strength === 'medium'
							? mod.ImpactStyle.Medium
							: mod.ImpactStyle.Light
			})
		);
		return;
	}
	navigator.vibrate?.(WEB_MS[strength]);
}

/**
 * What this device did when asked, as opposed to what it claims it can do. Three things can each
 * silence the web path on their own and none of them raise anything: the API can be missing, the
 * call can be refused, or it can be accepted by hardware that stays still. Only a real request
 * separates the last two, which is why this buzzes rather than probing - asking for zero length
 * cancels instead of vibrating, and Chrome lets a cancel past the activation check that a genuine
 * pulse has to clear, so the cheap version of this answered yes to questions it had not asked.
 */
export type Support = { path: 'native' } | { path: 'web'; accepted: boolean } | { path: 'none' };

/** Long enough that nobody has to wonder whether they felt it, and unmistakably not a scoring tap. */
const TEST_MS = 250;

export function selfTest(): Support {
	if (Capacitor.isNativePlatform()) {
		fire((mod) => mod.Haptics.impact({ style: mod.ImpactStyle.Heavy }));
		return { path: 'native' };
	}
	if (typeof navigator === 'undefined' || !navigator.vibrate) return { path: 'none' };
	// Deliberately outside the coalescing window: a test asked for is a test run.
	lastFired = 0;
	return { path: 'web', accepted: navigator.vibrate(TEST_MS) };
}

/** One arrow, one tap. As short as a key press, so a fast count does not blur into one long buzz. */
export function tap() {
	buzz('light');
}

/** Something written down rather than merely touched: an end closed, a revision saved. */
export function commit() {
	buzz('medium');
}

/**
 * True at most once per COALESCE_MS, so a moment that reaches the motor twice is felt once and at
 * full length.
 */
function claim() {
	const now = Date.now();
	if (now - lastFired < COALESCE_MS) return false;
	lastFired = now;
	return true;
}

/** A record, a badge, a match won. The one buzz allowed to be a pattern rather than a pulse. */
export function celebrate() {
	if (!get(haptics)) return;
	if (!claim()) return;
	if (Capacitor.isNativePlatform()) {
		fire((mod) => mod.Haptics.notification({ type: mod.NotificationType.Success }));
		return;
	}
	navigator.vibrate?.([45, 60, 45, 60, 90]);
}

/** A tap that could not do what it asked for, which is worth feeling differently from one that did. */
export function warn() {
	if (!get(haptics)) return;
	if (!claim()) return;
	if (Capacitor.isNativePlatform()) {
		fire((mod) => mod.Haptics.notification({ type: mod.NotificationType.Warning }));
		return;
	}
	navigator.vibrate?.([70, 50, 70]);
}
