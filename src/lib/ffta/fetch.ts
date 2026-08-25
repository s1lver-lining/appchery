import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { FFTA_ORIGIN, PROXY_PREFIX } from '$lib/competitions/proxy';
import { IanseoError } from '$lib/ianseo/fetch';

/**
 * The federation's pages, fetched the same two ways ianseo's are: the phone asks the FFTA itself,
 * and the browser asks the proxy served alongside the app, because the FFTA sends no header that
 * would let another origin read it.
 */

export const FFTA = FFTA_ORIGIN;
const PROXY = `${PROXY_PREFIX}/ffta`;

/**
 * The federation's site sits behind a filter that answers a bare request with a refusal, so the
 * phone says what it is. The proxy says the same on the browser's behalf.
 */
export const AGENT = 'Mozilla/5.0 (compatible; Appchery/1.0; +https://appchery.com)';

export async function fetchFfta(path: string, signal?: AbortSignal): Promise<string> {
	if (!path.startsWith('/')) throw new IanseoError('missing', `not an FFTA path: ${path}`);

	if (Capacitor.isNativePlatform()) {
		let response;
		try {
			response = await CapacitorHttp.get({
				url: `${FFTA}${path}`,
				headers: { 'User-Agent': AGENT },
				responseType: 'text'
			});
		} catch (error) {
			throw new IanseoError('offline', String(error));
		}
		if (response.status === 404) throw new IanseoError('missing', path);
		if (response.status >= 400) {
			throw new IanseoError('unavailable', `the FFTA answered ${response.status}`);
		}
		return String(response.data ?? '');
	}

	let response: Response;
	try {
		response = await fetch(`${PROXY}${path}`, { signal });
	} catch (error) {
		throw new IanseoError('offline', String(error));
	}
	if (response.status === 404) throw new IanseoError('missing', path);
	if (!response.ok) throw new IanseoError('unavailable', `the FFTA answered ${response.status}`);
	return await response.text();
}

/** The calendar, for a window of days and a set of départements, one page at a time. */
export function calendarPath(
	from: Date,
	to: Date,
	departements: string[],
	page = 0
): string {
	const query = new URLSearchParams({
		start: day(from),
		end: day(to),
		sort_by: 'start',
		sort_order: 'ASC'
	});
	for (const value of departements) query.append('dep[]', value);
	if (page > 0) query.set('page', String(page));
	return `/competitions?${query}`;
}

function day(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export const detailPath = (id: string) => `/epreuve/${id}`;
