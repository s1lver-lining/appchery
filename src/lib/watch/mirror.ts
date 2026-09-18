import { getScoreSet } from '$lib/domain/rounds/seed';
import type { RoundDefinition } from '$lib/domain/rounds/types';
import { recordFor } from './record';
import { watchLink, onWatchOpen, onWatchArrows } from './store';
import type { ActivityLine, Round } from './link';

/**
 * Putting what the phone is showing onto the wrist. This is the only place that knows both the app's
 * state and the link, so pages call it and stay ignorant of Bluetooth.
 *
 * Everything here is a no-op when no watch is linked, on purpose: a page should not have to ask
 * whether a watch exists before describing what it is showing.
 */

/** Only what the activity table and the round snapshot already say. */
export interface ActivityLike {
	id: string;
	kind: string;
	roundDefinition: string | null;
}

/** The round an activity was shot under, out of its own snapshot rather than today's definitions. */
export function roundOf(activity: ActivityLike): RoundDefinition | null {
	if (!activity.roundDefinition) return null;
	try {
		return JSON.parse(activity.roundDefinition) as RoundDefinition;
	} catch {
		// A snapshot that will not parse is a row from a future or broken build, never a round.
		return null;
	}
}

/** `getScoreSet` throws on an id it does not know, which is an answer rather than a failure here. */
function scoreSetOrNull(id: string | undefined) {
	if (!id) return null;
	try {
		return getScoreSet(id);
	} catch {
		return null;
	}
}

/** What the watch can put arrows into: a scored round whose score set this build still knows. */
export function isScorable(activity: ActivityLike): boolean {
	if (activity.kind !== 'scoring') return false;
	const round = roundOf(activity);
	return Boolean(round && scoreSetOrNull(round.scoreSetId));
}

function lineFor(activity: ActivityLike): ActivityLine {
	const round = roundOf(activity);
	return {
		kind: activity.kind,
		// A round names itself; everything else is named by what it is, which is all a wrist needs.
		label: round?.name ?? activity.kind,
		scorable: isScorable(activity)
	};
}

/**
 * The session the phone has open. The watch is handed the activities in this order and refers to
 * them by position afterwards, so the order given here is the only thing that ties the two together.
 */
export async function mirrorSession(
	label: string,
	activities: ActivityLike[],
	arrows: number,
	open: (activity: ActivityLike) => void
): Promise<void> {
	const link = watchLink();
	if (!link) return;

	/**
	 * Every kind is listed so the session reads the same on both screens, except the training
	 * activity: it is the arrow counter, which the watch already shows as the figure at the top.
	 */
	const shown = activities.filter((activity) => activity.kind !== 'training');
	link.clearRound();
	onWatchArrows(null);
	onWatchOpen((index) => {
		const chosen = shown[index];
		// An index from a list the watch was sent before the session changed under it.
		if (chosen) open(chosen);
	});
	await link.showSession(label, shown.map(lineFor), arrows);
}

/** The scoring activity the phone has open, so the keypad matches what is being shot. */
export async function mirrorRound(activity: ActivityLike): Promise<void> {
	const link = watchLink();
	if (!link) return;

	const definition = roundOf(activity);
	const scoreSet = scoreSetOrNull(definition?.scoreSetId);
	if (!definition || !scoreSet) {
		// Nothing the watch could score correctly, so it is told the truth rather than a guess.
		await link.showIdle();
		return;
	}

	const round: Round = {
		activityId: activity.id,
		zones: scoreSet.zones,
		stages: definition.stages.map((stage) => ({
			ends: stage.ends,
			arrowsPerEnd: stage.arrowsPerEnd
		}))
	};
	onWatchOpen(null);
	await link.setRound(round, recordFor(round));
}

/** One end the phone has just changed, so the wrist stops showing the old one. */
export async function mirrorEnd(stageIndex: number, endNo: number): Promise<void> {
	await watchLink()?.pushEnd(stageIndex, endNo);
}

/**
 * Every end again, for a change whose position is not to hand. Editing one arrow on the phone is a
 * deliberate and rare act, so a handful of messages costs less than threading the end's position
 * through every writer that can touch one.
 */
export async function mirrorEnds(): Promise<void> {
	await watchLink()?.pushAll();
}

/** The session's training arrows after the phone changed them. */
export async function mirrorArrows(total: number, updatedAt: number): Promise<void> {
	await watchLink()?.pushArrows(total, updatedAt);
}

/** Nothing worth showing: the phone is somewhere the watch has no business mirroring. */
export async function mirrorIdle(): Promise<void> {
	const link = watchLink();
	if (!link) return;
	link.clearRound();
	onWatchOpen(null);
	onWatchArrows(null);
	await link.showIdle();
}

/** What to do when the watch asserts the session's training arrows. */
export function acceptArrows(handler: ((total: number, at: number) => void) | null): void {
	onWatchArrows(handler);
}
