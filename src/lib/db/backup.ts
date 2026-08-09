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
	['syncState', schema.syncState],
	['changeLog', schema.changeLog]
] as const;

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

	return { rows, tables: restored };
}

export function backupFilename(at = Date.now()): string {
	const date = new Date(at);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `appchery-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
