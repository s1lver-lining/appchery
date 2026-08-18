import { schema } from '$lib/db';

/**
 * The tables that travel, in the order rows must be written: parents before the rows that reference
 * them, so a pull that applies a session and its activities in one pass never lands a child first.
 * The same order run backwards is the order a delete has to take.
 *
 * The name is the SQL table name, because that is what `change_log.table_name` holds and what the
 * server calls the table too. One list, so a table cannot be synced by push and forgotten by pull.
 *
 * badge, change_log and sync_state are absent on purpose: badges are recomputed per device, and the
 * log and the cursors are local bookkeeping. See doc/sync.md section 2.
 */
export const OWNED_TABLES = [
	{ name: 'bow', table: schema.bow },
	{ name: 'arrow_set', table: schema.arrowSet },
	{ name: 'bow_revision', table: schema.bowRevision },
	{ name: 'session', table: schema.session },
	{ name: 'activity', table: schema.activity },
	{ name: 'round_end', table: schema.end },
	{ name: 'shot', table: schema.shot },
	{ name: 'plan', table: schema.plan },
	{ name: 'plan_slot', table: schema.planSlot },
	{ name: 'sight_mark', table: schema.sightMark },
	{ name: 'favourite_round', table: schema.favouriteRound }
] as const;

export type OwnedTableName = (typeof OWNED_TABLES)[number]['name'];

const BY_NAME = new Map(OWNED_TABLES.map((entry) => [entry.name as string, entry]));

export function ownedTable(name: string) {
	return BY_NAME.get(name) ?? null;
}

/**
 * Columns the server has no column for, stripped on the way up rather than rejected on arrival.
 *
 * `bow.photo` is a data URL from an older build. Nothing in the app can create one any more, so this
 * is not a feature waiting on storage: it is old data being left where it lies, on the device that
 * holds it.
 */
export const LOCAL_ONLY_COLUMNS: Partial<Record<OwnedTableName, string[]>> = {
	bow: ['photo']
};
