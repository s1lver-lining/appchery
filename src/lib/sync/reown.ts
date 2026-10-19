import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { ownedTable } from '$lib/db/synced';
import { giveNewIds } from '$lib/db/reid';

// Rows another account holds on the server, made this account's own by new ids, see doc/sync.md § 4.

export class ReownError extends Error {}

/** The taken rows this account owns here: a row of another archer's on a shared phone is not ours to rename. */
async function takenRows(userId: string): Promise<{ table: string; id: string }[]> {
	const logged = await db()
		.selectDistinct({ table: schema.changeLog.tableName, id: schema.changeLog.rowId })
		.from(schema.changeLog)
		.where(and(isNotNull(schema.changeLog.failedAt), eq(schema.changeLog.refusal, 'taken')));

	const byTable = new Map<string, string[]>();
	for (const { table, id } of logged) byTable.set(table, [...(byTable.get(table) ?? []), id]);

	const rows: { table: string; id: string }[] = [];
	for (const [name, ids] of byTable) {
		const entry = ownedTable(name);
		if (!entry) continue;
		for (let i = 0; i < ids.length; i += 100) {
			const found = await db()
				.select({ id: entry.table.id })
				.from(entry.table)
				.where(and(inArray(entry.table.id, ids.slice(i, i + 100)), eq(entry.table.userId, userId)));
			for (const { id } of found) rows.push({ table: name, id });
		}
	}
	return rows;
}

/**
 * Held in memory by the watch and the run tracker, which would write under an id that just stopped
 * existing. Ends the watch kept for later find their way through the alias instead.
 */
async function inUse(ids: Set<string>): Promise<boolean> {
	const [{ watchLink }, { nativeRun }] = await Promise.all([import('$lib/watch/store'), import('$lib/run/handover')]);
	const round = watchLink()?.roundActivity;
	if (round && ids.has(round)) return true;
	const run = await nativeRun();
	return !!run?.id && ids.has(run.id);
}

export async function reownTaken(userId: string): Promise<number> {
	const rows = await takenRows(userId);
	if (await inUse(new Set(rows.map(({ id }) => id)))) throw new ReownError('inUse');
	return giveNewIds(rows);
}
