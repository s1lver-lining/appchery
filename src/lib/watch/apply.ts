import type { Zone } from '$lib/domain/rounds/types';
import { isEmpty, keepIncoming, type EndState } from './protocol';

/**
 * What to do with an end the watch has asserted, decided without touching the database so the rule
 * that decides whose arrows survive can be tested without a device.
 *
 * The phone derives every value from its own score set rather than believing a number off the wire.
 * The watch sends labels, which are the archer's intent, and what a label is worth is rules data
 * that only one side should own. A watch on an older build with a stale score set can then be wrong
 * about a score without being able to write a wrong score.
 */

export interface PlannedShot {
	ordinal: number;
	value: number;
	zoneLabel: string;
}

export type EndPlan =
	/** Nothing to do, with the reason kept so the caller can answer the watch properly. */
	| { kind: 'reject'; reason: 'older' | 'unknown-label' | 'gap' | 'too-many' }
	/** The last arrow was taken back and nothing is left: the end goes, rather than lingering empty. */
	| { kind: 'delete' }
	| { kind: 'write'; subtotal: number; shots: PlannedShot[] };

export function planEnd(
	local: EndState | null,
	incoming: EndState,
	zones: Map<string, Zone>,
	arrowsPerEnd: number
): EndPlan {
	if (incoming.labels.length > arrowsPerEnd) return { kind: 'reject', reason: 'too-many' };

	/**
	 * Arrows fill an end from the first, so a hole in the middle is not a shorter end, it is a
	 * message that cannot be true. Rejecting it keeps `ordinal` meaning position in the end.
	 */
	const shotCount = countLeading(incoming.labels);
	if (shotCount === null) return { kind: 'reject', reason: 'gap' };

	// Whoever typed last meant it, which is decided before any work is done on the contents.
	if (!keepIncoming(local, incoming)) return { kind: 'reject', reason: 'older' };

	if (isEmpty(incoming.labels)) return { kind: 'delete' };

	const shots: PlannedShot[] = [];
	let subtotal = 0;
	for (let i = 0; i < shotCount; i++) {
		const label = incoming.labels[i] as string;
		const zone = zones.get(label);
		// A label this round has no zone for is a watch out of step with the phone, never a score.
		if (!zone) return { kind: 'reject', reason: 'unknown-label' };
		shots.push({ ordinal: i + 1, value: zone.value, zoneLabel: zone.label });
		subtotal += zone.value;
	}

	return { kind: 'write', subtotal, shots };
}

/** How many arrows an end holds, or null when a null sits before a label rather than after them. */
function countLeading(labels: (string | null)[]): number | null {
	let count = 0;
	while (count < labels.length && labels[count] !== null) count++;
	for (let i = count; i < labels.length; i++) {
		if (labels[i] !== null) return null;
	}
	return count;
}

/** The label to zone map a plan needs, built from the score set the activity is being shot on. */
export function zoneIndex(zones: Zone[]): Map<string, Zone> {
	const index = new Map<string, Zone>();
	// Innermost last, so an X that shares its label with nothing still wins its own entry.
	for (const zone of zones) index.set(zone.label, zone);
	return index;
}

/** The end as the phone currently holds it, for comparing against what the watch believes. */
export function localEnd(
	stageIndex: number,
	endNo: number,
	shots: { ordinal: number; zoneLabel: string }[],
	arrowsPerEnd: number,
	updatedAt: number,
	deviceId: string
): EndState {
	const labels: (string | null)[] = new Array(arrowsPerEnd).fill(null);
	for (const shot of shots) {
		if (shot.ordinal >= 1 && shot.ordinal <= arrowsPerEnd) labels[shot.ordinal - 1] = shot.zoneLabel;
	}
	return { stageIndex, endNo, labels, updatedAt, deviceId };
}
