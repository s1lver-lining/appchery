import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import type { SqlDriver } from './driver';
import { MIGRATIONS } from './migrations';

/**
 * A database this build cannot recognise, against a real SQLite.
 *
 * The case is not hypothetical: a file written before the eighteen early migrations were collapsed
 * into 0001 carries a version far past anything here, so the migration loop never runs again and
 * every table added since is missing. What has to be true is that the two things somebody reaches
 * for then still work: erasing the device, and making the database afresh.
 */

let sqlite = new DatabaseSync(':memory:');
const proxy = drizzle(
	async (sql, params, method) => {
		const statement = sqlite.prepare(sql);
		if (method === 'run') {
			statement.run(...(params as never[]));
			return { rows: [] };
		}
		const rows = statement.all(...(params as never[])).map((r) => Object.values(r as object));
		return { rows: method === 'get' ? (rows[0] ?? []) : rows };
	},
	{ schema }
);

const driver: SqlDriver = {
	// In memory, which is what this test's SQLite is, and the only kind of driver it has to look like.
	kind: 'wasm-memory',
	persistent: false,
	exec: async (sql: string, params: unknown[] = []) => {
		if (params.length > 0) sqlite.prepare(sql).run(...(params as never[]));
		else sqlite.exec(sql);
	},
	query: async (sql: string, params: unknown[] = []) =>
		sqlite
			.prepare(sql)
			.all(...(params as never[]))
			.map((row) => Object.values(row as object))
};

vi.mock('./index', async () => {
	const actual = await import('./schema');
	const real = await vi.importActual<typeof import('./index')>('./index');
	return {
		...real,
		db: () => proxy,
		schema: actual,
		tableNames: async () =>
			(await driver.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`, [])).map(([name]) => String(name)),
		transaction: async (work: () => Promise<unknown>) => work()
	};
});

const { deleteEverything } = await import('./repository');
// The rebuild proper, run against the file this test holds rather than against the module's own.
const { rebuildOn } = await vi.importActual<typeof import('./index')>('./index');

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value)
});

/** What this build's migrations leave behind, which is what a rebuilt file has to end up as. */
function migrate() {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
	sqlite.exec(`PRAGMA user_version = ${MIGRATIONS.length};`);
}

function tables() {
	return driver
		.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`, [])
		.then((rows) => rows.map(([name]) => String(name)).sort());
}

/** A file from a build whose migrations no longer exist: stamped ahead, and missing what came after. */
function divergent() {
	sqlite.exec(`CREATE TABLE session (
		id TEXT PRIMARY KEY NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		device_id TEXT NOT NULL,
		label TEXT,
		started_at INTEGER NOT NULL,
		kind TEXT,
		arrow_goal INTEGER,
		bow_id TEXT,
		bow_type TEXT,
		bow_revision_id TEXT,
		location TEXT,
		latitude REAL,
		longitude REAL,
		weather TEXT,
		notes TEXT,
		user_id TEXT
	);`);
	sqlite.exec('PRAGMA user_version = 18;');
}

beforeEach(() => {
	sqlite = new DatabaseSync(':memory:');
});

describe('a database stamped past the migrations this build has', () => {
	it('is never migrated again, which is what leaves the tables missing', async () => {
		divergent();
		// The loop in initDb only ever runs forward, so there is nothing here to run.
		const [[version]] = (await driver.query('PRAGMA user_version;', [])) as [[number]];
		expect(version).toBeGreaterThan(MIGRATIONS.length);
		expect(await tables()).not.toContain('social_activity');
	});

	it('can still be erased, rather than failing on the first table it does not have', async () => {
		divergent();
		sqlite
			.prepare(
				'INSERT INTO session (id, created_at, updated_at, device_id, started_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run('s1', 1, 1, 'device', 1);

		await expect(deleteEverything()).resolves.toBeUndefined();
		const { n } = sqlite.prepare('SELECT count(*) AS n FROM session').get() as { n: number };
		expect(n).toBe(0);
	});

	it('is made afresh by a rebuild, with every table this build expects', async () => {
		divergent();
		await rebuildOn(driver);

		expect(await tables()).toEqual(await expected());
		const [[version]] = (await driver.query('PRAGMA user_version;', [])) as [[number]];
		expect(version).toBe(MIGRATIONS.length);
	});

	it('keeps nothing that was in it, which is the whole of what a rebuild is', async () => {
		divergent();
		sqlite
			.prepare(
				'INSERT INTO session (id, created_at, updated_at, device_id, started_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run('s1', 1, 1, 'device', 1);
		await rebuildOn(driver);
		const { n } = sqlite.prepare('SELECT count(*) AS n FROM session').get() as { n: number };
		expect(n).toBe(0);
	});
});

/** What the tables should be once a file has been rebuilt: a fresh one, migrated. */
async function expected() {
	const fresh = sqlite;
	sqlite = new DatabaseSync(':memory:');
	migrate();
	const names = await tables();
	sqlite = fresh;
	return names;
}

