import { schema } from '$lib/db';

/**
 * The tables that travel, parents first, named as `change_log` and the server name them. One list,
 * so a table cannot be synced by push and forgotten by pull. What is missing is doc/sync.md § 2.
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

/** Stripped on the way up. A bow photo is an artefact of an older build, left where it lies. */
export const LOCAL_ONLY_COLUMNS: Partial<Record<OwnedTableName, string[]>> = {
	bow: ['photo']
};
