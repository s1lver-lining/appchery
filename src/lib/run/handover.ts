import { Capacitor } from '@capacitor/core';
import { Wrist, type WristClaim, type WristRunStatus } from '$lib/watch/ble.native';
import type { RunFrame } from '$lib/watch/link';
import type { RunStep } from '$lib/domain/run/workout';
import type { RunLive } from '$lib/domain/running';
import { get } from 'svelte/store';
import { maxHeartRate } from '$lib/prefs';

/**
 * Handing the run to the service and taking back what it did.
 *
 * Android freezes a backgrounded webview, so the page that works a run out stops the moment the
 * screen goes off, which is how a run is actually run. The service carries on: it has the fixes
 * already, and with the programme and an anchor it can keep the wrist fed and move the run through
 * its blocks. This is the whole of the conversation between the two, and there is nothing to it on
 * any platform that has no service, see doc/llm-memory/running.md.
 */

const native = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Wrist');

/**
 * Where the run is now, and what is left of it, so the service can carry on from exactly here.
 *
 * `rev` is the native revision this page last adopted, see {@link takeBack}: a plan from before the
 * page adopted a change made from the wrist is refused natively, or it would undo it. -1 where the
 * page never learnt one, which the native side takes as it always did.
 */
export async function handDown(
	frame: RunFrame,
	steps: RunStep[],
	live: RunLive | null,
	rev = -1,
	activityId: string | null = null
): Promise<void> {
	if (!native()) return;
	if (frame.status === 'd' || !live) {
		await Wrist.forget().catch(() => undefined);
		return;
	}
	const at = steps.findIndex((step) => step.key === live.stepKey);
	await Wrist.plan({
		rv: rev,
		id: activityId,
		st: frame.status,
		c: frame.cue,
		s: frame.seconds,
		d: frame.distanceM,
		i: at,
		// Which of the two a missing step is: one that was never started, or a programme that ran out.
		fx: frame.freeSeconds !== null,
		fs: live.stepFrom.seconds,
		fd: live.stepFrom.distanceM,
		ps: frame.planned?.seconds ?? -1,
		pd: frame.planned?.metres ?? -1,
		pp: frame.planned?.pace ?? 0,
		// The runner's maximum, so the service can say which zone a beat is in while the page sleeps.
		hm: get(maxHeartRate) || 0,
		steps: steps.map((step) => ({
			k: step.kind,
			l: step.label ?? '',
			g: step.goal.type === 'time' ? 't' : step.goal.type === 'distance' ? 'd' : 'o',
			v: step.goal.type === 'time' ? step.goal.seconds : step.goal.type === 'distance' ? step.goal.metres : 0,
			p: step.targetPace ?? 0,
			r: step.repeat,
			ro: step.repeatOf
		}))
	}).catch(() => undefined);
}

/**
 * What the native side did with the run since this page last adopted, or null where there is no
 * native side to ask. Drains: the beats and laps in it are handed over once.
 */
export async function takeBack(): Promise<WristClaim | null> {
	if (!native()) return null;
	return Wrist.claim().catch(() => null);
}

/**
 * The beats the wrist reported since the page last asked. The native side keeps every one with when
 * it came, whatever the page is doing, and this is the only way they reach the page in the installed
 * app, so none is counted twice or dated by when a frozen page happened to thaw. Empty in a browser,
 * where the beats arrive through the link instead.
 */
export async function takeBeats(): Promise<{ b: number; at: number }[]> {
	if (!native()) return [];
	const taken = await Wrist.beats().catch(() => null);
	return taken?.items ?? [];
}

/** The native run at a glance, without draining anything, or null where there is none to ask. */
export async function nativeRun(): Promise<WristRunStatus | null> {
	if (!native()) return null;
	return Wrist.runStatus().catch(() => null);
}

/** Whether beats and run controls go through the native side, rather than through the link. */
export function nativeRuns(): boolean {
	return native();
}
