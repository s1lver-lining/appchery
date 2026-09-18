import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Which transport this device gets, and whether it can promise to reopen a link on its own. Both
 * answers drive what the settings card says, and both are easy to get wrong from a user agent.
 */

let platform = 'web';
let native = false;
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => native, getPlatform: () => platform }
}));

const { canReconnectSilently, support } = await import('./ble');

type Fake = { isSecureContext?: boolean };

function browser(window: Fake, bluetooth: object | null): void {
	native = false;
	platform = 'web';
	// Node has a real `navigator` behind a getter, so it is stubbed rather than assigned.
	vi.stubGlobal('window', window);
	vi.stubGlobal('navigator', bluetooth ? { bluetooth } : {});
}

afterEach(() => {
	native = false;
	platform = 'web';
	vi.unstubAllGlobals();
});

describe('what this device can do', () => {
	it('takes the native central in the installed Android app, whatever the webview thinks', () => {
		browser({ isSecureContext: false }, null);
		native = true;
		platform = 'android';

		expect(support()).toEqual({ usable: true, path: 'native' });
		// The whole point of the native path: the watch is opened again without asking.
		expect(canReconnectSilently()).toBe(true);
	});

	it('has nothing for an iPhone, which no Wear OS watch pairs to', () => {
		browser({ isSecureContext: true }, {});
		native = true;
		platform = 'ios';

		expect(support()).toEqual({ usable: false, reason: 'no-wear' });
		expect(canReconnectSilently()).toBe(false);
	});

	it('says a LAN address is the problem rather than the browser', () => {
		browser({ isSecureContext: false }, {});

		expect(support()).toEqual({ usable: false, reason: 'insecure' });
	});

	it('has no answer for a browser without the API at all', () => {
		browser({ isSecureContext: true }, null);

		expect(support()).toEqual({ usable: false, reason: 'no-api' });
	});

	it('warns that a link made in Chrome on Android cannot be reopened by itself', () => {
		browser({ isSecureContext: true }, {});

		expect(support()).toEqual({ usable: true, path: 'web-bluetooth' });
		expect(canReconnectSilently()).toBe(false);
	});

	it('is quiet about it where the browser does have getDevices', () => {
		browser({ isSecureContext: true }, { getDevices: () => [] });

		expect(canReconnectSilently()).toBe(true);
	});
});
