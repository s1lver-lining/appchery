import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The native transport, against plugins that are not there. What is worth testing is everything the
 * transport decides for itself: that a remembered watch never reaches a chooser, that a refusal is
 * reported as the thing the archer can act on, and that bytes travel both ways.
 *
 * Two plugins stand in for two jobs, as they do on a phone: the Bluetooth one finds a watch, and the
 * app's own central holds the link, because a link the page owns stops the moment Android freezes
 * the page. See doc/llm-memory/watch-native-transport.md.
 */

const plugin = {
	initialize: vi.fn(async () => {}),
	isEnabled: vi.fn(async () => true),
	requestDevice: vi.fn(async () => ({ deviceId: 'AA:BB', name: 'Watch 5' })),
	getDevices: vi.fn(async () => [{ deviceId: 'AA:BB', name: 'Watch 5' }]),
	connect: vi.fn(
		async (_id: string, _onDisconnect?: (id: string) => void, _options?: unknown) => {}
	),
	disconnect: vi.fn(async () => {}),
	startNotifications: vi.fn(
		async (
			_id: string,
			_service: string,
			_characteristic: string,
			_deliver: (value: DataView) => void
		) => {}
	),
	writeWithoutResponse: vi.fn(
		async (_id: string, _service: string, _characteristic: string, _value: DataView) => {}
	)
};

/** The app's own central, `Wrist.java`, which is what actually holds the link. */
const handlers: Record<string, (data: never) => void> = {};
const wrist = {
	connect: vi.fn(async (_options: { address: string }) => ({ connected: true })),
	disconnect: vi.fn(async () => {}),
	send: vi.fn(async (_options: { text: string }) => {}),
	plan: vi.fn(async () => {}),
	forget: vi.fn(async () => {}),
	claim: vi.fn(async () => ({ live: false, i: -1, c: 0, fs: 0, fd: 0, done: [] })),
	addListener: vi.fn(async (event: string, handler: (data: never) => void) => {
		handlers[event] = handler;
		return { remove: async () => delete handlers[event] };
	})
};

vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: plugin }));

let platform = 'android';
let native = true;
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => native, getPlatform: () => platform },
	registerPlugin: () => wrist
}));

const { connect } = await import('./ble.native');
const { WATCH_SERVICE } = await import('./ble');

const noop = () => {};

beforeEach(() => {
	platform = 'android';
	native = true;
	for (const fn of Object.values(plugin)) fn.mockClear();
	for (const fn of Object.values(wrist)) fn.mockClear();
	wrist.connect.mockResolvedValue({ connected: true });
	plugin.initialize.mockResolvedValue(undefined);
	plugin.isEnabled.mockResolvedValue(true);
	plugin.connect.mockResolvedValue(undefined);
	plugin.startNotifications.mockResolvedValue(undefined);
	plugin.requestDevice.mockResolvedValue({ deviceId: 'AA:BB', name: 'Watch 5' });
	// `window` is what support() looks for before anything else, and vitest runs in node.
	(globalThis as { window?: unknown }).window = {};
});

describe('the native link', () => {
	it('opens a remembered watch without ever showing the chooser', async () => {
		const result = await connect(noop, noop, { deviceId: 'CC:DD' });

		expect(result.ok).toBe(true);
		expect(plugin.requestDevice).not.toHaveBeenCalled();
		expect(wrist.connect).toHaveBeenCalledWith({ address: 'CC:DD' });
	});

	it('asks for a watch when none is remembered, and says which one it found', async () => {
		const result = await connect(noop, noop);

		expect(plugin.requestDevice).toHaveBeenCalledWith({ services: [WATCH_SERVICE] });
		if (!result.ok) throw new Error('expected a link');
		expect(result.connection.id).toBe('AA:BB');
		expect(result.connection.name).toBe('Watch 5');
	});

	it('calls a remembered watch that does not answer missing rather than broken', async () => {
		wrist.connect.mockRejectedValueOnce(new Error('not-found'));

		const result = await connect(noop, noop, { deviceId: 'CC:DD' });

		expect(result).toMatchObject({ ok: false, reason: 'not-found' });
	});

	it('reports a refused permission as a permission, not as a failure', async () => {
		plugin.initialize.mockRejectedValueOnce(new Error('Permission denied.'));

		const result = await connect(noop, noop);

		expect(result).toMatchObject({ ok: false, reason: 'no-permission' });
		expect(plugin.requestDevice).not.toHaveBeenCalled();
	});

	it('asks whether the adapter is on rather than letting it look like a missing watch', async () => {
		plugin.isEnabled.mockResolvedValueOnce(false);

		const result = await connect(noop, noop, { deviceId: 'CC:DD' });

		expect(result).toMatchObject({ ok: false, reason: 'bluetooth-off' });
		expect(wrist.connect).not.toHaveBeenCalled();
	});

	it('is a dismissed chooser, not an error, when the archer backs out', async () => {
		plugin.requestDevice.mockRejectedValueOnce(new Error('requestDevice cancelled.'));

		const result = await connect(noop, noop);

		expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
	});

	it('hangs up on a device that has no watch app on it', async () => {
		wrist.connect.mockRejectedValueOnce(new Error('no-service'));

		const result = await connect(noop, noop);

		expect(result).toMatchObject({ ok: false, reason: 'no-service' });
	});

	it('hands arriving bytes up and sends what it is given', async () => {
		const arrived: string[] = [];
		const result = await connect(
			(bytes) => arrived.push(new TextDecoder().decode(bytes)),
			noop
		);
		if (!result.ok) throw new Error('expected a link');

		(handlers.bytes as (data: { text: string }) => void)({ text: '{"t":"hello"}' });
		expect(arrived).toEqual(['{"t":"hello"}']);

		// A window onto a larger buffer, which is what the encoder hands over: only the message goes.
		const whole = new TextEncoder().encode('xx{"t":"ack"}xx');
		await result.connection.channel.send(whole.subarray(2, 13));
		expect(wrist.send).toHaveBeenCalledWith({ text: '{"t":"ack"}' });
	});

	it('does not call a link lost when it is the one putting it down', async () => {
		const lost = vi.fn();
		const result = await connect(noop, lost);
		if (!result.ok) throw new Error('expected a link');

		const dropped = handlers.lost as () => void;
		result.connection.disconnect();
		dropped();

		expect(lost).not.toHaveBeenCalled();
		expect(wrist.disconnect).toHaveBeenCalled();
	});

	it('reports a watch dropping off as lost', async () => {
		const lost = vi.fn();
		await connect(noop, lost);

		(handlers.lost as () => void)();

		expect(lost).toHaveBeenCalledOnce();
	});

	it('refuses to touch the plugin on an iPhone, where no Wear OS watch can be', async () => {
		platform = 'ios';

		const result = await connect(noop, noop, { deviceId: 'CC:DD' });

		expect(result).toMatchObject({ ok: false, reason: 'unsupported' });
		expect(plugin.initialize).not.toHaveBeenCalled();
	});
});
