import { Capacitor } from '@capacitor/core';
import { Wrist, type WristClaim } from '$lib/watch/ble.native';
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

/** Where the run is now, and what is left of it, so the service can carry on from exactly here. */
export async function handDown(
	frame: RunFrame,
	steps: RunStep[],
	live: RunLive | null
): Promise<void> {
	if (!native()) return;
	if (frame.status === 'd' || !live) {
		await Wrist.forget().catch(() => undefined);
		return;
	}
	const at = steps.findIndex((step) => step.key === live.stepKey);
	await Wrist.plan({
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

/** What the service reached while the page was frozen, or null where there was no service to ask. */
export async function takeBack(): Promise<WristClaim | null> {
	if (!native()) return null;
	return Wrist.claim().catch(() => null);
}
