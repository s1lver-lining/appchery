import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The native transport, against a plugin that is not there. What is worth testing is everything the
 * transport decides for itself: that a remembered watch never reaches a chooser, that a refusal is
 * reported as the thing the archer can act on, and that bytes travel both ways.
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

vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: plugin }));

let platform = 'android';
let native = true;
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => native, getPlatform: () => platform }
}));

const { connect } = await import('./ble.native');
const { TO_PHONE, TO_WATCH, WATCH_SERVICE } = await import('./ble');

const noop = () => {};

beforeEach(() => {
	platform = 'android';
	native = true;
	for (const fn of Object.values(plugin)) fn.mockClear();
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
		expect(plugin.connect).toHaveBeenCalledWith('CC:DD', expect.any(Function), expect.anything());
	});

	it('asks for a watch when none is remembered, and says which one it found', async () => {
		const result = await connect(noop, noop);

		expect(plugin.requestDevice).toHaveBeenCalledWith({ services: [WATCH_SERVICE] });
		if (!result.ok) throw new Error('expected a link');
		expect(result.connection.id).toBe('AA:BB');
		expect(result.connection.name).toBe('Watch 5');
	});

	it('calls a remembered watch that does not answer missing rather than broken', async () => {
		plugin.connect.mockRejectedValueOnce(new Error('Connection failed with timeout.'));

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
		expect(plugin.connect).not.toHaveBeenCalled();
	});

	it('is a dismissed chooser, not an error, when the archer backs out', async () => {
		plugin.requestDevice.mockRejectedValueOnce(new Error('requestDevice cancelled.'));

		const result = await connect(noop, noop);

		expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
	});

	it('hangs up on a device that has no watch app on it', async () => {
		plugin.startNotifications.mockRejectedValueOnce(new Error('Service not found'));

		const result = await connect(noop, noop);

		expect(result).toMatchObject({ ok: false, reason: 'no-service' });
		expect(plugin.disconnect).toHaveBeenCalledWith('AA:BB');
	});

	it('hands arriving bytes up and sends only the message, not the buffer behind it', async () => {
		const arrived: DataView[] = [];
		const result = await connect((bytes) => arrived.push(bytes), noop);
		if (!result.ok) throw new Error('expected a link');

		const [, service, characteristic, deliver] = plugin.startNotifications.mock.calls[0]!;
		expect(service).toBe(WATCH_SERVICE);
		expect(characteristic).toBe(TO_PHONE);
		const incoming = new DataView(new Uint8Array([7]).buffer);
		deliver(incoming);
		expect(arrived).toEqual([incoming]);

		// A window onto a larger buffer, which is what the encoder hands over.
		const whole = new Uint8Array([1, 2, 3, 4]);
		await result.connection.channel.send(whole.subarray(1, 3));
		const [id, outService, outCharacteristic, value] = plugin.writeWithoutResponse.mock.calls[0]!;
		expect([id, outService, outCharacteristic]).toEqual(['AA:BB', WATCH_SERVICE, TO_WATCH]);
		expect([value.byteOffset, value.byteLength]).toEqual([1, 2]);
	});

	it('does not call a link lost when it is the one putting it down', async () => {
		const lost = vi.fn();
		const result = await connect(noop, lost);
		if (!result.ok) throw new Error('expected a link');

		const onDisconnect = plugin.connect.mock.calls[0]![1]!;
		result.connection.disconnect();
		onDisconnect('AA:BB');

		expect(lost).not.toHaveBeenCalled();
		expect(plugin.disconnect).toHaveBeenCalledWith('AA:BB');
	});

	it('reports a watch dropping off as lost', async () => {
		const lost = vi.fn();
		await connect(noop, lost);

		plugin.connect.mock.calls[0]![1]!('AA:BB');

		expect(lost).toHaveBeenCalledOnce();
	});

	it('refuses to touch the plugin on an iPhone, where no Wear OS watch can be', async () => {
		platform = 'ios';

		const result = await connect(noop, noop, { deviceId: 'CC:DD' });

		expect(result).toMatchObject({ ok: false, reason: 'unsupported' });
		expect(plugin.initialize).not.toHaveBeenCalled();
	});
});
