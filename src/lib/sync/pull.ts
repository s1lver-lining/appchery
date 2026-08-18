import { getTableColumns, inArray } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, schema } from '$lib/db';
import { OWNED_TABLES, LOCAL_ONLY_COLUMNS, type OwnedTableName } from '$lib/db/synced';
import { readSyncState, writeSyncState } from './config';
import { resolveWithDeletes, type Mergeable } from './merge';
import { dataChanged } from '$lib/db/changed';

// Bringing other devices' changes down. The cursor, the ordering and the merge are doc/sync.md § 4.

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

	// The cursor only ever moves to a row this pull actually applied. Anything written while it ran
	// is newer than that, so it waits for the next one rather than being stepped over.
	let mark = start;

	// Parents before children, so an activity never lands before the session it belongs to.
	for (const { name, table } of OWNED_TABLES) {
		// Every table walks from the same start: one moving cursor would skip rows in the next table.
		let cursor = start;
		for (;;) {
			const { data, error } = await client
				.from(name)
				.select('*')
				// Somebody else's shared activities are readable too, and are not this archer's rows.
				.eq('user_id', userId)
				.gt('server_updated_at', cursor)
				.order('server_updated_at', { ascending: true })
				.limit(PAGE);

			if (error) throw new PullError(`${name}: ${error.message}`);
			if (!data || data.length === 0) break;

			const outcome = await applyRows(name, table, data);
			applied += outcome.applied;
			skipped += outcome.skipped;

			const last = String(data[data.length - 1].server_updated_at);
			if (last > mark) mark = last;
			if (data.length < PAGE) break;

			// A page that ends where the last one did would ask for the same rows for ever. It takes a
			// clock that has stopped or rows sharing a stamp, and either way the loop has to end.
			if (last === cursor) break;
			cursor = last;
		}
	}

	await writeSyncState({ lastSyncAt: Date.now(), lastPullCursor: mark });
	if (applied > 0) dataChanged();

	return { applied, skipped };
}

type OwnedTable = (typeof OWNED_TABLES)[number]['table'];

/**
 * No transaction on purpose: one connection means a rollback would discard whatever the archer was
 * writing at that moment. Applying a row is idempotent, so an interrupted pull is simply done again.
 */
async function applyRows(name: string, table: OwnedTable, remote: Record<string, unknown>[]) {
	const columns = getTableColumns(table);
	const skip = new Set(LOCAL_ONLY_COLUMNS[name as OwnedTableName] ?? []);

	const existing = await db()
		.select()
		.from(table)
		.where(inArray(table.id, remote.map((row) => String(row.id))));
	const byId = new Map(existing.map((row) => [row.id, row as unknown as Mergeable]));

	let applied = 0;
	let skipped = 0;

	for (const incoming of remote) {
		const id = String(incoming.id);
		const local = byId.get(id);
		const candidate = toLocalRow(columns, skip, incoming);

		if (local && resolveWithDeletes(name, local, candidate as unknown as Mergeable) === 'local') {
			// The winner has to go back up, or a device with a slow clock holds the server on an older
			// copy for good. Only when they differ: a pull reads back its own push, and those tie.
			if (!matches(local as unknown as Record<string, unknown>, candidate)) {
				await db()
					.insert(schema.changeLog)
					.values({ tableName: name, rowId: id, op: 'update', changedAt: Date.now(), syncedAt: null });
			}
			skipped += 1;
			continue;
		}

		if (local) await db().update(table).set(candidate).where(inArray(table.id, [id]));
		else await db().insert(table).values(candidate as never);
		applied += 1;
	}

	return { applied, skipped };
}

function matches(local: Record<string, unknown>, candidate: Record<string, unknown>): boolean {
	return Object.keys(candidate).every((key) => local[key] === candidate[key]);
}

/** A server row as the local table wants it. Columns the server lacks keep whatever the device had. */
function toLocalRow(
	columns: Record<string, { name: string }>,
	skip: Set<string>,
	incoming: Record<string, unknown>
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [property, column] of Object.entries(columns)) {
		if (skip.has(property) || !(column.name in incoming)) continue;
		out[property] = incoming[column.name];
	}
	return out;
}
