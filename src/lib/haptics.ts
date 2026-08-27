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
 * How long the web path asks for, per strength. Well above the eight milliseconds this used to ask
 * for: Android rounds a pulse up to the shortest spin its motor can manage and drops anything under
 * roughly fifteen, so the old buzz was being asked for and never arriving.
 */
const WEB_MS: Record<Strength, number> = { light: 18, medium: 32, heavy: 48 };

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

/** One arrow, one tap. As short as a key press, so a fast count does not blur into one long buzz. */
export function tap() {
	buzz('light');
}

/** Something written down rather than merely touched: an end closed, a revision saved. */
export function commit() {
	buzz('medium');
}

/** A record, a badge, a match won. The one buzz allowed to be a pattern rather than a pulse. */
export function celebrate() {
	if (!get(haptics)) return;
	if (Capacitor.isNativePlatform()) {
		fire((mod) => mod.Haptics.notification({ type: mod.NotificationType.Success }));
		return;
	}
	navigator.vibrate?.([16, 60, 16, 60, 32]);
}

/** A tap that could not do what it asked for, which is worth feeling differently from one that did. */
export function warn() {
	if (!get(haptics)) return;
	if (Capacitor.isNativePlatform()) {
		fire((mod) => mod.Haptics.notification({ type: mod.NotificationType.Warning }));
		return;
	}
	navigator.vibrate?.([28, 44, 28]);
}
