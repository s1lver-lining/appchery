import { BleClient } from '@capacitor-community/bluetooth-le';
import {
	TO_PHONE,
	TO_WATCH,
	WATCH_SERVICE,
	support,
	type ConnectFailure,
	type ConnectResult
} from './ble';

/**
 * The link over the platform's own central, for the installed app. The sibling of ble.web.ts and
 * the same shape: it hands bytes up, takes bytes down, and says why it could not connect.
 *
 * What it buys over the browser is the whole reason it exists. Chrome on Android has no
 * `getDevices`, so a permitted watch cannot be picked up again without the chooser and every
 * connection costs the archer a tap at the shooting line. A native central connects straight to a
 * remembered address, so the app asks once and never again. See doc/llm-memory/watch-native-transport.md.
 */

/** How long a connection attempt is given before it is called a failure rather than hanging. */
const CONNECT_TIMEOUT_MS = 10_000;

export interface ConnectOptions {
	/**
	 * A watch this phone has opened before. Given one, this never shows a chooser: it either reaches
	 * that watch or reports `not-found`, and the caller decides whether asking the archer is
	 * appropriate. A silent attempt at app start must not throw a dialog at somebody who only opened
	 * the app to look at last week's scores.
	 */
	deviceId?: string | null;
}

export async function connect(
	onBytes: (bytes: DataView) => void,
	onLost: () => void,
	options: ConnectOptions = {}
): Promise<ConnectResult> {
	const can = support();
	if (!can.usable || can.path !== 'native') return { ok: false, reason: 'unsupported' };

	try {
		// Asks for the runtime scan and connect permissions, and on Android 11 and older the location
		// permission that BLE scanning used to require. Declining any of them lands in the catch.
		await BleClient.initialize({ androidNeverForLocation: true });
	} catch (error) {
		return { ok: false, reason: 'no-permission', detail: messageOf(error) };
	}

	// Asked rather than inferred from a failed connection, which looks the same as a watch left at
	// home and would have the card tell the archer to go and find it.
	try {
		if (!(await BleClient.isEnabled())) return { ok: false, reason: 'bluetooth-off' };
	} catch (error) {
		return { ok: false, reason: 'bluetooth-off', detail: messageOf(error) };
	}

	const remembered = options.deviceId ?? null;
	let id: string;
	let name: string;
	if (remembered) {
		id = remembered;
		// Only for the label. Android connects by address whether or not the watch is advertising, so
		// a nameless answer here is no reason not to try.
		name = await nameOf(remembered);
	} else {
		try {
			const device = await BleClient.requestDevice({ services: [WATCH_SERVICE] });
			id = device.deviceId;
			name = device.name ?? 'watch';
		} catch (error) {
			return { ok: false, reason: chooserFailure(error), detail: messageOf(error) };
		}
	}

	/** Set before we disconnect on purpose, so a link being closed is not reported as one lost. */
	let closing = false;

	try {
		await BleClient.connect(
			id,
			() => {
				if (!closing) onLost();
			},
			{ timeout: CONNECT_TIMEOUT_MS }
		);
	} catch (error) {
		// A remembered watch out of range, off, or simply left at home: ordinary, and not a fault the
		// archer can act on beyond bringing the watch closer.
		return { ok: false, reason: remembered ? 'not-found' : 'failed', detail: messageOf(error) };
	}

	try {
		await BleClient.startNotifications(id, WATCH_SERVICE, TO_PHONE, onBytes);
	} catch (error) {
		closing = true;
		await quietly(() => BleClient.disconnect(id));
		// The address was remembered from a watch that had the service, so losing it means the watch
		// app is gone rather than that the archer picked the wrong device.
		return { ok: false, reason: 'no-service', detail: messageOf(error) };
	}

	return {
		ok: true,
		connection: {
			name,
			id,
			channel: {
				/**
				 * Without response: an end is asserted whole and asserted again if it never lands, so
				 * waiting for the watch to confirm each write buys nothing and costs a round trip. The
				 * plugin serialises its own calls, so two overlapping ends cannot collide the way they
				 * can in the browser.
				 */
				send: (bytes) =>
					BleClient.writeWithoutResponse(id, WATCH_SERVICE, TO_WATCH, viewOf(bytes))
			},
			disconnect: () => {
				closing = true;
				void quietly(() => BleClient.disconnect(id));
			}
		}
	};
}

/**
 * What a remembered watch is called. Nothing hangs on the answer, so a phone that has forgotten the
 * name still gets a link, labelled the way the card labels a watch that never gave one.
 */
async function nameOf(deviceId: string): Promise<string> {
	try {
		const [device] = await BleClient.getDevices([deviceId]);
		return device?.name ?? 'watch';
	} catch {
		return 'watch';
	}
}

/** A dismissed chooser is a decision rather than a fault, and the card should not call it an error. */
function chooserFailure(error: unknown): ConnectFailure {
	const message = messageOf(error) ?? '';
	if (message.includes('cancelled') || message.includes('canceled')) return 'cancelled';
	if (message.includes('No device found')) return 'not-found';
	if (message.includes('Permission')) return 'no-permission';
	return 'failed';
}

function messageOf(error: unknown): string | undefined {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const message = (error as { message?: unknown }).message;
		if (typeof message === 'string') return message;
	}
	return undefined;
}

/**
 * The plugin wants a DataView, and a Uint8Array from the encoder is usually a window onto a larger
 * buffer: handing over the whole buffer would send the bytes either side of the message too.
 */
function viewOf(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Tidying up after a failure, where the only thing a second failure could do is hide the first. */
async function quietly(run: () => Promise<unknown>): Promise<void> {
	try {
		await run();
	} catch {
		// Already gone, which is the state being asked for.
	}
}
