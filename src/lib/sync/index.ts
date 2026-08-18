import { get, writable } from 'svelte/store';
import { supabase } from './client';
import { account } from './auth';
import { push } from './push';
import { pull } from './pull';
import { readSyncState } from './config';
import { pendingCount } from './push';

/**
 * One exchange with the server: push, then pull. See doc/sync.md section 5.
 *
 * Failures are silent and left for the next trigger. Being offline at a range is the normal case,
 * not an error worth interrupting anybody over, and the account card says when the last sync was so
 * the state is readable rather than announced.
 */

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

	/**
	 * Nothing to say to a server that cannot be reached, but the archer pressed a button and is owed
	 * an answer: the card reads this as "no connection" rather than sitting there saying nothing.
	 */
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		syncStatus.update((current) => ({ ...current, phase: 'error', error: 'offline' }));
		return;
	}

	const client = await supabase();
	if (!client) return;

	syncStatus.update((current) => ({ ...current, phase: 'syncing', error: null }));

	/**
	 * An exchange belongs to the account that started it. Signing out, or signing in as somebody else,
	 * while one is in flight must stop it: push claims every ownerless row for the account it was
	 * given, so carrying on would file the next archer's shooting under the last archer's name.
	 */
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

		/*
		 * The social side is refreshed and the profile card republished after the record they describe
		 * has gone up. Both are worth far less than the exchange itself, so neither can break it: a
		 * friends list or a badge count an hour out of date costs nothing, a failed sync costs the
		 * shooting.
		 */
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
