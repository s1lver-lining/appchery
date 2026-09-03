import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { IANSEO_ORIGIN, PROXY_PREFIX } from '$lib/competitions/proxy';

/**
 * ianseo publishes pages, not an interface, and it sends no header that would let a browser read
 * them from another origin. The phone has no such rule to obey, so it asks ianseo itself; the web
 * build asks the small proxy served alongside the app, which does nothing but pass the page through.
 *
 * Both arrive at the same HTML, which is the point: one set of parsers, and a page that breaks
 * breaks in one place rather than differently on each platform.
 */

export const IANSEO = IANSEO_ORIGIN;
export const PROXY = `${PROXY_PREFIX}/ianseo`;

export class IanseoError extends Error {
	constructor(
		/**
		 * `unreadable` is the one that is nobody's fault but ours: ianseo answered, and the app could
		 * not make sense of what it sent. It is worth its own word on screen, because a page that has
		 * been rearranged needs the app updating and no amount of waiting for a signal will help.
		 */
		readonly kind: 'offline' | 'unavailable' | 'missing' | 'unreadable',
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

/**
 * The same, for the one thing ianseo publishes that is not a page: the schedule, which it prints as
 * a PDF and never renders. Native HTTP hands bytes back as base64, having no other way to carry
 * them across the bridge.
 */
export async function fetchIanseoBytes(path: string, signal?: AbortSignal): Promise<Uint8Array> {
	if (!path.startsWith('/')) throw new IanseoError('missing', `not an ianseo path: ${path}`);

	if (Capacitor.isNativePlatform()) {
		let response;
		try {
			response = await CapacitorHttp.get({ url: `${IANSEO}${path}`, responseType: 'arraybuffer' });
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
		if (response.status === 404) throw new IanseoError('missing', path);
		if (response.status >= 400) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
		return fromBase64(String(response.data ?? ''));
	}

	let response: Response;
	try {
		response = await fetch(`${PROXY}${path}`, { signal });
	} catch (error) {
		throw new IanseoError('offline', String(error));
	}
	if (response.status === 404) throw new IanseoError('missing', path);
	if (!response.ok) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}

function fromBase64(data: string): Uint8Array {
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	return bytes;
}
