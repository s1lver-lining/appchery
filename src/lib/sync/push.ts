import { and, asc, eq, getTableColumns, gt, gte, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, schema } from '$lib/db';
import { LOCAL_ONLY_COLUMNS, OWNED_TABLES, ownedTable, type OwnedTableName } from '$lib/db/synced';
import { writeSyncState } from './config';
import { adoptLocalRows } from './auth';
import { syncProgress } from './progress';

// Sending local changes up, see doc/sync.md § 4. The log holds no payload, so a row is read as it
// stands now: ten edits of one end collapse into one upload.

const CHUNK = 200;

/**
 * Refusals a change is allowed before it stops being sent. Each one falls in a separate exchange, so
 * this is minutes of trying, not milliseconds, and only a server that answered counts: a row nobody
 * could reach has not been refused.
 */
const REFUSALS_ALLOWED = 5;

/** What PostgREST answers when row level security turns a write away, which an upsert only meets on an id another account holds. */
const RLS_REFUSAL = '42501';

export interface PushResult {
	uploaded: number;
	pending: number;
	/** Rows the server answered and turned away during this push. */
	refused: number;
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

/** Of those, the ones whose id another account already holds on the server. */
export async function takenCount(): Promise<number> {
	return countLog(and(isNotNull(schema.changeLog.failedAt), eq(schema.changeLog.refusal, 'taken')));
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
		.set({ failedAt: null, attempts: 0, refusal: null })
		.where(isNotNull(schema.changeLog.failedAt));
}

export async function push(client: SupabaseClient, userId: string): Promise<PushResult> {
	let uploaded = 0;
	let refused = 0;
	// Walked by id rather than by what is left pending, so an entry this account cannot send is
	// stepped over for this run instead of holding every entry behind it.
	let cursor = 0;

	// The repository knows nothing about accounts, so rows arrive ownerless and are claimed here.
	await adoptLocalRows(userId);
	const total = await pendingCount();
	let walked = 0;
	syncProgress.set({ step: 'push', done: 0, total });

	for (;;) {
		const batch = (await db()
			.select({
				id: schema.changeLog.id,
				tableName: schema.changeLog.tableName,
				rowId: schema.changeLog.rowId,
				op: schema.changeLog.op
			})
			.from(schema.changeLog)
			.where(
				and(
					isNull(schema.changeLog.syncedAt),
					isNull(schema.changeLog.failedAt),
					gt(schema.changeLog.id, cursor)
				)
			)
			.orderBy(asc(schema.changeLog.id))
			.limit(CHUNK)) as PendingEntry[];

		if (batch.length === 0) break;

		// A server that could not be reached throws here and costs the chunk nothing: it refused nothing.
		const { sent, refusals } = await pushBatch(client, userId, batch);
		uploaded += sent.size;
		refused += refusals.size;
		await countRefusals(batch, refusals);

		// Only what actually went up. A row belonging to another archer on a shared device was never
		// ours to send, and stamping it sent would throw away their change the moment they sign in.
		const done = batch
			.filter((entry) => sent.has(`${entry.tableName}:${entry.rowId}`))
			.map((entry) => entry.id);
		for (let i = 0; i < done.length; i += 100) {
			await db()
				.update(schema.changeLog)
				.set({ syncedAt: Date.now() })
				.where(inArray(schema.changeLog.id, done.slice(i, i + 100)));
		}

		walked += batch.length;
		syncProgress.set({ step: 'push', done: Math.min(walked, total), total });

		const highest = batch[batch.length - 1].id;
		await writeSyncState({ lastPushCursor: String(highest) });
		cursor = highest;

		if (batch.length < CHUNK) break;
	}

	await writeSyncState({ lastSyncAt: Date.now() });
	return { uploaded, pending: await pendingCount(), refused };
}

interface BatchOutcome {
	/** The rows that reached the server, keyed as the log names them, so only those are stamped sent. */
	sent: Set<string>;
	/** The rows the server turned away, with why. */
	refusals: Map<string, string>;
}

async function pushBatch(client: SupabaseClient, userId: string, batch: PendingEntry[]): Promise<BatchOutcome> {
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

	const sent = new Set<string>();
	const refusals = new Map<string, string>();

	// Parents before children, so a chunk carrying both lands them in an order the server can hold.
	for (const { name } of OWNED_TABLES) {
		const ids = byTable.get(name);
		if (!ids || ids.length === 0) continue;

		const payload = await readRows(name, ids, userId);
		if (payload.length === 0) continue;

		const { error } = await client.from(name).upsert(payload, { onConflict: 'id' });
		if (!error) {
			for (const row of payload) sent.add(`${name}:${String(row.id)}`);
			continue;
		}
		unlessAnswered(name, error);

		// One refused row fails the whole statement, so the rows go again one at a time to find it rather
		// than blaming every row that happened to share its chunk.
		for (const row of payload) {
			const key = `${name}:${String(row.id)}`;
			const { error: alone } = await client.from(name).upsert([row], { onConflict: 'id' });
			if (!alone) sent.add(key);
			else {
				unlessAnswered(name, alone);
				refusals.set(key, alone.code === RLS_REFUSAL ? 'taken' : String(alone.code));
			}
		}
	}

	return { sent, refusals };
}

/** PostgREST reports a refusal with a code; a network that never arrived has none. */
function unlessAnswered(name: string, error: { message: string; code?: string }) {
	if (!error.code) throw new PushError(`${name}: ${error.message}`);
}

/** The server could not be reached, which refuses nothing. */
export class PushError extends Error {}

/**
 * A refusal against each refused change, and a full stop for those that have had their share. A row
 * another account holds stops at once: no number of retries makes it this account's.
 */
async function countRefusals(batch: PendingEntry[], refusals: Map<string, string>): Promise<void> {
	const byReason = new Map<string, number[]>();
	for (const entry of batch) {
		const reason = refusals.get(`${entry.tableName}:${entry.rowId}`);
		if (reason === undefined) continue;
		byReason.set(reason, [...(byReason.get(reason) ?? []), entry.id]);
	}

	for (const [reason, ids] of byReason) {
		const allowed = reason === 'taken' ? 1 : REFUSALS_ALLOWED;
		for (let i = 0; i < ids.length; i += 100) {
			const chunk = ids.slice(i, i + 100);
			await db()
				.update(schema.changeLog)
				.set({ attempts: sql`${schema.changeLog.attempts} + 1`, refusal: reason })
				.where(inArray(schema.changeLog.id, chunk));
			await db()
				.update(schema.changeLog)
				.set({ failedAt: Date.now() })
				.where(and(inArray(schema.changeLog.id, chunk), gte(schema.changeLog.attempts, allowed)));
		}
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
