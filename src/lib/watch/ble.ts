/// <reference types="web-bluetooth" />

import { Capacitor } from '@capacitor/core';
import type { Channel } from './link';

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
	 * scripts/dev.sh does on the LAN; `no-wear` is the installed app on an iPhone, which no Wear OS
	 * watch has paired to since Wear OS 3 whatever the phone's Bluetooth can do.
	 */
	| { usable: false; reason: 'no-api' | 'insecure' | 'no-adapter' | 'no-wear' };

/**
 * One link, however the bytes travel. Both transports hand this back and neither knows what a
 * message means: the rules about whose arrows survive live in link.ts and are tested without any of
 * this.
 */
export interface Connection {
	channel: Channel;
	/** The watch's advertised name, for the settings card to show what it found. */
	name: string;
	/**
	 * What this watch is called underneath: the chooser's pick, kept so the native transport can
	 * open the link again without asking. Meaningless on another phone, and worthless in a browser,
	 * which is why only the native path ever remembers it.
	 */
	id: string;
	disconnect(): void;
}

export type ConnectFailure =
	| 'unsupported'
	/** The chooser was dismissed, which is a decision rather than a fault. */
	| 'cancelled'
	| 'no-service'
	/** Android refused the scan or connect permission, so there is nothing to be done in the app. */
	| 'no-permission'
	/** The adapter is off. Only the native path can tell: the browser simply fails to find anything. */
	| 'bluetooth-off'
	/** A remembered watch that is not answering, which is an ordinary thing for a watch to be. */
	| 'not-found'
	| 'failed';

export type ConnectResult =
	| { ok: true; connection: Connection }
	| { ok: false; reason: ConnectFailure; detail?: string };

/**
 * What this device can actually do, asked of the browser rather than assumed from the platform.
 * Chromium browsers have Web Bluetooth and Firefox has declined to implement it, so the answer is
 * per browser and cannot be read off the user agent.
 *
 * The installed app is the exception: its central is the platform's, not the webview's, so what the
 * webview thinks of `navigator.bluetooth` says nothing there.
 */
export function support(): Support {
	if (typeof window === 'undefined') return { usable: false, reason: 'no-api' };
	if (Capacitor.isNativePlatform()) {
		// Wear OS has not paired to an iPhone since Wear OS 3, so this is Android only however built.
		return Capacitor.getPlatform() === 'android'
			? { usable: true, path: 'native' }
			: { usable: false, reason: 'no-wear' };
	}
	// A LAN address is not a secure context, so the API is simply absent there rather than refusing.
	if (!window.isSecureContext) return { usable: false, reason: 'insecure' };
	if (!navigator.bluetooth) return { usable: false, reason: 'no-api' };
	return { usable: true, path: 'web-bluetooth' };
}

/**
 * Whether a watch already permitted can be picked up again without the chooser. Chrome on Android
 * has no `getDevices`, so the answer is no there and every connection costs the archer a tap: the
 * settings screen has to say so rather than promise a link that reappears by itself. A native
 * central connects straight to a remembered address, so the installed app never shows a chooser
 * twice and the card can stay quiet about it.
 */
export function canReconnectSilently(): boolean {
	const can = support();
	if (!can.usable) return false;
	if (can.path === 'native') return true;
	return typeof navigator.bluetooth?.getDevices === 'function';
}
