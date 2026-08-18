import { and, asc, eq, getTableColumns, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, schema } from '$lib/db';
import { LOCAL_ONLY_COLUMNS, OWNED_TABLES, ownedTable, type OwnedTableName } from '$lib/db/synced';
import { writeSyncState } from './config';
import { adoptLocalRows } from './auth';

// Sending local changes up, see doc/sync.md § 4. The log holds no payload, so a row is read as it
// stands now: ten edits of one end collapse into one upload.

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

/** Counted in SQLite: a bulk import leaves tens of thousands pending, and the settings screen asks often. */
export async function pendingCount(): Promise<number> {
	const [row] = await db()
		.select({ n: sql<number>`count(*)` })
		.from(schema.changeLog)
		.where(isNull(schema.changeLog.syncedAt));
	return Number(row?.n ?? 0);
}

export async function push(client: SupabaseClient, userId: string): Promise<PushResult> {
	let uploaded = 0;

	// The repository knows nothing about accounts, so rows arrive ownerless and are claimed here.
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
 * Rows as the server wants them, and only the ones this account owns: a row belonging to another
 * archer on a shared device is not ours to send.
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
