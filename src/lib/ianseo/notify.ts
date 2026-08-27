import { get } from 'svelte/store';
import { t } from '$lib/i18n';
import { favourites, isNew } from './store';
import { readWatchState, writeWatchState, type WatchState } from './watch';
import type { Watch } from './announce';

/**
 * Being told about a result while the app is shut, with no server behind it.
 *
 * The browser wakes the service worker on its own schedule and the worker asks ianseo the question
 * the app asks whenever it opens. Nothing is sent from anywhere: there is no account, no push
 * service and nothing to pay for, and the cost of that is a phone saving power deciding not to wake
 * up at all. That is a fair trade for a feature nobody is obliged to turn on.
 */

const TAG = 'ianseo-results';
/** An hour is the floor a browser is asked for. What it actually does is its own business. */
const INTERVAL_MS = 3600_000;

export function canBeTold(): boolean {
	return (
		typeof window !== 'undefined' &&
		'Notification' in window &&
		'serviceWorker' in navigator &&
		'showNotification' in ServiceWorkerRegistration.prototype
	);
}

/** Whether the browser can wake itself up, as opposed to only being able to show a notification. */
export async function canWakeItself(): Promise<boolean> {
	if (!canBeTold()) return false;
	const registration = await navigator.serviceWorker.ready.catch(() => null);
	return Boolean(registration && 'periodicSync' in registration);
}

export async function tellingIsOn(): Promise<boolean> {
	return (await readWatchState()).enabled;
}

/**
 * The competitions followed, with what the archer has already been told about or seen for
 * themselves, so turning this on can never announce something that is already on the badge.
 */
async function watched(): Promise<Watch[]> {
	const followed = (await favourites()).filter((one) => one.kind === 'competition' && one.toId);
	return followed.map((one) => ({
		toId: one.toId!,
		label: one.label,
		// Something already marked new stays marked rather than being announced a second time.
		announcedAt: isNew(one) ? one.publishedAt : Math.max(one.publishedAt ?? 0, one.seenAt ?? 0)
	}));
}

function words(): WatchState['words'] {
	const say = get(t);
	return {
		one: say('ianseo.toldOne'),
		body: say('ianseo.toldBody'),
		many: say('ianseo.toldMany', { n: '{n}' }),
		manyBody: say('ianseo.toldManyBody', { names: '{names}' })
	};
}

/**
 * The note the worker reads, written again. Called whenever what is followed changes, because the
 * worker has no way of asking the database what the archer follows now.
 */
export async function noteWhatIsFollowed(): Promise<void> {
	const state = await readWatchState();
	if (!state.enabled) return;
	await writeWatchState({ ...state, watches: await watched(), words: words() });
}

/** Returns whether it is on afterwards, which is not the same as whether it was asked for. */
export async function startTelling(): Promise<boolean> {
	if (!canBeTold()) return false;

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return false;

	await writeWatchState({ enabled: true, watches: await watched(), words: words() });

	const registration = await navigator.serviceWorker.ready.catch(() => null);
	const periodic = (registration as unknown as { periodicSync?: PeriodicSync })?.periodicSync;
	try {
		await periodic?.register(TAG, { minInterval: INTERVAL_MS });
	} catch {
		// Chrome refuses this until it decides the app is used enough to deserve it. The switch stays
		// on regardless: what it promises is being told when the browser gets round to it.
	}
	return true;
}

export async function stopTelling(): Promise<void> {
	const state = await readWatchState();
	await writeWatchState({ ...state, enabled: false, watches: [] });

	const registration = await navigator.serviceWorker.ready.catch(() => null);
	const periodic = (registration as unknown as { periodicSync?: PeriodicSync })?.periodicSync;
	await periodic?.unregister(TAG).catch(() => {});
}

type PeriodicSync = {
	register: (tag: string, options: { minInterval: number }) => Promise<void>;
	unregister: (tag: string) => Promise<void>;
};
