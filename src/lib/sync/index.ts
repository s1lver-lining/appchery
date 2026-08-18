import { get, writable } from 'svelte/store';
import { supabase } from './client';
import { account } from './auth';
import { push, pendingCount, failedCount, retryFailed } from './push';
import { pull } from './pull';
import { readSyncState } from './config';
import { refreshSyncAlert } from './alert';

// One exchange: push, then pull, see doc/sync.md § 5. Failures are silent and left for the next
// trigger, because offline at a range is the normal case rather than something to interrupt over.

export type SyncPhase = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
	phase: SyncPhase;
	/** Local changes not yet accepted by the server. */
	pending: number;
	/** Changes it refused often enough that the app stopped asking. */
	failed: number;
	lastSyncAt: number | null;
	/** Kept for the settings screen; never shown as an interruption. */
	error: string | null;
}

export const syncStatus = writable<SyncStatus>({
	phase: 'idle',
	pending: 0,
	failed: 0,
	lastSyncAt: null,
	error: null
});

let inFlight: Promise<void> | null = null;
let queued: Promise<void> | null = null;
let lastAttempt = 0;
let failures = 0;

/** Automatic triggers are frequent and cheap to fire: switching apps twice a minute is not two syncs. */
const QUIET = 60_000;
const BACKOFF = 30_000;
const LONGEST_BACKOFF = 15 * 60_000;

/** Reads the local database only, so the card is right about the state before anything is tried. */
export async function refreshSyncStatus(phase: SyncPhase = 'idle', error: string | null = null): Promise<void> {
	const state = await readSyncState();
	syncStatus.set({
		phase,
		pending: await pendingCount(),
		failed: await failedCount(),
		lastSyncAt: state.lastSyncAt,
		error
	});
	await refreshSyncAlert();
}

/**
 * Guarded, so two triggers firing together wait on one exchange rather than uploading twice.
 *
 * An automatic trigger also waits its turn: resume and reconnect fire far more often than there is
 * anything to say, and a run of failures backs off rather than retrying at the same rate. The button
 * an archer presses is never held back, because they are owed an answer.
 */
export function syncNow(trigger: 'manual' | 'automatic' = 'manual'): Promise<void> {
	if (trigger === 'automatic' && Date.now() < nextAllowed()) return Promise.resolve();

	// A press that lands while an exchange is already running waits for it and then has its own.
	// Answering with the run in progress would look right and do nothing: it read the queue before
	// the press, so the refused changes the button is there to retry would stay refused. One queued
	// run serves every press, because pressing three times is still asking once.
	if (trigger === 'manual' && inFlight) {
		queued ??= inFlight.then(() => {
			queued = null;
			return syncNow('manual');
		});
		return queued;
	}

	inFlight ??= run(trigger).finally(() => {
		inFlight = null;
	});
	return inFlight;
}

function nextAllowed(): number {
	const wait = failures === 0 ? QUIET : Math.min(BACKOFF * 2 ** (failures - 1), LONGEST_BACKOFF);
	return lastAttempt + wait;
}

async function run(trigger: 'manual' | 'automatic'): Promise<void> {
	const user = get(account);
	if (!user) return;

	lastAttempt = Date.now();

	// The archer's own button is the second chance: pressing it says try the refused ones again, and
	// there is no other concept to meet. Failures start over with it, so the backoff does too.
	if (trigger === 'manual') {
		await retryFailed();
		failures = 0;
	}

	// Nothing to say to an unreachable server, but a pressed button is owed an answer.
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return refreshSyncStatus('error', 'offline');
	}

	const client = await supabase();
	if (!client) return;

	syncStatus.update((current) => ({ ...current, phase: 'syncing', error: null }));

	// An exchange belongs to the account that began it: push claims ownerless rows for whoever it was
	// handed, so carrying on through a sign out files the next archer's shooting under the last one's.
	const stillOurs = () => get(account)?.id === user.id;

	try {
		await push(client, user.id);
		if (!stillOurs()) return refreshSyncStatus();

		await pull(client, user.id);
		if (!stillOurs()) return refreshSyncStatus();

		// Both follow the record they describe, and neither may break the exchange: a badge count an
		// hour out of date costs nothing, a failed sync costs the shooting.
		const { refreshSocial } = await import('./social');
		const { publishCard } = await import('./card');
		await refreshSocial().catch(() => {});
		await publishCard().catch(() => {});
		await refreshSyncStatus();
		failures = 0;
	} catch (error) {
		failures += 1;
		await refreshSyncStatus('error', error instanceof Error ? error.message : String(error));
	}
}
