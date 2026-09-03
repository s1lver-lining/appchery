import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { IANSEO_ORIGIN, PAGE_TAG, PROXY_PREFIX } from '$lib/competitions/proxy';

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

/**
 * How long a page is waited for before the app gives up on it and says so.
 *
 * A phone at a shooting range holds a signal it cannot use: the request is accepted and then never
 * answered, and without a deadline the screen waits on it for as long as the app is open. Reading
 * ianseo again costs a second, so waiting a third of a minute buys nothing a retry would not.
 */
const TIMEOUT_MS = 12_000;

/**
 * The caller's own signal, if it gave one, with the deadline added. `AbortSignal.any` is not
 * everywhere yet and this runs inside whatever webview the phone ships with, so it is done by hand.
 */
function deadline(signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error('timeout')), TIMEOUT_MS);
	const passOn = () => controller.abort(signal?.reason);
	signal?.addEventListener('abort', passOn);
	if (signal?.aborted) passOn();
	return {
		signal: controller.signal,
		done: () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', passOn);
		}
	};
}

/**
 * What a read came back with, or that it did not have to: `unchanged` is ianseo, or the proxy in
 * front of it, saying the page is still the one the app already holds. Answered in a couple of
 * hundred bytes rather than a couple of hundred kilobytes, which at a field is the whole point.
 */
export type Fetched<T> =
	| { unchanged: true }
	| { unchanged: false; body: T; tag: string | null };

/** What the app holds for this page, offered so the answer can be that it is still current. */
export type Asked = { signal?: AbortSignal; tag?: string | null };

/** Headers come back cased however the platform felt like casing them. */
function headerOf(headers: Record<string, string> | undefined, name: string): string | null {
	const found = Object.entries(headers ?? {}).find(
		([key]) => key.toLowerCase() === name.toLowerCase()
	);
	return found?.[1] ?? null;
}

/** Whichever of the two reached us: a host that compresses the page drops the ETag off it. */
const tagIn = (headers: Headers) => headers.get('ETag') ?? headers.get(PAGE_TAG);
const nativeTagIn = (headers: Record<string, string> | undefined) =>
	headerOf(headers, 'ETag') ?? headerOf(headers, PAGE_TAG);

const asking = (tag?: string | null): Record<string, string> =>
	tag ? { 'If-None-Match': tag } : {};

/** `path` is ianseo's own, such as `/TourList.php` or `/TourData/2026/26053/IQRM.php`. */
export async function fetchIanseo(path: string, asked: Asked = {}): Promise<Fetched<string>> {
	const { signal, tag } = asked;
	if (!path.startsWith('/')) throw new IanseoError('missing', `not an ianseo path: ${path}`);

	if (Capacitor.isNativePlatform()) {
		let response;
		try {
			response = await CapacitorHttp.get({
				url: `${IANSEO}${path}`,
				responseType: 'text',
				headers: asking(tag),
				connectTimeout: TIMEOUT_MS,
				readTimeout: TIMEOUT_MS
			});
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
		if (response.status === 304) return { unchanged: true };
		if (response.status === 404) throw new IanseoError('missing', path);
		if (response.status >= 400) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
		return {
			unchanged: false,
			body: String(response.data ?? ''),
			tag: nativeTagIn(response.headers)
		};
	}

	// The deadline covers reading the body too: a page whose headers arrive and whose rows never do
	// is the same wait as one that never answered at all.
	const waiting = deadline(signal);
	try {
		let response: Response;
		try {
			response = await fetch(`${PROXY}${path}`, {
				signal: waiting.signal,
				headers: asking(tag)
			});
		} catch (error) {
			// A proxy that is not there, a phone with no signal and one that answers nothing all read
			// the same on screen, and all three are fixed by the same thing: asking again in a moment.
			throw new IanseoError('offline', String(error));
		}
		if (response.status === 304) return { unchanged: true };
		if (response.status === 404) throw new IanseoError('missing', path);
		if (!response.ok) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
		try {
			return {
				unchanged: false,
				body: await response.text(),
				tag: tagIn(response.headers)
			};
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
	} finally {
		waiting.done();
	}
}

/**
 * The same, for the one thing ianseo publishes that is not a page: the schedule, which it prints as
 * a PDF and never renders. Native HTTP hands bytes back as base64, having no other way to carry
 * them across the bridge.
 */
export async function fetchIanseoBytes(path: string, asked: Asked = {}): Promise<Fetched<Uint8Array>> {
	const { signal, tag } = asked;
	if (!path.startsWith('/')) throw new IanseoError('missing', `not an ianseo path: ${path}`);

	if (Capacitor.isNativePlatform()) {
		let response;
		try {
			response = await CapacitorHttp.get({
				url: `${IANSEO}${path}`,
				responseType: 'arraybuffer',
				headers: asking(tag),
				connectTimeout: TIMEOUT_MS,
				readTimeout: TIMEOUT_MS
			});
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
		if (response.status === 304) return { unchanged: true };
		if (response.status === 404) throw new IanseoError('missing', path);
		if (response.status >= 400) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
		return {
			unchanged: false,
			body: fromBase64(String(response.data ?? '')),
			tag: nativeTagIn(response.headers)
		};
	}

	const waiting = deadline(signal);
	try {
		let response: Response;
		try {
			response = await fetch(`${PROXY}${path}`, {
				signal: waiting.signal,
				headers: asking(tag)
			});
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
		if (response.status === 304) return { unchanged: true };
		if (response.status === 404) throw new IanseoError('missing', path);
		if (!response.ok) throw new IanseoError('unavailable', `ianseo answered ${response.status}`);
		try {
			return {
				unchanged: false,
				body: new Uint8Array(await response.arrayBuffer()),
				tag: tagIn(response.headers)
			};
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
	} finally {
		waiting.done();
	}
}

function fromBase64(data: string): Uint8Array {
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	return bytes;
}
