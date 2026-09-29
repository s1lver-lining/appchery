import { BleClient } from '@capacitor-community/bluetooth-le';
import { registerPlugin } from '@capacitor/core';
import { WATCH_SERVICE, support, type ConnectFailure, type ConnectResult } from './ble';

/**
 * The link over the app's own central, for the installed app. The sibling of ble.web.ts and the
 * same shape: it hands bytes up, takes bytes down, and says why it could not connect.
 *
 * What it buys over the browser is the whole reason it exists. Chrome on Android has no
 * `getDevices`, so a permitted watch cannot be picked up again without the chooser and every
 * connection costs the archer a tap at the shooting line. A native central connects straight to a
 * remembered address, so the app asks once and never again. See doc/llm-memory/watch-native-transport.md.
 *
 * The connection itself is the app's own, in `Wrist.java`, rather than the Bluetooth plugin's. A
 * plugin is only ever called by a page, and Android freezes a page the moment the screen goes off,
 * which is how a run is run: the wrist sat on figures minutes old while the Bluetooth stack was
 * perfectly healthy and nobody was telling it to write. Owned by the app, the same link can be fed
 * by the service while the page sleeps. The plugin is still what finds a watch in the first place,
 * which is a chooser and a scan and belongs to nobody's run.
 */

interface WristPlugin {
	connect(options: { address: string }): Promise<{ connected: boolean }>;
	disconnect(): Promise<void>;
	send(options: { text: string }): Promise<void>;
	/** The run as the page has it, for the service to carry on from. See RunFrames.java. */
	plan(plan: Record<string, unknown>): Promise<void>;
	/** The page is done with its run; `id` so another activity's page cannot clear a run still going. */
	forget(options?: { id?: string | null }): Promise<void>;
	claim(): Promise<WristClaim>;
	/** Recorded motion the native side received and kept, see WristMotion.java. */
	motion(): Promise<{ items: NativeMotion[] }>;
	forgetMotion(options: { keys: number[] }): Promise<void>;
	/**
	 * Durable assertions the native side kept while the page was frozen, for the page to apply again,
	 * see WristInbox.java. No forget: an entry clears when the page acks it, watched for natively.
	 */
	inbox(): Promise<{ items: Record<string, unknown>[] }>;
	/** The beats the wrist reported since the page last asked, oldest first, see RunFrames.heard. */
	beats(): Promise<{ items: { b: number; at: number }[] }>;
	/** Where the native run is, without draining anything, see RunFrames.status. */
	runStatus(): Promise<WristRunStatus>;
	addListener(
		event: 'bytes',
		handler: (data: { text: string }) => void
	): Promise<{ remove: () => Promise<void> }>;
	/** `run`: a control from the wrist changed the run natively, for the page to adopt. */
	addListener(
		event: 'lost' | 'restarted' | 'run',
		handler: () => void
	): Promise<{ remove: () => Promise<void> }>;
}

/** The native run at a glance, for a page starting afresh. */
export interface WristRunStatus {
	st: 'i' | 'r' | 'p' | 'd';
	live: boolean;
	rev: number;
	/** The activity the run belongs to, as the page last described it, or null. */
	id: string | null;
}

/**
 * What the native side did with the run since the page last adopted: while the page was asleep,
 * and also while it was awake, since every control from the wrist is taken there now.
 */
export interface WristClaim {
	live: boolean;
	/** The revision this is, which the page's next plan carries so the native side takes it. */
	rev: number;
	/** The activity the run belongs to, as the page last described it, or null. */
	id: string | null;
	/** When the wrist started the run, on this phone's clock, where it did. */
	sw?: number;
	/** Laps taken on the wrist since the page last adopted, as the run's clock and distance at each. */
	laps?: { s: number; d: number }[];
	/** Where the run is now: it may have been paused or finished from the wrist in the meantime. */
	st: 'i' | 'r' | 'p' | 'd';
	/** The run's clock as the service has it, in seconds. */
	s: number;
	/** The step it reached, by position in the flattened programme, or -1. */
	i: number;
	/** Whether the programme ran out while the page was asleep and the run carried on without it. */
	free?: boolean;
	c: number;
	fs: number;
	fd: number;
	done: { i: number; d: number; s: number }[];
	/** The beats the wrist reported while the page was frozen, each with when it was taken. */
	hr?: { b: number; at: number }[];
}

/** A segment header as the watch sent it, with the data it described in base64. */
export interface NativeMotion {
	k: number;
	a: string;
	s: number;
	n: number;
	st: number;
	du: number;
	tb?: number;
	ta?: number;
	by?: 'archer' | 'watch';
	o?: number;
	sh?: 1;
	data: string;
}

export const Wrist = registerPlugin<WristPlugin>('Wrist');

export interface ConnectOptions {
	/**
	 * A watch this phone has opened before. Given one, this never shows a chooser: it either reaches
	 * that watch or reports `not-found`, and the caller decides whether asking the archer is
	 * appropriate. A silent attempt at app start must not throw a dialog at somebody who only opened
	 * the app to look at last week's scores.
	 */
	deviceId?: string | null;
	/** The watch app restarted while the link stayed up, so it has to be told everything again. */
	onRestarted?: () => void;
	/** A control from the wrist changed the run natively, for whichever page holds it to adopt. */
	onRunChanged?: () => void;
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

	// Subscribed before the connection rather than after: the first thing the watch says is its
	// answer to the phone's hello, and it says it as soon as the descriptor is written.
	const incoming = await Wrist.addListener('bytes', ({ text }) => {
		onBytes(viewOf(new TextEncoder().encode(text)));
	});
	const gone = await Wrist.addListener('lost', () => {
		if (!closing) onLost();
	});
	const restarted = await Wrist.addListener('restarted', () => {
		if (!closing) options.onRestarted?.();
	});
	const changed = await Wrist.addListener('run', () => {
		if (!closing) options.onRunChanged?.();
	});

	try {
		await Wrist.connect({ address: id });
	} catch (error) {
		await quietly(() => incoming.remove());
		await quietly(() => gone.remove());
		await quietly(() => restarted.remove());
		await quietly(() => changed.remove());
		// A remembered watch out of range, off, or simply left at home: ordinary, and not a fault the
		// archer can act on beyond bringing the watch closer.
		const reason = failureOf(error, remembered ? 'not-found' : 'failed');
		return { ok: false, reason, detail: messageOf(error) };
	}

	return {
		ok: true,
		connection: {
			name,
			id,
			channel: {
				/**
				 * Without response: a message is asserted whole and asserted again if it never lands,
				 * so waiting for the watch to confirm each write buys a round trip and nothing else.
				 * The queue is in `Wrist.java`, because the stack carries one write at a time.
				 */
				send: async (bytes) => {
					await Wrist.send({ text: new TextDecoder().decode(bytes) });
				}
			},
			disconnect: () => {
				closing = true;
				void quietly(() => incoming.remove());
				void quietly(() => gone.remove());
				void quietly(() => restarted.remove());
				void quietly(() => changed.remove());
				// The link only: the run the native side holds is not the link's, see WristPlugin.disconnect.
				void quietly(() => Wrist.disconnect());
			}
		}
	};
}

/** The reasons `Wrist.java` rejects with, which are the card's own vocabulary already. */
function failureOf(error: unknown, fallback: ConnectFailure): ConnectFailure {
	const message = messageOf(error) ?? '';
	const known: ConnectFailure[] = ['no-service', 'no-permission', 'bluetooth-off', 'not-found'];
	return known.find((reason) => message.includes(reason)) ?? fallback;
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
