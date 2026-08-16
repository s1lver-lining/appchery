import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { Capacitor } from '@capacitor/core';
import type { SqlDriver } from './driver';
import { MIGRATIONS } from './migrations';
import * as schema from './schema';

let driver: SqlDriver | null = null;
let database: SqliteRemoteDatabase<typeof schema> | null = null;
let initPromise: Promise<void> | null = null;

/** Idempotent: concurrent callers share one initialisation. */
export function initDb(): Promise<void> {
	initPromise ??= (async () => {
		driver = Capacitor.isNativePlatform()
			? await (await import('./driver.native')).createNativeDriver()
			: await (await import('./driver.web')).createWebDriver();

		await runMigrations(driver);

		database = drizzle(
			async (sql, params, method) => {
				if (method === 'run') {
					await driver!.exec(sql, params);
					return { rows: [] };
				}
				const rows = await driver!.query(sql, params);
				return { rows: method === 'get' ? (rows[0] ?? []) : rows };
			},
			{ schema }
		);
	})();
	return initPromise;
}

let writeLock: Promise<unknown> = Promise.resolve();

/**
 * A run of writes committed once instead of statement by statement. Every statement crosses to the
 * SQLite worker and, outside a transaction, commits on its own: recording one end costs eight of
 * those round trips, which is most of the delay between tapping an arrow and seeing it land.
 *
 * Serialised rather than nested, because there is one connection and SQLite has no nested
 * transaction: a second BEGIN would fail, and a rollback would take the other caller's writes.
 */
export function transaction<T>(work: () => Promise<T>): Promise<T> {
	const run = writeLock.then(async () => {
		if (!driver) throw new Error('initDb() must be awaited before using transaction()');
		await driver.exec('BEGIN');
		try {
			const result = await work();
			await driver.exec('COMMIT');
			return result;
		} catch (error) {
			await driver.exec('ROLLBACK').catch(() => {});
			throw error;
		}
	});
	// Held whatever happens, or one failed run wedges every write after it.
	writeLock = run.catch(() => {});
	return run;
}

export function db(): SqliteRemoteDatabase<typeof schema> {
	if (!database) throw new Error('initDb() must be awaited before using db()');
	return database;
}

/** The migration level the open database is at, recorded in a backup so a restore can refuse a newer file. */
export async function schemaVersion(): Promise<number> {
	if (!driver) throw new Error('initDb() must be awaited before using schemaVersion()');
	const [[version]] = (await driver.query('PRAGMA user_version;', [])) as [[number]];
	return version;
}

export function dbInfo(): Pick<SqlDriver, 'kind' | 'persistent'> {
	if (!driver) throw new Error('initDb() must be awaited before using dbInfo()');
	return { kind: driver.kind, persistent: driver.persistent };
}

/**
 * Migrations run forward from whatever `user_version` the file is at. Drizzle's
 * own migrator needs a filesystem, which a webview does not have, so migration
 * SQL is bundled as strings and applied here.
 */
async function runMigrations(d: SqlDriver): Promise<void> {
	const [[current]] = (await d.query('PRAGMA user_version;', [])) as [[number]];
	for (let version = current; version < MIGRATIONS.length; version++) {
		for (const statement of MIGRATIONS[version]) {
			await d.exec(statement);
		}
		await d.exec(`PRAGMA user_version = ${version + 1};`);
	}
}

export { schema };
