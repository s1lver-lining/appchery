import type { TrackedFix } from './track';

/**
 * What a heart rate means, which is nothing at all without the heart it belongs to.
 *
 * A hundred and sixty beats a minute is an easy afternoon for one runner and everything another one
 * has. What makes the figure worth showing is where it sits against that runner's own ceiling, so
 * nothing here works without a maximum, and the app asks for one rather than guessing it from an
 * age it does not know either.
 *
 * Five zones, at the shares of maximum everybody who writes about running uses. The names are what
 * the effort is for, not what it is called in any one system, because the systems disagree about
 * the names and agree about the shares.
 */

export const ZONES = [1, 2, 3, 4, 5] as const;
export type Zone = (typeof ZONES)[number];

/** The share of maximum each zone starts at. Below the first is not a zone, it is sitting down. */
export const ZONE_FLOOR: Record<Zone, number> = { 1: 0.5, 2: 0.6, 3: 0.7, 4: 0.8, 5: 0.9 };

/** Which zone a beat falls in, or null where there is no maximum to measure it against. */
export function zoneOf(bpm: number | null | undefined, max: number): Zone | null {
	if (!bpm || bpm <= 0 || !max || max <= 0) return null;
	const share = bpm / max;
	if (share < ZONE_FLOOR[1]) return null;
	for (const zone of [5, 4, 3, 2, 1] as Zone[]) {
		if (share >= ZONE_FLOOR[zone]) return zone;
	}
	return null;
}

/** The beats a zone covers, for saying what it is rather than only colouring it. */
export function zoneBand(zone: Zone, max: number): { from: number; to: number | null } {
	const from = Math.round(ZONE_FLOOR[zone] * max);
	return { from, to: zone === 5 ? null : Math.round(ZONE_FLOOR[(zone + 1) as Zone] * max) - 1 };
}

/**
 * How long the run spent in each zone, out of the beats written on its fixes.
 *
 * Counted against the run's own clock rather than the world's, so the time spent held at a crossing
 * belongs to nobody's zone. A stretch between two fixes is credited to the zone the first of them
 * was in, which is the one the runner was actually in while covering it.
 */
export function timeInZones(fixes: TrackedFix[], max: number): Record<Zone, number> {
	const held: Record<Zone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	if (!max || max <= 0) return held;
	for (let i = 1; i < fixes.length; i++) {
		const zone = zoneOf(fixes[i - 1].heartRate, max);
		if (zone === null) continue;
		const ran = fixes[i].elapsedSeconds - fixes[i - 1].elapsedSeconds;
		if (ran <= 0) continue;
		held[zone] += ran;
	}
	return held;
}
