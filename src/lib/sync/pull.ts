import { getTableColumns, inArray } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, schema } from '$lib/db';
import { OWNED_TABLES, LOCAL_ONLY_COLUMNS, type OwnedTableName } from './tables';
import { readSyncState, writeSyncState } from './config';
import { resolveWithDeletes, type Mergeable } from './merge';
import { dataChanged } from '$lib/db/changed';

/**
 * Bringing other devices' changes down, see doc/sync.md section 4.
 *
 * The cursor is `server_updated_at`, which the server writes and no client can move. Using the
 * client's own `updated_at` would let one phone with a wrong clock either skip every row written
 * while it was ahead, or drag the cursor back and re-download a year of shooting on every sync.
 *
 * Applied rows never re-enter the change log. They came from the server, so logging them would send
 * them straight back up, and two devices would push each other's rows to each other forever.
 */

const PAGE = 500;

export interface PullResult {
	applied: number;
	skipped: number;
}

export class PullError extends Error {}

export async function pull(client: SupabaseClient, userId: string): Promise<PullResult> {
	const state = await readSyncState();
	const start = state.lastPullCursor ?? '1970-01-01T00:00:00Z';
	let applied = 0;
	let skipped = 0;

	/**
	 * The mark is taken before a single row is read, and becomes the new cursor only once every table
	 * has been walked. Taking it afterwards would move the cursor past rows that another device wrote
	 * while this pull was running but that this pull never asked for, and those rows would then never
	 * be pulled at all.
	 */
	const mark = await highWaterMark(client, userId);

	// Parents before children, so an activity never lands before the session it belongs to.
	for (const { name, table } of OWNED_TABLES) {
		// Each table walks from the same starting cursor. Sharing one moving cursor across tables
		// would let the first table's progress skip rows in the next one.
		let cursor = start;
		for (;;) {
			const { data, error } = await client
				.from(name)
				.select('*')
				// Only this archer's rows. The policies also make somebody else's shared activities
				// readable, and without this filter they would land in the local tables and count
				// towards this archer's own totals.
				.eq('user_id', userId)
				.gt('server_updated_at', cursor)
				.order('server_updated_at', { ascending: true })
				.limit(PAGE);

			if (error) throw new PullError(`${name}: ${error.message}`);
			if (!data || data.length === 0) break;

			const outcome = await applyRows(name, table, data);
			applied += outcome.applied;
			skipped += outcome.skipped;

			if (data.length < PAGE) break;

			// Paged on the same cursor the whole pull advances on, so a page boundary that falls inside
			// one millisecond is re-read rather than stepped over.
			cursor = String(data[data.length - 1].server_updated_at);
		}
	}

	await writeSyncState({ lastSyncAt: Date.now(), ...(mark ? { lastPullCursor: mark } : {}) });
	if (applied > 0) dataChanged();

	return { applied, skipped };
}

/**
 * The newest row the server holds for this archer, across every table. Read before the pull rather
 * than after it, and written only if the pull finishes: an interrupted pull resumes from where it
 * started. Re-reading rows is free, and missing one is not.
 */
async function highWaterMark(client: SupabaseClient, userId: string): Promise<string | null> {
	let latest: string | null = null;
	for (const { name } of OWNED_TABLES) {
		const { data, error } = await client
			.from(name)
			.select('server_updated_at')
			.eq('user_id', userId)
			.order('server_updated_at', { ascending: false })
			.limit(1);
		if (error) throw new PullError(`${name}: ${error.message}`);
		const value = data?.[0]?.server_updated_at as string | undefined;
		if (value && (!latest || value > latest)) latest = value;
	}
	return latest;
}

type OwnedTable = (typeof OWNED_TABLES)[number]['table'];

async function applyRows(name: string, table: OwnedTable, remote: Record<string, unknown>[]) {
	const columns = getTableColumns(table);
	const skip = new Set(LOCAL_ONLY_COLUMNS[name as OwnedTableName] ?? []);
	const ids = remote.map((row) => String(row.id));

	let applied = 0;
	let skipped = 0;

	/**
	 * Deliberately not wrapped in a transaction. There is one connection, so a write the archer makes
	 * while a transaction is open joins it, and a rollback here would take the arrow they entered a
	 * second ago with it. A pull is background work and must never be able to undo the foreground.
	 *
	 * Nothing is lost by dropping it: applying a row is idempotent, and the cursor only moves once
	 * every table has been walked, so a pull that stops halfway is simply done again.
	 */
	{
		const existing = await db().select().from(table).where(inArray(table.id, ids));
		const byId = new Map(existing.map((row) => [row.id, row as unknown as Mergeable]));

		for (const incoming of remote) {
			const local = byId.get(String(incoming.id));
			const candidate = toLocalRow(columns, skip, incoming);

			if (local && resolveWithDeletes(name, local, candidate as unknown as Mergeable) === 'local') {
				/**
				 * The local copy wins, so the server may be holding an older one. Leaving it alone is not
				 * enough: the row may have been pushed and marked synced, then edited on another device
				 * whose clock ran behind, and nothing would ever send the winner up again.
				 *
				 * Only when the two genuinely differ, though. Every pull reads back the rows this device
				 * has just pushed, and those tie on the merge; queueing those would push them again on the
				 * next exchange, and again after that, for ever.
				 */
				if (!matches(local as unknown as Record<string, unknown>, candidate)) {
					await db()
						.insert(schema.changeLog)
						.values({ tableName: name, rowId: String(incoming.id), op: 'update', changedAt: Date.now(), syncedAt: null });
				}
				skipped += 1;
				continue;
			}

			if (local) {
				await db().update(table).set(candidate).where(inArray(table.id, [String(incoming.id)]));
			} else {
				await db().insert(table).values(candidate as never);
			}
			applied += 1;
		}
	}

	return { applied, skipped };
}

/** Whether the server already holds exactly what this device holds, column for column. */
function matches(local: Record<string, unknown>, candidate: Record<string, unknown>): boolean {
	return Object.keys(candidate).every((key) => local[key] === candidate[key]);
}

/**
 * A server row in the shape the local table expects. Columns the server does not carry keep whatever
 * the device already had, which is what keeps a bow photo through a sync that knows nothing about it.
 */
function toLocalRow(
	columns: Record<string, { name: string }>,
	skip: Set<string>,
	incoming: Record<string, unknown>
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [property, column] of Object.entries(columns)) {
		if (skip.has(property)) continue;
		if (!(column.name in incoming)) continue;
		out[property] = incoming[column.name];
	}
	return out;
}

/** Everything the server holds, read from scratch. What a device asks for the first time it signs in. */
export async function pullEverything(client: SupabaseClient, userId: string): Promise<PullResult> {
	await writeSyncState({ lastPullCursor: null });
	return pull(client, userId);
}
