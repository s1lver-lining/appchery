/// <reference types="web-bluetooth" />

/**
 * What the two halves agree to look for. The watch advertises this service and serves these two
 * characteristics; both transports on the phone side look for exactly this.
 *
 * Two pipes rather than one per kind of message, because a characteristic is a fixed cost on both
 * sides and the envelope already says what a message is. See doc/llm-memory/watch-link.md.
 */

export const WATCH_SERVICE = '6e7d0001-b5a3-4f2e-9c11-8a2f3b6d4c70';

/** Notified by the watch: everything travelling from the wrist. */
export const TO_PHONE = '6e7d0002-b5a3-4f2e-9c11-8a2f3b6d4c70';

/** Written by the phone: everything travelling to the wrist. */
export const TO_WATCH = '6e7d0003-b5a3-4f2e-9c11-8a2f3b6d4c70';

export type Support =
	| { usable: true; path: 'web-bluetooth' | 'native' }
	/**
	 * Why not, in terms the settings screen can put to the archer. `no-api` is Firefox and Safari,
	 * which have no Web Bluetooth at all; `insecure` is a page served over plain http, which is what
	 * scripts/dev.sh does on the LAN.
	 */
	| { usable: false; reason: 'no-api' | 'insecure' | 'no-adapter' };

/**
 * What this device can actually do, asked of the browser rather than assumed from the platform.
 * Chromium browsers have Web Bluetooth and Firefox has declined to implement it, so the answer is
 * per browser and cannot be read off the user agent.
 */
export function support(): Support {
	if (typeof window === 'undefined') return { usable: false, reason: 'no-api' };
	// A LAN address is not a secure context, so the API is simply absent there rather than refusing.
	if (!window.isSecureContext) return { usable: false, reason: 'insecure' };
	if (!navigator.bluetooth) return { usable: false, reason: 'no-api' };
	return { usable: true, path: 'web-bluetooth' };
}

/**
 * Whether a watch already permitted can be picked up again without the chooser. Chrome on Android
 * has no `getDevices`, so the answer is no there and every connection costs the archer a tap: the
 * settings screen has to say so rather than promise a link that reappears by itself.
 */
export function canReconnectSilently(): boolean {
	if (typeof navigator === 'undefined' || !navigator.bluetooth) return false;
	return typeof navigator.bluetooth.getDevices === 'function';
}
