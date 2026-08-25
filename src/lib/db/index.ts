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
 * A run of writes committed once rather than statement by statement, which outside a transaction is
 * a worker round trip and a commit each. Serialised: one connection, and SQLite has no nested BEGIN.
 *
 * **Only for work the archer asked for, never for background work.** One connection means a write
 * issued while this is open joins it, so a rollback here discards whatever else was in flight. A
 * sync rolling back an arrow entered a second earlier is the worst thing this app could do, which is
 * why nothing in `src/lib/sync` calls this.
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

/** The migration level this build brings a database up to, and the highest one it can read. */
export const LATEST_SCHEMA = MIGRATIONS.length;

/** The migration level the open database is at, recorded in a backup so a restore can refuse a newer file. */
export async function schemaVersion(): Promise<number> {
	if (!driver) throw new Error('initDb() must be awaited before using schemaVersion()');
	const [[version]] = (await driver.query('PRAGMA user_version;', [])) as [[number]];
	return version;
}

/**
 * A database stamped past the last migration this build has, which is a file written by a newer
 * version of the app or by a branch whose migrations were rewritten since.
 *
 * Migrations only ever run forward, so nothing will ever touch such a file again: every table added
 * after it was written is simply absent, and every query against one of them fails for good.
 */
export async function schemaIsAhead(): Promise<boolean> {
	return (await schemaVersion()) > LATEST_SCHEMA;
}

/** The tables the open file actually has, which is not always the tables this build expects. */
export async function tableNames(): Promise<string[]> {
	if (!driver) throw new Error('initDb() must be awaited before using tableNames()');
	const rows = (await driver.query(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`,
		[]
	)) as [string][];
	return rows.map(([name]) => name);
}

/**
 * Everything in the file dropped, and the migrations run again from nothing.
 *
 * The last resort for a database this build cannot recognise. Deleting rows does not fix a schema,
 * and there is no migration to bring a file forward from a version that never existed here, so the
 * only honest repair is to make it afresh. Everything in it goes, which is why nothing calls this
 * without asking first.
 */
export async function rebuildDatabase(): Promise<void> {
	if (!driver) throw new Error('initDb() must be awaited before using rebuildDatabase()');
	await rebuildOn(driver);
}

/** The rebuild itself, against a given connection, so it can be run against a file that is not ours. */
export async function rebuildOn(driver: SqlDriver): Promise<void> {
	const rows = (await driver.query(
		`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%';`,
		[]
	)) as [string, string][];

	// Off while the file is emptied, so the order things are dropped in cannot matter, and put back
	// to whatever it was rather than to what it ought to be.
	const [[keys]] = (await driver.query('PRAGMA foreign_keys;', [])) as [[number]];
	await driver.exec('PRAGMA foreign_keys = OFF;');
	for (const [name, type] of rows) {
		await driver.exec(`DROP ${type === 'view' ? 'VIEW' : 'TABLE'} IF EXISTS "${name}";`);
	}
	await driver.exec('PRAGMA user_version = 0;');
	await driver.exec(`PRAGMA foreign_keys = ${keys ? 'ON' : 'OFF'};`);

	await runMigrations(driver);
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
