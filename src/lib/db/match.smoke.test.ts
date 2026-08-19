import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { MIGRATIONS } from './migrations';

/**
 * Writing a match end against a real SQLite. Every writer here reads the end before it writes it, so
 * what has to be true is about interleaving: two writes racing for one end must not leave two of it.
 */

const sqlite = new DatabaseSync(':memory:');
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

// Serialised like the real one, or wrapping a writer in it would prove nothing here.
let writeLock: Promise<unknown> = Promise.resolve();
function transaction<T>(work: () => Promise<T>): Promise<T> {
	const run = writeLock.then(() => work());
	writeLock = run.catch(() => {});
	return run;
}

vi.mock('./index', async () => {
	const actual = await import('./schema');
	return { db: () => proxy, schema: actual, transaction };
});

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value)
});

const { saveMatchEnd, listEnds } = await import('./repository');

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

beforeEach(() => {
	sqlite.exec('DELETE FROM change_log');
	sqlite.exec('DELETE FROM round_end');
	sqlite.exec('DELETE FROM activity');
	sqlite.exec('DELETE FROM session');
	const now = Date.now();
	sqlite
		.prepare(
			'INSERT INTO session (id, created_at, updated_at, device_id, started_at, kind) VALUES (?,?,?,?,?,?)'
		)
		.run('s', now, now, 'd', now, 'practice');
	sqlite
		.prepare(
			'INSERT INTO activity (id, created_at, updated_at, device_id, session_id, kind, started_at) VALUES (?,?,?,?,?,?,?)'
		)
		.run('m', now, now, 'd', 's', 'match', now);
});

describe('saving a match end', () => {
	it('leaves one end when two writes race for it', async () => {
		await Promise.all([
			saveMatchEnd('m', 1, { ours: 27, theirs: null }),
			saveMatchEnd('m', 1, { ours: null, theirs: 26 })
		]);
		expect(await listEnds('m')).toHaveLength(1);
	});

	it('logs the end once rather than announcing two of it', async () => {
		await Promise.all([
			saveMatchEnd('m', 2, { ours: 28, theirs: null }),
			saveMatchEnd('m', 2, { ours: null, theirs: 25 })
		]);
		const inserts = await proxy
			.select()
			.from(schema.changeLog)
			.where(eq(schema.changeLog.op, 'insert'));
		expect(inserts.filter((row) => row.tableName === 'round_end')).toHaveLength(1);
	});
});
