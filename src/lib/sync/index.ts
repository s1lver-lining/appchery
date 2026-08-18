import { get, writable } from 'svelte/store';
import { supabase } from './client';
import { account } from './auth';
import { push } from './push';
import { pull } from './pull';
import { readSyncState } from './config';
import { pendingCount } from './push';

// One exchange: push, then pull, see doc/sync.md § 5. Failures are silent and left for the next
// trigger, because offline at a range is the normal case rather than something to interrupt over.

export type SyncPhase = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
	phase: SyncPhase;
	/** Local changes not yet accepted by the server. */
	pending: number;
	lastSyncAt: number | null;
	/** Kept for the settings screen; never shown as an interruption. */
	error: string | null;
}

export const syncStatus = writable<SyncStatus>({
	phase: 'idle',
	pending: 0,
	lastSyncAt: null,
	error: null
});

let inFlight: Promise<void> | null = null;

/** Reads the local database only, so the card is right about the state before anything is tried. */
export async function refreshSyncStatus(): Promise<void> {
	const state = await readSyncState();
	const pending = await pendingCount();
	syncStatus.update((current) => ({ ...current, pending, lastSyncAt: state.lastSyncAt }));
}

/**
 * Guarded so two triggers firing together produce one exchange. The second caller waits for the
 * first rather than starting a second push, which would upload the same rows twice.
 */
export function syncNow(): Promise<void> {
	inFlight ??= run().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

async function run(): Promise<void> {
	const user = get(account);
	if (!user) return;

	// Nothing to say to an unreachable server, but a pressed button is owed an answer.
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		syncStatus.update((current) => ({ ...current, phase: 'error', error: 'offline' }));
		return;
	}

	const client = await supabase();
	if (!client) return;

	syncStatus.update((current) => ({ ...current, phase: 'syncing', error: null }));

	// An exchange belongs to the account that began it: push claims ownerless rows for whoever it was
	// handed, so carrying on through a sign out files the next archer's shooting under the last one's.
	const stillOurs = () => get(account)?.id === user.id;

	/** Abandoning an exchange has to leave the state readable, or the button stays disabled for good. */
	const stop = async () => {
		syncStatus.update((current) => ({ ...current, phase: 'idle' }));
		await refreshSyncStatus();
	};

	try {
		await push(client, user.id);
		if (!stillOurs()) return stop();

		await pull(client, user.id);
		if (!stillOurs()) return stop();

		// Both follow the record they describe, and neither may break the exchange: a badge count an
		// hour out of date costs nothing, a failed sync costs the shooting.
		const { refreshSocial } = await import('./social');
		await refreshSocial().catch(() => {});

		const { publishCard } = await import('./card');
		await publishCard().catch(() => {});
		const state = await readSyncState();
		syncStatus.set({
			phase: 'idle',
			pending: await pendingCount(),
			lastSyncAt: state.lastSyncAt,
			error: null
		});
	} catch (error) {
		syncStatus.update((current) => ({
			...current,
			phase: 'error',
			error: error instanceof Error ? error.message : String(error)
		}));
		await refreshSyncStatus();
	}
}
