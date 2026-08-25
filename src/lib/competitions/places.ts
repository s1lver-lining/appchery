import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { placeKey, type Point } from './distance';

/**
 * Turning the town a competition names into a point on the map.
 *
 * Neither source publishes coordinates: ianseo prints a town, the FFTA prints a town and a postcode.
 * They are looked up through Open-Meteo, which needs no key and no account, the same service the
 * app already asks for the weather, and every answer is kept for good because towns do not move.
 *
 * Nothing here is asked for unless the archer has turned a distance filter on. Only a town name
 * leaves the device, never their own position.
 */

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

export type Located = { key: string; point: Point | null };

export type Town = {
	/** What the source prints, such as `Crispiano` or `ALLUYES`. */
	name: string;
	/** The country as it is named in English, used to pick between towns of the same name. */
	country?: string | null;
	/** A postcode where the source has one, which settles a name two towns share. */
	postcode?: string | null;
};

export function keyOf(town: Town): string {
	return placeKey([town.postcode ?? null, town.name, town.country ?? null]);
}

/** What the device already knows, asked as one query rather than one per town. */
export async function knownPlaces(keys: string[]): Promise<Map<string, Point | null>> {
	const found = new Map<string, Point | null>();
	if (keys.length === 0) return found;

	for (let index = 0; index < keys.length; index += 200) {
		const rows = await db()
			.select()
			.from(schema.competitionPlace)
			.where(inArray(schema.competitionPlace.key, keys.slice(index, index + 200)));
		for (const row of rows) {
			found.set(
				row.key,
				row.found && row.latitude !== null && row.longitude !== null
					? { latitude: row.latitude, longitude: row.longitude }
					: null
			);
		}
	}
	return found;
}

async function remember(key: string, point: Point | null): Promise<void> {
	const row = {
		key,
		latitude: point?.latitude ?? null,
		longitude: point?.longitude ?? null,
		found: point ? 1 : 0,
		cachedAt: Date.now()
	};
	await db()
		.insert(schema.competitionPlace)
		.values(row)
		.onConflictDoUpdate({ target: schema.competitionPlace.key, set: row });
}

/**
 * One town, looked up and kept. A town that cannot be found is kept as not found: asking again on
 * every refresh would be a request a second for an answer that is not going to change.
 */
export async function locate(town: Town): Promise<Located> {
	const key = keyOf(town);
	const known = await knownPlaces([key]);
	if (known.has(key)) return { key, point: known.get(key) ?? null };

	const point = await ask(town);
	await remember(key, point);
	return { key, point };
}

async function ask(town: Town): Promise<Point | null> {
	const query = new URLSearchParams({
		name: town.name.trim(),
		count: '5',
		language: 'en',
		format: 'json'
	});
	let results: { latitude: number; longitude: number; country?: string; postcodes?: string[] }[];
	try {
		const response = await fetch(`${ENDPOINT}?${query}`);
		if (!response.ok) return null;
		results = (await response.json())?.results ?? [];
	} catch {
		// Offline, which is the normal case at a range. Nothing is remembered, so it is asked again later.
		throw new PlaceUnavailable();
	}
	return pick(results, town);
}

/** Thrown rather than remembered: a town nobody could ask about is not a town that does not exist. */
export class PlaceUnavailable extends Error {}

/**
 * A postcode settles it where there is one, then the country, and a bare name only where the source
 * did not say which country it meant. Two towns share a name often enough to matter, and a point in
 * the wrong country would put a competition hundreds of kilometres from where it is: no answer is
 * better than a wrong one, so a name that matches nothing in the right country is left unknown.
 */
export function pick<T extends { country?: string; postcodes?: string[]; latitude: number; longitude: number }>(
	results: T[],
	town: Town
): Point | null {
	if (results.length === 0) return null;
	const wanted = town.country?.trim().toLowerCase();
	const post = town.postcode?.trim();

	const byPost = post ? results.find((one) => one.postcodes?.includes(post)) : undefined;
	const byCountry = wanted
		? results.find((one) => (one.country ?? '').toLowerCase() === wanted)
		: undefined;
	const chosen = byPost ?? byCountry ?? (wanted ? undefined : results[0]);
	if (!chosen) return null;
	return { latitude: chosen.latitude, longitude: chosen.longitude };
}

/** Everything remembered about where towns are, dropped. The competitions themselves are untouched. */
export async function forgetPlaces(): Promise<void> {
	await db().delete(schema.competitionPlace);
}

export async function forgetPlace(key: string): Promise<void> {
	await db().delete(schema.competitionPlace).where(eq(schema.competitionPlace.key, key));
}
