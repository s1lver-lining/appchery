import { derived, writable } from 'svelte/store';
import { and, isNotNull, isNull, sql } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { SYNC_STATE_ID } from './config';
import { eq } from 'drizzle-orm';

/**
 * When syncing has been going wrong long enough to be worth saying so. Deliberately small and free
 * of the exchange itself: the navigation bar reads this on every page, and must not drag push, pull
 * or the client library along with it.
 */

/** A weekend away with no signal passes quietly; a fortnight of unsent shooting does not. */
const SILENCE = 3 * 24 * 60 * 60 * 1000;
const SEEN_KEY = 'appchery.syncAlertSeen';

export interface SyncAlert {
	/** Changes the server refused often enough that the app stopped asking. */
	failed: number;
	/** Set when there is work waiting and nothing has got through for days. */
	silentSince: number | null;
}

export const syncAlert = writable<SyncAlert | null>(null);

/** Unread until the archer opens the screen that explains it, and again if it changes after that. */
export const syncAlertUnread = derived(syncAlert, ($alert) => {
	if (!$alert) return false;
	try {
		return localStorage.getItem(SEEN_KEY) !== signature($alert);
	} catch {
		return true;
	}
});

function signature(alert: SyncAlert): string {
	return `${alert.failed}:${alert.silentSince ?? 0}`;
}

export function markSyncAlertSeen(alert: SyncAlert | null) {
	if (!alert) return;
	try {
		localStorage.setItem(SEEN_KEY, signature(alert));
	} catch {
		// A browser refusing storage shows the badge again, which is the safe way to be wrong.
	}
}

/**
 * Read from the local database only. Both halves are answers the device already holds, and neither
 * is worth a request: an archer with no signal is exactly who this has to work for.
 */
export async function refreshSyncAlert(): Promise<void> {
	const [refused] = await db()
		.select({ n: sql<number>`count(*)` })
		.from(schema.changeLog)
		.where(isNotNull(schema.changeLog.failedAt));

	const [waiting] = await db()
		.select({ n: sql<number>`count(*)` })
		.from(schema.changeLog)
		.where(and(isNull(schema.changeLog.syncedAt), isNull(schema.changeLog.failedAt)));

	const [state] = await db()
		.select({ lastSyncAt: schema.syncState.lastSyncAt })
		.from(schema.syncState)
		.where(eq(schema.syncState.id, SYNC_STATE_ID));

	const failed = Number(refused?.n ?? 0);
	const pending = Number(waiting?.n ?? 0);
	const lastSyncAt = state?.lastSyncAt ?? null;

	// Silence only matters when something is waiting on it. A device with nothing to say has nothing
	// to worry about, whatever the date on its last exchange.
	const silent = lastSyncAt !== null && pending > 0 && Date.now() - lastSyncAt > SILENCE;

	syncAlert.set(failed > 0 || silent ? { failed, silentSince: silent ? lastSyncAt : null } : null);
}
