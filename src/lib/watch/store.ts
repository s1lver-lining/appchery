import { writable } from 'svelte/store';
import { deviceId } from '$lib/db/repository';
import { canReconnectSilently, support } from './ble';
import { connect as connectOverWeb, type ConnectFailure, type Connection } from './ble.web';
import { WatchLink, type LinkEvent } from './link';

/**
 * The one link this device holds, kept here rather than on a page because the app is a single page:
 * a connection made in the settings survives walking to the scoring screen, and it has to, since
 * Chrome has no `getDevices` and reopening one costs the archer a tap at the shooting line.
 */

export type WatchStatus =
	/** Nothing about this browser can talk to a watch, and the reason is worth saying out loud. */
	| { state: 'unsupported'; reason: 'no-api' | 'insecure' | 'no-adapter' }
	| { state: 'idle' }
	| { state: 'connecting' }
	| { state: 'connected'; name: string; fragile: boolean }
	/**
	 * Connected to something that never answered. Worth its own state rather than being called
	 * connected: updating the watch app leaves exactly this, and it looks perfectly healthy.
	 */
	| { state: 'stale'; name: string }
	| { state: 'failed'; reason: ConnectFailure }
	/** It was connected and is not any more, which reads differently from never having tried. */
	| { state: 'lost' };

function initial(): WatchStatus {
	const can = support();
	return can.usable ? { state: 'idle' } : { state: 'unsupported', reason: can.reason };
}

export const watchStatus = writable<WatchStatus>(initial());

let connection: Connection | null = null;
let link: WatchLink | null = null;
let onOpen: ((index: number) => void) | null = null;
let onArrows: ((total: number, at: number) => void) | null = null;

/** The live link, for a page that wants to put a round or a session on the wrist. */
export function watchLink(): WatchLink | null {
	return link;
}

/** What to do when the watch asks for an activity. Only the app knows how to get there. */
export function onWatchOpen(handler: ((index: number) => void) | null): void {
	onOpen = handler;
}

/** What to do when the watch asserts the session's training arrows. */
export function onWatchArrows(handler: ((total: number, at: number) => void) | null): void {
	onArrows = handler;
}

function handle(event: LinkEvent, name: string): void {
	switch (event.kind) {
		case 'greeted':
			watchStatus.set({ state: 'connected', name, fragile: !canReconnectSilently() });
			return;
		case 'stale':
			watchStatus.set({ state: 'stale', name });
			return;
		case 'farewell':
			watchStatus.set({ state: 'lost' });
			return;
		case 'open':
			onOpen?.(event.index);
			return;
		case 'arrows':
			onArrows?.(event.total, event.at);
			return;
		default:
			// Applied, refused, noise and a version mismatch are not states of the link itself.
			return;
	}
}

/**
 * Asks for a watch. Must be called straight from a click: the chooser needs a real gesture and
 * refuses one that arrives out of a promise chain.
 */
export async function connectWatch(): Promise<void> {
	const can = support();
	if (!can.usable) {
		watchStatus.set({ state: 'unsupported', reason: can.reason });
		return;
	}
	// A link that never answered has to go before another can be made, or this does nothing at all.
	if (connection && link?.live) return;
	if (connection) disconnectWatch();

	watchStatus.set({ state: 'connecting' });
	const result = await connectOverWeb(
		(bytes) => void link?.receive(bytes),
		() => {
			connection = null;
			link = null;
			watchStatus.set({ state: 'lost' });
		}
	);

	if (!result.ok) {
		watchStatus.set({ state: 'failed', reason: result.reason });
		return;
	}

	connection = result.connection;
	const name = result.connection.name;
	link = new WatchLink(result.connection.channel, deviceId(), (event) => handle(event, name));
	// Said before anything else, and the status stays at connecting until the watch answers it.
	await link.open();
}

export function disconnectWatch(): void {
	void link?.close();
	connection?.disconnect();
	connection = null;
	link = null;
	onOpen = null;
	onArrows = null;
	watchStatus.set(initial());
}
