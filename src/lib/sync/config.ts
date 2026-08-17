import { db, schema } from '$lib/db';
import { deviceId } from '$lib/db/repository';
import { eq } from 'drizzle-orm';

/**
 * Where the server is, if there is one at all.
 *
 * Baked in at build time, and overridable per install from the `sync_state` row so somebody running
 * their own Supabase points the app at it without rebuilding. That is the whole reason the endpoint
 * column has been sitting in the schema since phase 1.
 *
 * A build with nothing configured is not a broken build. It is the offline app, which is the app.
 */

const BUILT_IN = {
	url: import.meta.env.PUBLIC_SUPABASE_URL as string | undefined,
	anonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined
};

/** The single sync_state row. Its id is fixed because there is exactly one of it. */
export const SYNC_STATE_ID = 'local';

export interface SyncConfig {
	url: string;
	anonKey: string;
}

export interface SyncStateRow {
	deviceId: string;
	lastPullCursor: string | null;
	lastPushCursor: string | null;
	endpoint: string | null;
	/** Epoch ms of the last exchange that finished, or null for a device that has never synced. */
	lastSyncAt: number | null;
}

export async function readSyncState(): Promise<SyncStateRow> {
	const rows = await db().select().from(schema.syncState).where(eq(schema.syncState.id, SYNC_STATE_ID));
	if (rows.length > 0) return rows[0];

	const created = {
		id: SYNC_STATE_ID,
		deviceId: deviceId(),
		lastPullCursor: null,
		lastPushCursor: null,
		endpoint: null,
		lastSyncAt: null
	};
	await db().insert(schema.syncState).values(created);
	return created;
}

export async function writeSyncState(patch: Partial<SyncStateRow>): Promise<void> {
	await readSyncState();
	await db().update(schema.syncState).set(patch).where(eq(schema.syncState.id, SYNC_STATE_ID));
}

/**
 * The endpoint override is stored as `url|anonKey`, because a self-hosted server needs both and one
 * column is a smaller change than two. Anything malformed is treated as no override at all: a typo
 * in a self-hosting setting must not take the built-in server away from an archer who never touched it.
 */
export function parseEndpoint(endpoint: string | null): SyncConfig | null {
	if (!endpoint) return null;
	const [url, anonKey] = endpoint.split('|');
	if (!url || !anonKey) return null;
	return { url: url.trim(), anonKey: anonKey.trim() };
}

export function formatEndpoint(config: SyncConfig): string {
	return `${config.url}|${config.anonKey}`;
}

export async function syncConfig(): Promise<SyncConfig | null> {
	const state = await readSyncState();
	const override = parseEndpoint(state.endpoint);
	if (override) return override;
	if (BUILT_IN.url && BUILT_IN.anonKey) return { url: BUILT_IN.url, anonKey: BUILT_IN.anonKey };
	return null;
}

/** Whether this build can offer sync at all, answered without touching the database. */
export function hasBuiltInServer(): boolean {
	return Boolean(BUILT_IN.url && BUILT_IN.anonKey);
}
