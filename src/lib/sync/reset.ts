import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, schema } from '$lib/db';
import { OWNED_TABLES } from '$lib/db/synced';
import { writeSyncState } from './config';
import { adoptLocalRows } from './auth';

// Emptying the server for one account, see doc/sync.md § 4. Neither function ever touches a row on this device.

/** Every synced row this account holds on the server, children first. Profile, follows and handle stay. */
export async function deleteServerRows(client: SupabaseClient, userId: string): Promise<void> {
	for (const { name } of [...OWNED_TABLES].reverse()) {
		const { error } = await client.from(name).delete().eq('user_id', userId);
		if (error) throw new Error(`${name}: ${error.message}`);
	}
}

/**
 * The server is now empty for this account, so everything this device holds for it is owed again,
 * tombstones included. The log only remembers what was sent, so without this the next push sends nothing.
 */
export async function requeueEverything(userId: string): Promise<void> {
	await adoptLocalRows(userId);
	const changedAt = Date.now();

	for (const { name, table } of OWNED_TABLES) {
		const rows = await db()
			.select({ id: table.id })
			.from(table)
			.where(or(eq(table.userId, userId), isNull(table.userId)));

		for (let i = 0; i < rows.length; i += 100) {
			const ids = rows.slice(i, i + 100).map((row) => row.id);
			// Older entries for these rows, sent or refused, describe a server that no longer exists.
			await db()
				.delete(schema.changeLog)
				.where(and(eq(schema.changeLog.tableName, name), inArray(schema.changeLog.rowId, ids)));
			await db()
				.insert(schema.changeLog)
				.values(ids.map((rowId) => ({ tableName: name, rowId, op: 'update', changedAt, syncedAt: null })));
		}
	}

	// The cursors describe what the server held, which is now nothing.
	await writeSyncState({ lastPullCursor: null, lastPushCursor: null });
}
