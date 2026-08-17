import { getTableColumns } from 'drizzle-orm';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, schema } from '$lib/db';
import { LOCAL_ONLY_COLUMNS, OWNED_TABLES, ownedTable, type OwnedTableName } from './tables';
import { writeSyncState } from './config';
import { adoptLocalRows } from './auth';

/**
 * Sending local changes up, see doc/sync.md section 4.
 *
 * The change log holds no payload, only which row changed, so push reads the row as it stands now.
 * Ten edits of one end during a round collapse into one upload, and a row edited while an earlier
 * push was in flight is simply sent in its current state rather than in the state it had when the
 * log entry was written.
 *
 * Chunked and resumable: a chunk that fails leaves every entry after it pending, so a bulk import of
 * thousands of rows survives a connection that drops halfway.
 */

const CHUNK = 200;

export interface PushResult {
	uploaded: number;
	pending: number;
}

interface PendingEntry {
	id: number;
	tableName: string;
	rowId: string;
	op: string;
}

export async function pendingCount(): Promise<number> {
	// Counted in SQLite rather than by reading the rows: a bulk import leaves tens of thousands of
	// entries pending, and this is read every time the settings screen opens.
	const [row] = await db()
		.select({ n: sql<number>`count(*)` })
		.from(schema.changeLog)
		.where(isNull(schema.changeLog.syncedAt));
	return Number(row?.n ?? 0);
}

export async function push(client: SupabaseClient, userId: string): Promise<PushResult> {
	let uploaded = 0;

	/**
	 * Rows written while signed in still arrive with no owner: `src/lib/db/repository.ts` knows
	 * nothing about accounts, and that is worth keeping. The local database is the source of truth
	 * and has one archer; ownership is a fact about syncing, so sync is where it gets stamped.
	 */
	await adoptLocalRows(userId);

	for (;;) {
		const batch = (await db()
			.select({
				id: schema.changeLog.id,
				tableName: schema.changeLog.tableName,
				rowId: schema.changeLog.rowId,
				op: schema.changeLog.op
			})
			.from(schema.changeLog)
			.where(isNull(schema.changeLog.syncedAt))
			.orderBy(asc(schema.changeLog.id))
			.limit(CHUNK)) as PendingEntry[];

		if (batch.length === 0) break;

		uploaded += await pushBatch(client, userId, batch);

		const highest = batch[batch.length - 1].id;
		await db()
			.update(schema.changeLog)
			.set({ syncedAt: Date.now() })
			.where(and(isNull(schema.changeLog.syncedAt), lte(schema.changeLog.id, highest)));
		await writeSyncState({ lastPushCursor: String(highest) });

		if (batch.length < CHUNK) break;
	}

	await writeSyncState({ lastSyncAt: Date.now() });
	return { uploaded, pending: await pendingCount() };
}

async function pushBatch(client: SupabaseClient, userId: string, batch: PendingEntry[]): Promise<number> {
	// Latest entry per row, so a row inserted and then edited five times is read once and sent once.
	const wanted = new Map<string, PendingEntry>();
	for (const entry of batch) wanted.set(`${entry.tableName}:${entry.rowId}`, entry);

	const byTable = new Map<string, string[]>();
	for (const entry of wanted.values()) {
		if (!ownedTable(entry.tableName)) continue;
		const ids = byTable.get(entry.tableName) ?? [];
		ids.push(entry.rowId);
		byTable.set(entry.tableName, ids);
	}

	let uploaded = 0;

	// Parents before children, so a chunk carrying both lands them in an order the server can hold.
	for (const { name } of OWNED_TABLES) {
		const ids = byTable.get(name);
		if (!ids || ids.length === 0) continue;

		const payload = await readRows(name, ids, userId);
		if (payload.length === 0) continue;

		const { error } = await client.from(name).upsert(payload, { onConflict: 'id' });
		if (error) throw new PushError(`${name}: ${error.message}`);
		uploaded += payload.length;
	}

	return uploaded;
}

export class PushError extends Error {}

/**
 * Rows as the server wants them: snake_case column names, local-only columns dropped, and only the
 * rows this account actually owns. A row belonging to nobody has not been adopted yet, and a row
 * belonging to somebody else was shot by a different archer on this device: neither is ours to send.
 */
async function readRows(name: string, ids: string[], userId: string): Promise<Record<string, unknown>[]> {
	const entry = ownedTable(name);
	if (!entry) return [];

	const columns = getTableColumns(entry.table);
	const skip = new Set(LOCAL_ONLY_COLUMNS[name as OwnedTableName] ?? []);

	const rows = await db()
		.select()
		.from(entry.table)
		.where(and(inArray(entry.table.id, ids), eq(entry.table.userId, userId)));

	return rows.map((row) => {
		const out: Record<string, unknown> = {};
		for (const [property, column] of Object.entries(columns)) {
			if (skip.has(property)) continue;
			out[column.name] = (row as Record<string, unknown>)[property];
		}
		// server_updated_at is the server's to write, and user_id is pinned by the insert policy
		// anyway. Sending either would be a client deciding something the server must decide.
		delete out.server_updated_at;
		return out;
	});
}
