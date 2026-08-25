import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { INSCRIPTARC_ORIGIN, PROXY_PREFIX } from '$lib/competitions/proxy';
import { IanseoError } from '$lib/ianseo/fetch';
import { readCache, writeCache } from '$lib/ianseo/store';
import { parseEntries } from './parse';
import type { Entry } from './types';

/**
 * Everything open for entry in France, which the platform serves as one page of about thirty. Cheap
 * enough to read whole and keep, so there is nothing to page through and nothing to filter server
 * side: the app matches it against the competitions it is already showing.
 */

const PATH = '/competitions/resultats';
const CACHE = 'inscriptarc:entries';

/** Entry closes and opens by the day rather than by the minute, and the page is small either way. */
const TTL = 3 * 3600_000;

export async function loadEntries(refresh = false): Promise<Entry[]> {
	const cached = await readCache<Entry[]>(CACHE);
	if (cached && !refresh && Date.now() - cached.cachedAt < TTL) return cached.value;

	try {
		const entries = parseEntries(await read());
		await writeCache(CACHE, entries);
		return entries;
	} catch {
		// The way in is a convenience, never the page: an archer with no signal still gets the results.
		return cached?.value ?? [];
	}
}

async function read(): Promise<string> {
	if (Capacitor.isNativePlatform()) {
		const response = await CapacitorHttp.get({
			url: `${INSCRIPTARC_ORIGIN}${PATH}`,
			responseType: 'text'
		});
		if (response.status >= 400) throw new IanseoError('unavailable', String(response.status));
		return String(response.data ?? '');
	}

	const response = await fetch(`${PROXY_PREFIX}/inscriptarc${PATH}`);
	if (!response.ok) throw new IanseoError('unavailable', String(response.status));
	return await response.text();
}
