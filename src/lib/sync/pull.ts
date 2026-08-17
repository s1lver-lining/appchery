import { getTableColumns, inArray } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, transaction } from '$lib/db';
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

	const high = await highWaterMark(client, userId);
	await writeSyncState({ lastSyncAt: Date.now(), ...(high ? { lastPullCursor: high } : {}) });
	if (applied > 0) dataChanged();

	return { applied, skipped };
}

/**
 * The cursor is only advanced to a mark the server itself reports after every table has been read,
 * so a pull interrupted between two tables resumes from where it started rather than declaring
 * itself finished. Re-reading rows is free; missing one is not.
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

	await transaction(async () => {
		const existing = await db().select().from(table).where(inArray(table.id, ids));
		const byId = new Map(existing.map((row) => [row.id, row as unknown as Mergeable]));

		for (const incoming of remote) {
			const local = byId.get(String(incoming.id));
			const candidate = toLocalRow(columns, skip, incoming);

			if (local && resolveWithDeletes(name, local, candidate as unknown as Mergeable) === 'local') {
				// The local copy is the newer one, and it is still pending in the change log, so the next
				// push carries it up and the server converges on it. Nothing to do here but leave it be.
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
	});

	return { applied, skipped };
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
