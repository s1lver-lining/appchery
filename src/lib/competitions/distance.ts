/** Where a competition is, and how far away that is. Pure: no network, no database, no browser. */

export type Point = { latitude: number; longitude: number };

const EARTH_KM = 6371;
const RADIAN = Math.PI / 180;

/**
 * Great circle distance in kilometres. A straight line rather than a road: an archer asking what is
 * within an hour of them is served better by an honest "50 km away" than by a route this app cannot
 * know, and the error a road adds is the same for every competition in the list.
 */
export function distanceKm(from: Point, to: Point): number {
	const dLat = (to.latitude - from.latitude) * RADIAN;
	const dLon = (to.longitude - from.longitude) * RADIAN;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(from.latitude * RADIAN) * Math.cos(to.latitude * RADIAN) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The distances a filter offers, in kilometres. Nothing finer: a town's coordinates are its centre. */
export const RADII = [25, 50, 100, 200, 500] as const;

export type Radius = (typeof RADII)[number];

/** Rounded the way a person says it: under ten, one decimal is worth having; over, it is noise. */
export function roundKm(km: number): number {
	return km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
}

/**
 * The key a town is remembered under, so the same town is never looked up twice however it is
 * spelled on the day: ianseo writes `Crispiano`, the FFTA writes `ALLUYES`, and a postcode is
 * better than either where there is one.
 */
export function placeKey(parts: (string | null | undefined)[]): string {
	return parts
		.filter((part): part is string => !!part && part.trim() !== '')
		.map((part) =>
			part
				.trim()
				.toLowerCase()
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/\s+/g, ' ')
		)
		.join('|');
}
