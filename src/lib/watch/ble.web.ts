/// <reference types="web-bluetooth" />

import { TO_PHONE, TO_WATCH, WATCH_SERVICE, support } from './ble';
import type { Channel } from './link';

/**
 * The link over Web Bluetooth, for the browser build. Nothing here knows what a message means: it
 * hands bytes up and takes bytes down, so the rules about whose arrows survive live in link.ts and
 * are tested without any of this.
 */

export interface Connection {
	channel: Channel;
	/** The watch's advertised name, for the settings card to show what it found. */
	name: string;
	disconnect(): void;
}

export type ConnectFailure =
	| 'unsupported'
	/** The chooser was dismissed, which is a decision rather than a fault. */
	| 'cancelled'
	| 'no-service'
	| 'failed';

export type ConnectResult =
	| { ok: true; connection: Connection }
	| { ok: false; reason: ConnectFailure; detail?: string };

/**
 * Asks for a watch and opens the link. The chooser needs a real gesture, so this may only be called
 * from a click: there is no `getDevices` in Chrome on Android, so a permitted watch cannot be picked
 * up again silently and every connection starts here.
 */
export async function connect(
	onBytes: (bytes: DataView) => void,
	onLost: () => void
): Promise<ConnectResult> {
	if (!support().usable) return { ok: false, reason: 'unsupported' };

	let device: BluetoothDevice;
	try {
		device = await navigator.bluetooth.requestDevice({ filters: [{ services: [WATCH_SERVICE] }] });
	} catch (error) {
		// A dismissed chooser and a browser without the API both land here, told apart by name.
		const name = error instanceof Error ? error.name : '';
		return { ok: false, reason: name === 'NotFoundError' ? 'cancelled' : 'failed' };
	}

	// One queue per connection: a second watch must not wait behind the first one's writes.
	let queue: Promise<void> = Promise.resolve();

	try {
		device.addEventListener('gattserverdisconnected', onLost, { once: true });
		const gatt = await device.gatt?.connect();
		if (!gatt) return { ok: false, reason: 'failed' };

		const service = await gatt.getPrimaryService(WATCH_SERVICE);
		const toPhone = await service.getCharacteristic(TO_PHONE);
		const toWatch = await service.getCharacteristic(TO_WATCH);

		toPhone.addEventListener('characteristicvaluechanged', (event: Event) => {
			const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
			if (value) onBytes(value);
		});
		await toPhone.startNotifications();

		return {
			ok: true,
			connection: {
				name: device.name ?? 'watch',
				channel: {
					/**
					 * Serialised, because two overlapping writes to one characteristic is a stack error
					 * rather than two messages, and the session sends the round and every end in a burst.
					 */
					send: (bytes) => (queue = queue.then(() => writeOnce(toWatch, bytes)))
				},
				disconnect: () => {
					device.removeEventListener('gattserverdisconnected', onLost);
					try {
						gatt.disconnect();
					} catch {
						// Already gone, which is the state being asked for.
					}
				}
			}
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : undefined;
		try {
			device.gatt?.disconnect();
		} catch {
			// Nothing to tidy.
		}
		const missing = error instanceof Error && error.name === 'NotFoundError';
		return { ok: false, reason: missing ? 'no-service' : 'failed', detail };
	}
}

/**
 * Without response where the browser has it: an end is asserted whole and asserted again if it never
 * lands, so waiting for the watch to confirm each write buys nothing and costs a round trip. Older
 * Chrome only has the acknowledged write, which is slower but correct.
 */
async function writeOnce(
	characteristic: BluetoothRemoteGATTCharacteristic,
	bytes: Uint8Array
): Promise<void> {
	const payload = bytes as unknown as BufferSource;
	if (typeof characteristic.writeValueWithoutResponse === 'function') {
		await characteristic.writeValueWithoutResponse(payload);
		return;
	}
	await characteristic.writeValue(payload);
}
