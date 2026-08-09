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
