import { writable } from 'svelte/store';
import { canReconnectSilently, support } from './ble';
import { connect as connectOverWeb, type ConnectFailure, type Connection } from './ble.web';
import type { Channel } from './link';

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
	| { state: 'failed'; reason: ConnectFailure }
	/** It was connected and is not any more, which reads differently from never having tried. */
	| { state: 'lost' };

function initial(): WatchStatus {
	const can = support();
	return can.usable ? { state: 'idle' } : { state: 'unsupported', reason: can.reason };
}

export const watchStatus = writable<WatchStatus>(initial());

let connection: Connection | null = null;
let listener: ((bytes: DataView) => void) | null = null;

/**
 * Where arriving bytes go. The scoring screen puts a session here when a round is open; until then
 * they are dropped, because nothing can be written to a record that has not been chosen yet.
 */
export function listenToWatch(handler: ((bytes: DataView) => void) | null): void {
	listener = handler;
}

/** Writing to the watch, or nothing when there is no link to write to. */
export function watchChannel(): Channel | null {
	return connection?.channel ?? null;
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
	if (connection) return;

	watchStatus.set({ state: 'connecting' });
	const result = await connectOverWeb(
		(bytes) => listener?.(bytes),
		() => {
			connection = null;
			watchStatus.set({ state: 'lost' });
		}
	);

	if (!result.ok) {
		watchStatus.set({ state: 'failed', reason: result.reason });
		return;
	}

	connection = result.connection;
	watchStatus.set({
		state: 'connected',
		name: result.connection.name,
		// Worth warning about once: a link that drops cannot come back without another tap.
		fragile: !canReconnectSilently()
	});
}

export function disconnectWatch(): void {
	connection?.disconnect();
	connection = null;
	listener = null;
	watchStatus.set(initial());
}
