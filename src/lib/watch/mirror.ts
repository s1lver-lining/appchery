import { knownScoreSet } from '$lib/domain/rounds/seed';
import { missZone, scorableZones } from '$lib/domain/rounds/geometry';
import type { RoundDefinition } from '$lib/domain/rounds/types';
import { recordFor } from './record';
import {
	watchLink,
	onWatchApplied,
	onWatchBack,
	onWatchLinked,
	onWatchOpen,
	onWatchArrows,
	onWatchCommand
} from './store';
import type { ActivityLine, Round, RunFrame } from './link';
import type { RunCommand } from './protocol';

/**
 * Putting what the phone is showing onto the wrist. This is the only place that knows both the app's
 * state and the link, so pages call it and stay ignorant of Bluetooth.
 *
 * Everything here is a no-op when no watch is linked, on purpose: a page should not have to ask
 * whether a watch exists before describing what it is showing.
 */

/**
 * How long idle waits before it is sent. Leaving one mirrored page for another unmounts the first
 * before the second mounts, and idle sent in between reads on the wrist as a flash of nothing.
 */
const IDLE_DELAY_MS = 250;
/** What the watch was last told about the session, so it is not told it again for nothing. */
let lastSession: string | null = null;
/**
 * How to say the current page again. A page describes itself when it mounts and not afterwards, so
 * a link made or remade later would leave the watch idle on a phone that is plainly on a round,
 * until the archer navigated somewhere and back. This is what a watch is told the moment it starts
 * listening, whether that is the first link of the day or one the app reopened by itself.
 */
let describeAgain: (() => Promise<void>) | null = null;

function remember(describe: () => Promise<void>): void {
	describeAgain = describe;
	onWatchLinked(() => void describeAgain?.());
}
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function cancelIdle(): void {
	if (idleTimer !== null) clearTimeout(idleTimer);
	idleTimer = null;
}

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

/** What the watch can put arrows into: a scored round whose score set this build still knows. */
export function isScorable(activity: ActivityLike): boolean {
	if (activity.kind !== 'scoring') return false;
	const round = roundOf(activity);
	return Boolean(round && knownScoreSet(round.scoreSetId));
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
	// Remembered before the link is looked for: a page that describes itself while nothing is
	// connected is exactly the page a watch connecting a moment later needs to be told about.
	remember(async () => {
		// The fingerprint is what stops a page repeating itself; a fresh watch has heard none of it.
		lastSession = null;
		await mirrorSession(label, activities, arrows, open);
	});

	const link = watchLink();
	if (!link) return;
	cancelIdle();

	/**
	 * Every kind is listed so the session reads the same on both screens, except the training
	 * activity: it is the arrow counter, which the watch already shows as the figure at the top.
	 */
	const shown = activities.filter((activity) => activity.kind !== 'training');

	/**
	 * Skipped when it would say exactly what was said last time. The page describes itself whenever
	 * anything about it changes, and a reload reassigns the session and its activities separately, so
	 * one change arrives as two describings a few milliseconds apart. Sending both rebuilds the list
	 * on the wrist, losing where it was scrolled, and lets an older count land after a newer one.
	 */
	const fingerprint = JSON.stringify([label, arrows, shown.map(lineFor)]);
	if (fingerprint === lastSession) return;
	lastSession = fingerprint;
	link.clearRound();
	onWatchOpen((index) => {
		const chosen = shown[index];
		// An index from a list the watch was sent before the session changed under it.
		if (chosen) open(chosen);
	});
	await link.showSession(label, shown.map(lineFor), arrows);
}

/** The scoring activity the phone has open, so the keypad matches what is being shot. */
export async function mirrorRound(activity: ActivityLike): Promise<void> {
	remember(() => mirrorRound(activity));

	const link = watchLink();
	if (!link) return;
	cancelIdle();

	const definition = roundOf(activity);
	const scoreSet = knownScoreSet(definition?.scoreSetId);
	if (!definition || !scoreSet) {
		// Nothing the watch could score correctly, so it is told the truth rather than a guess.
		await link.showIdle();
		return;
	}

	const round: Round = {
		activityId: activity.id,
		/**
		 * Keypad order, from the app's own helper rather than a second definition: `scorableZones`
		 * already reverses the score set, which runs outermost to innermost so hit testing can walk
		 * it backwards. The miss goes last because it is not a score, which is also why the phone's
		 * keypad keeps it apart from the numbers.
		 */
		zones: [...scorableZones(scoreSet), missZone(scoreSet)],
		stages: definition.stages.map((stage) => ({
			ends: stage.ends,
			arrowsPerEnd: stage.arrowsPerEnd
		}))
	};
	onWatchOpen(null);
	lastSession = null;
	await link.setRound(round, recordFor(round));
}

/**
 * A run as it stands, put on the wrist. Sent on a tick rather than described once, because a run is
 * a screen that changes every second, and the frame is small enough to be the whole of it: nothing
 * is worked out on the watch.
 */
export async function mirrorRun(frame: RunFrame): Promise<void> {
	// A run is the phone's own screen while it lasts, so a watch linking mid run is told about it.
	remember(() => mirrorRun(frame));

	const link = watchLink();
	if (!link) return;
	cancelIdle();
	lastSession = null;
	onWatchOpen(null);
	await link.showRun(frame);
}

/** Out of the run: the wrist goes back to the session the phone is showing behind it. */
export function endMirroredRun(): void {
	watchLink()?.clearRun();
	onWatchCommand(null);
	describeAgain = null;
	onWatchLinked(null);
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
	// Nothing worth saying again: a watch that links while the phone is here should be idle too.
	describeAgain = null;
	onWatchLinked(null);

	const link = watchLink();
	if (!link) return;
	cancelIdle();
	lastSession = null;
	idleTimer = setTimeout(() => {
		idleTimer = null;
		link.clearRound();
		onWatchOpen(null);
		onWatchArrows(null);
		onWatchBack(null);
		void link.showIdle();
	}, IDLE_DELAY_MS);
}

/** What to do when the watch asserts the session's training arrows. */
export function acceptArrows(handler: ((total: number, at: number) => void) | null): void {
	onWatchArrows(handler);
}

/** What the run buttons on the wrist do. The watch asks; the phone is what runs a run. */
export function acceptRunCommands(handler: ((command: RunCommand) => void) | null): void {
	onWatchCommand(handler);
}

/** Where back goes from this page. The watch asks; only the phone knows what is behind it. */
export function acceptBack(handler: (() => void) | null): void {
	onWatchBack(handler);
}

/** What to do once an arrow from the watch has reached the record, so the page can read it back. */
export function acceptApplied(handler: (() => void) | null): void {
	onWatchApplied(handler);
}
