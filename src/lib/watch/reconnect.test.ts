import { get, writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reopening the link nobody asked to reopen. What matters is that it only ever happens where it can
 * happen silently, that a phone left alone does not hunt for a watch all afternoon, and that a watch
 * which comes back is told what the phone is showing rather than being left on the idle screen.
 */

/**
 * Never emptied between tests: the store subscribes to the app coming back once for the life of the
 * process, so clearing this would leave later tests looking for a handler nothing will register
 * again. They are all the same handler anyway.
 */
const listeners: ((state: { isActive: boolean }) => void)[] = [];
vi.mock('@capacitor/app', () => ({
	App: {
		addListener: vi.fn(async (_event: string, handler: (state: { isActive: boolean }) => void) => {
			listeners.push(handler);
			return { remove: async () => {} };
		})
	}
}));

let platform = 'android';
let native = true;
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => native, getPlatform: () => platform }
}));

vi.mock('$lib/db/repository', () => ({ deviceId: () => 'phone-1' }));

const connectNative = vi.fn();
vi.mock('./ble.native', () => ({ connect: connectNative }));
const connectWeb = vi.fn();
vi.mock('./ble.web', () => ({ connect: connectWeb }));

/**
 * The preference that holds the remembered watch, as a plain value. The real one writes itself to
 * local storage as it changes and applies half a dozen display settings to the document besides,
 * none of which exists here and none of which this file is about.
 */
const rememberedWatch = writable<string | null>(null);
vi.mock('$lib/prefs', () => ({ rememberedWatch }));

// `support()` looks for a window before it looks at anything else, and vitest runs in node.
vi.stubGlobal('window', { isSecureContext: true });

const { connectWatch, disconnectWatch, onWatchLinked, onWatchOpen, resumeWatch, watchStatus } =
	await import('./store');
const { decode, encode } = await import('./protocol');
type Wire = import('./protocol').Wire;

/** A link that comes up but whose watch never answers the hello, so nothing is adopted as live. */
function silentWatch() {
	return {
		ok: true as const,
		connection: {
			name: 'Watch 5',
			id: 'AA:BB',
			channel: { send: async () => {} },
			disconnect: () => {}
		}
	};
}

beforeEach(() => {
	// The store holds one link for the whole app, so each test starts from nothing held.
	disconnectWatch();
	vi.useFakeTimers();
	connectNative.mockReset();
	connectWeb.mockReset();
	native = true;
	platform = 'android';
	rememberedWatch.set('AA:BB');
});

describe('reopening a remembered link', () => {
	it('does nothing at all when no watch has ever been connected', async () => {
		rememberedWatch.set(null);

		await resumeWatch();

		expect(connectNative).not.toHaveBeenCalled();
	});

	it('never reopens a link in a browser, where only a tap can', async () => {
		native = false;
		platform = 'web';

		await resumeWatch();

		expect(connectNative).not.toHaveBeenCalled();
		expect(connectWeb).not.toHaveBeenCalled();
	});

	it('asks for the remembered watch by id, so no chooser can appear', async () => {
		connectNative.mockResolvedValue({ ok: false, reason: 'not-found' });

		await resumeWatch();

		expect(connectNative).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
			deviceId: 'AA:BB'
		});
	});

	it('leaves the card idle rather than failed when the watch is not there', async () => {
		connectNative.mockResolvedValue({ ok: false, reason: 'not-found' });

		await resumeWatch();

		expect(get(watchStatus)).toEqual({ state: 'idle' });
	});

	it('backs off rather than hunting for a watch that is not coming', async () => {
		connectNative.mockResolvedValue({ ok: false, reason: 'not-found' });
		await resumeWatch();
		expect(connectNative).toHaveBeenCalledTimes(1);

		// Ten seconds for the first retry, then twenty, then forty: three tries in the first minute
		// and ten, not six a minute for as long as the app is open.
		await advance(10_000);
		expect(connectNative).toHaveBeenCalledTimes(2);
		await advance(10_000);
		expect(connectNative).toHaveBeenCalledTimes(2);
		await advance(10_000);
		expect(connectNative).toHaveBeenCalledTimes(3);
	});

	it('tries again the moment the app comes back to the screen', async () => {
		connectNative.mockResolvedValue({ ok: false, reason: 'not-found' });
		await resumeWatch();
		// Subscribing is itself a promise, so it has landed a tick after the attempt that armed it.
		await vi.advanceTimersByTimeAsync(0);
		expect(listeners).not.toHaveLength(0);

		connectNative.mockClear();
		for (const listener of listeners) listener({ isActive: true });
		await vi.advanceTimersByTimeAsync(0);

		expect(connectNative).toHaveBeenCalledTimes(1);
	});

	it('ignores the app leaving the screen, which is nobody asking for anything', async () => {
		connectNative.mockResolvedValue({ ok: false, reason: 'not-found' });
		await resumeWatch();

		connectNative.mockClear();
		for (const listener of listeners) listener({ isActive: false });
		await vi.advanceTimersByTimeAsync(0);

		expect(connectNative).not.toHaveBeenCalled();
	});

	it('stops trying once the link is up', async () => {
		connectNative.mockResolvedValue(silentWatch());

		await resumeWatch();
		connectNative.mockClear();
		await advance(600_000);

		expect(connectNative).not.toHaveBeenCalled();
	});
});

// Timers and a promise chain per tick, so each due attempt is let through to its `await`.
async function advance(ms: number): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
	await vi.advanceTimersByTimeAsync(0);
}

describe('telling a watch what the phone is showing', () => {
	/**
	 * A live link whose watch answers every hello, as a real one does: the heartbeat says hello
	 * every fifteen seconds and is answered every time. That is the trap this guards. A page
	 * described again on each of those re-sends the round, which rebuilds the keypad on the wrist
	 * and takes the end being shot with it.
	 */
	async function linked() {
		const sent: Wire[] = [];
		connectNative.mockImplementation(async (onBytes: (bytes: DataView) => void) => {
			answer = () => onBytes(asView(encode({ v: 1, t: 'hello', d: 'watch', c: Date.now() })));
			return {
				ok: true,
				connection: {
					name: 'Watch 5',
					id: 'AA:BB',
					channel: {
						send: async (bytes: Uint8Array) => {
							const decoded = decode(bytes);
							if (decoded.ok) sent.push(decoded.message);
						}
					},
					disconnect: () => {}
				}
			};
		});
		await resumeWatch();
		return sent;
	}

	let answer: () => void;

	it('describes the page once per link, however often the watch is greeted', async () => {
		let described = 0;
		onWatchLinked(() => void described++);

		await linked();
		// The hello the link sends on opening, answered.
		answer();
		await vi.advanceTimersByTimeAsync(0);
		expect(described).toBe(1);

		// Four heartbeats, every one of them answered, as happens for as long as the app is open.
		for (let beat = 0; beat < 4; beat++) {
			answer();
			await vi.advanceTimersByTimeAsync(0);
		}
		expect(described).toBe(1);
	});

	it('describes it again when a later link is made', async () => {
		let described = 0;
		onWatchLinked(() => void described++);

		await linked();
		answer();
		await vi.advanceTimersByTimeAsync(0);

		// The watch walks out of range and comes back, which is a new link and a new instance: it
		// knows nothing about the round, and nothing below the store will tell it.
		disconnectWatch();
		onWatchLinked(() => void described++);
		rememberedWatch.set('AA:BB');
		await linked();
		answer();
		await vi.advanceTimersByTimeAsync(0);

		expect(described).toBe(2);
	});
});


describe('what a page has asked to be told about', () => {
	/**
	 * The handlers belong to the page that registered them, not to the link. A page mounts once and
	 * registers once; a link can go down and come back several times underneath it, and the archer
	 * pressing "Try again" is one of those. Clearing them left a watch whose taps reached a phone
	 * that had stopped listening for them, with nothing to say so on either screen.
	 */
	it('still hears the watch after the link is made again', async () => {
		let deliver: (bytes: DataView) => void = () => {};
		connectNative.mockImplementation(async (onBytes: (bytes: DataView) => void) => {
			deliver = onBytes;
			return {
				ok: true,
				connection: {
					name: 'Watch 5',
					id: 'AA:BB',
					channel: { send: async () => {} },
					disconnect: () => {}
				}
			};
		});

		await resumeWatch();
		let opened: number | null = null;
		onWatchOpen((index) => void (opened = index));

		// What the settings card's "Try again" does to a link that is up but never answered.
		await connectWatch();
		await vi.advanceTimersByTimeAsync(0);

		// The watch taps an activity on the link that now exists.
		deliver(asView(encode({ v: 1, t: 'open', i: 2 })));
		await vi.advanceTimersByTimeAsync(0);

		expect(opened).toBe(2);
		onWatchOpen(null);
	});

	it('forgets the watch when the archer says they are done with it', async () => {
		rememberedWatch.set('AA:BB');

		disconnectWatch();

		expect(get(rememberedWatch)).toBeNull();
	});
});

/** The encoder hands back a window onto a larger buffer; the link is given a view, as a radio would. */
function asView(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
