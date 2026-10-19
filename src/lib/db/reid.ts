import { and, eq, sql } from 'drizzle-orm';
import { db, schema, transaction } from './index';
import { OWNED_TABLES } from './synced';

// Giving rows new ids without breaking a single link, see doc/sync.md § 4.

/** Every column holding another row's id. A test fails on any `_id` column missing from here or NOT_REFERENCES. */
export const REFERENCES = [
	{ table: 'bow_revision', column: 'bow_id' },
	{ table: 'bow_revision', column: 'arrow_set_id' },
	{ table: 'session', column: 'bow_id' },
	{ table: 'session', column: 'bow_revision_id' },
	{ table: 'activity', column: 'session_id' },
	{ table: 'activity', column: 'resulting_revision_id' },
	{ table: 'round_end', column: 'activity_id' },
	{ table: 'shot', column: 'end_id' },
	{ table: 'plan_slot', column: 'plan_id' },
	{ table: 'sight_mark', column: 'bow_id' },
	{ table: 'run_point', column: 'activity_id' },
	{ table: 'wrist_motion', column: 'activity_id' }
] as const;

/** Named like references but pointing at nothing this device gives ids to. */
export const NOT_REFERENCES = [
	// A key in the round catalogue.
	'activity.round_definition_id',
	// Written by no version of the app.
	'shot.arrow_id',
	// Other people's ids and ianseo's.
	'social_activity.owner_id',
	'ianseo_favourite.to_id',
	'change_log.row_id',
	'id_alias.old_id',
	'id_alias.new_id'
];

const SYNCED = new Set<string>(OWNED_TABLES.map(({ name }) => name));

/**
 * New ids for these rows, every reference to them following, and each row whose content changed
 * queued to be sent. One transaction, unlike sync: a half done rewrite leaves arrows pointing at an
 * end that no longer exists, and the archer asked for this one, so nothing of theirs is mid write.
 */
export async function giveNewIds(rows: { table: string; id: string }[]): Promise<number> {
	if (rows.length === 0) return 0;
	const now = Date.now();

	return transaction(async () => {
		// The parents move before their children follow, which only holds together at the commit.
		await db().run(sql`PRAGMA defer_foreign_keys = ON`);

		const owed = new Map<string, { table: string; id: string }>();
		for (const { table, id } of rows) {
			const fresh = crypto.randomUUID();
			await db().run(sql`UPDATE ${sql.identifier(table)} SET id = ${fresh} WHERE id = ${id}`);
			// Kept one hop deep, so an id given away twice still leads straight to where it lives now.
			await db().update(schema.idAlias).set({ newId: fresh }).where(eq(schema.idAlias.newId, id));
			await db().insert(schema.idAlias).values({ oldId: id, newId: fresh });
			await db()
				.delete(schema.changeLog)
				.where(and(eq(schema.changeLog.tableName, table), eq(schema.changeLog.rowId, id)));
			if (SYNCED.has(table)) owed.set(`${table}:${fresh}`, { table, id: fresh });
		}

		for (const { table, column } of REFERENCES) {
			const name = sql.identifier(table);
			const ref = sql.identifier(column);
			const stale = sql`${ref} IN (SELECT old_id FROM id_alias)`;
			const moving = (await db().all(sql`SELECT id FROM ${name} WHERE ${stale}`)) as unknown[][];
			if (moving.length === 0) continue;

			if (SYNCED.has(table)) {
				// Its content changed, so it has to outrank the copy other devices hold.
				await db().run(
					sql`UPDATE ${name} SET ${ref} = (SELECT new_id FROM id_alias WHERE old_id = ${ref}), updated_at = ${now} WHERE ${stale}`
				);
				for (const [id] of moving) owed.set(`${table}:${String(id)}`, { table, id: String(id) });
			} else {
				await db().run(sql`UPDATE ${name} SET ${ref} = (SELECT new_id FROM id_alias WHERE old_id = ${ref}) WHERE ${stale}`);
			}
		}

		const entries = [...owed.values()].map(({ table, id }) => ({
			tableName: table,
			rowId: id,
			op: 'update',
			changedAt: now,
			syncedAt: null
		}));
		for (let i = 0; i < entries.length; i += 100) {
			await db().insert(schema.changeLog).values(entries.slice(i, i + 100));
		}
		return rows.length;
	});
}

/** Where a row lives now, for an id that came back from the watch or the run tracker. */
export async function currentId(id: string): Promise<string> {
	const [alias] = await db().select({ newId: schema.idAlias.newId }).from(schema.idAlias).where(eq(schema.idAlias.oldId, id));
	return alias?.newId ?? id;
}
