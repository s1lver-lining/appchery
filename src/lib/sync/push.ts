import { and, asc, eq, getTableColumns, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, schema } from '$lib/db';
import { LOCAL_ONLY_COLUMNS, OWNED_TABLES, ownedTable, type OwnedTableName } from '$lib/db/synced';
import { writeSyncState } from './config';
import { adoptLocalRows } from './auth';

// Sending local changes up, see doc/sync.md § 4. The log holds no payload, so a row is read as it
// stands now: ten edits of one end collapse into one upload.

const CHUNK = 200;

/**
 * Refusals a change is allowed before it stops being sent. Each one falls in a separate exchange, so
 * this is minutes of trying, not milliseconds, and only a server that answered counts: a row nobody
 * could reach has not been refused.
 */
const REFUSALS_ALLOWED = 5;

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
	return countLog(and(isNull(schema.changeLog.syncedAt), isNull(schema.changeLog.failedAt)));
}

/** Changes the server refused often enough that the app stopped asking. */
export async function failedCount(): Promise<number> {
	return countLog(isNotNull(schema.changeLog.failedAt));
}

async function countLog(condition: SQL | undefined): Promise<number> {
	const [row] = await db()
		.select({ n: sql<number>`count(*)` })
		.from(schema.changeLog)
		.where(condition);
	return Number(row?.n ?? 0);
}

/** Puts refused changes back in the queue, which is what the archer's own button asks for. */
export async function retryFailed(): Promise<void> {
	await db()
		.update(schema.changeLog)
		.set({ failedAt: null, attempts: 0 })
		.where(isNotNull(schema.changeLog.failedAt));
}

export async function push(client: SupabaseClient, userId: string): Promise<PushResult> {
	let uploaded = 0;
	let lastHighest = 0;

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
			.where(and(isNull(schema.changeLog.syncedAt), isNull(schema.changeLog.failedAt)))
			.orderBy(asc(schema.changeLog.id))
			.limit(CHUNK)) as PendingEntry[];

		if (batch.length === 0) break;

		try {
			uploaded += await pushBatch(client, userId, batch);
		} catch (error) {
			// A server that answered and refused is telling us something a retry will not change. One
			// that could not be reached is telling us nothing, so it costs the chunk nothing.
			if (error instanceof PushError && error.refused) await countRefusal(batch);
			throw error;
		}

		const highest = batch[batch.length - 1].id;
		// A chunk that leaves the queue where it found it would upload the same rows for ever.
		if (highest <= lastHighest) break;
		lastHighest = highest;

		// Refused entries are left alone: they were never in this batch, and stamping them sent would
		// silently throw away a change the archer's retry button is meant to give another chance.
		await db()
			.update(schema.changeLog)
			.set({ syncedAt: Date.now() })
			.where(
				and(
					isNull(schema.changeLog.syncedAt),
					isNull(schema.changeLog.failedAt),
					lte(schema.changeLog.id, highest)
				)
			);
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
		// PostgREST reports a refusal with a code; a network that never arrived has none.
		if (error) throw new PushError(`${name}: ${error.message}`, Boolean(error.code));
		uploaded += payload.length;
	}

	return uploaded;
}

export class PushError extends Error {
	/** The server answered and said no, rather than being unreachable. */
	readonly refused: boolean;

	constructor(message: string, refused = false) {
		super(message);
		this.refused = refused;
	}
}

/**
 * A refusal against every change in the chunk, and a full stop for those that have had their share.
 * One bad row would otherwise hold up every row behind it for as long as the archer keeps the app.
 */
async function countRefusal(batch: PendingEntry[]): Promise<void> {
	const ids = batch.map((entry) => entry.id);
	for (let i = 0; i < ids.length; i += 100) {
		const chunk = ids.slice(i, i + 100);
		await db()
			.update(schema.changeLog)
			.set({ attempts: sql`${schema.changeLog.attempts} + 1` })
			.where(inArray(schema.changeLog.id, chunk));
		await db()
			.update(schema.changeLog)
			.set({ failedAt: Date.now() })
			.where(and(inArray(schema.changeLog.id, chunk), gte(schema.changeLog.attempts, REFUSALS_ALLOWED)));
	}
}

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
