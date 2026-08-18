import { db, schema, schemaVersion } from './index';
import { MIGRATIONS } from './migrations';

/**
 * A whole database as one JSON file. Everything lives in OPFS on a single device, so without this
 * a cleared browser or a lost phone loses scores that exist nowhere else.
 *
 * Soft deleted rows are included deliberately: they carry the tombstones that a later sync needs.
 */

export const BACKUP_FORMAT = 'appchery-backup';

/** Ordered so a restore inserts parents before the rows that reference them. */
const TABLES = [
	['bow', schema.bow],
	['bowRevision', schema.bowRevision],
	['arrowSet', schema.arrowSet],
	['session', schema.session],
	['activity', schema.activity],
	['end', schema.end],
	['shot', schema.shot],
	['favouriteRound', schema.favouriteRound],
	['plan', schema.plan],
	['planSlot', schema.planSlot],
	['sightMark', schema.sightMark],
	['badge', schema.badge]
] as const;

/**
 * Wiped by a restore and never written to a file. The log and the cursors describe a sync that
 * happened on another device, and the social cache is other archers' rows on their way out anyway.
 */
const NOT_BACKED_UP = [schema.changeLog, schema.syncState, schema.socialActivity, schema.socialProfile];

export interface Backup {
	format: typeof BACKUP_FORMAT;
	version: number;
	exportedAt: number;
	/** The migration level the file was written at, so a newer file is refused rather than mangled. */
	schemaVersion: number;
	tables: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<Backup> {
	const tables: Record<string, unknown[]> = {};
	for (const [name, table] of TABLES) {
		tables[name] = await db().select().from(table);
	}

	return {
		format: BACKUP_FORMAT,
		version: 1,
		exportedAt: Date.now(),
		schemaVersion: await schemaVersion(),
		tables
	};
}

export class BackupError extends Error {}

export function parseBackup(text: string): Backup {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new BackupError('notJson');
	}

	const backup = parsed as Partial<Backup>;
	if (backup?.format !== BACKUP_FORMAT || typeof backup.tables !== 'object' || !backup.tables) {
		throw new BackupError('notABackup');
	}
	// A file from a newer build may hold columns this one cannot store, so it is refused outright.
	if ((backup.schemaVersion ?? 0) > MIGRATIONS.length) throw new BackupError('tooNew');
	return backup as Backup;
}

export interface RestoreReport {
	rows: number;
	tables: number;
}

/**
 * Replaces the database with the file's contents. A merge would need conflict rules that only the
 * sync layer can define, so restoring is deliberately all or nothing.
 */
export async function importBackup(backup: Backup): Promise<RestoreReport> {
	let rows = 0;
	let restored = 0;

	// Children first, so a delete never trips a foreign key on its way through.
	for (const [, table] of [...TABLES].reverse()) {
		await db().delete(table);
	}
	for (const table of NOT_BACKED_UP) await db().delete(table);

	for (const [name, table] of TABLES) {
		const list = backup.tables[name];
		if (!Array.isArray(list) || list.length === 0) continue;
		restored += 1;
		// Chunked: one statement per row is slow, and one statement for ten thousand rows exceeds
		// SQLite's variable limit.
		for (let i = 0; i < list.length; i += 100) {
			const chunk = list.slice(i, i + 100) as Record<string, unknown>[];
			await db()
				.insert(table)
				.values(chunk as never);
			rows += chunk.length;
		}
	}

	await enqueueRestored();

	return { rows, tables: restored };
}

/**
 * Every restored row, marked as waiting to be pushed: a restore is a whole history appearing with no
 * mutation behind it. Tombstones included, or the next pull brings a deleted session back.
 */
async function enqueueRestored(): Promise<void> {
	const changedAt = Date.now();
	// The sync layer's list, so a table that travels can never be restored without being enqueued.
	const { OWNED_TABLES } = await import('$lib/sync/tables');
	for (const { name, table } of OWNED_TABLES) {
		const ids = await db().select({ id: table.id }).from(table);
		for (let i = 0; i < ids.length; i += 100) {
			const chunk = ids.slice(i, i + 100);
			await db()
				.insert(schema.changeLog)
				.values(chunk.map(({ id }) => ({ tableName: name, rowId: id, op: 'update', changedAt, syncedAt: null })));
		}
	}
}

export function backupFilename(at = Date.now()): string {
	const date = new Date(at);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `appchery-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
