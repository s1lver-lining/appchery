import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { IANSEO_ORIGIN, PROXY_PREFIX } from './proxy';

/**
 * ianseo publishes pages, not an interface, and it sends no header that would let a browser read
 * them from another origin. The phone has no such rule to obey, so it asks ianseo itself; the web
 * build asks the small proxy served alongside the app, which does nothing but pass the page through.
 *
 * Both arrive at the same HTML, which is the point: one set of parsers, and a page that breaks
 * breaks in one place rather than differently on each platform.
 */

export const IANSEO = IANSEO_ORIGIN;
export const PROXY = PROXY_PREFIX;

export class IanseoError extends Error {
	constructor(
		readonly kind: 'offline' | 'unavailable' | 'missing',
		message: string
	) {
		super(message);
		this.name = 'IanseoError';
	}
}

/** `path` is ianseo's own, such as `/TourList.php` or `/TourData/2026/26053/IQRM.php`. */
export async function fetchIanseo(path: string, signal?: AbortSignal): Promise<string> {
	if (!path.startsWith('/')) throw new IanseoError('missing', `not an ianseo path: ${path}`);

	if (Capacitor.isNativePlatform()) {
		let response;
		try {
			response = await CapacitorHttp.get({ url: `${IANSEO}${path}`, responseType: 'text' });
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
		if (response.status === 404) throw new IanseoError('missing', path);
		if (response.status >= 400) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
		return String(response.data ?? '');
	}

	let response: Response;
	try {
		response = await fetch(`${PROXY}${path}`, { signal });
	} catch (error) {
		// A proxy that is not there and a phone with no signal fail the same way, and read the same.
		throw new IanseoError('offline', String(error));
	}
	if (response.status === 404) throw new IanseoError('missing', path);
	if (!response.ok) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
	return await response.text();
}
