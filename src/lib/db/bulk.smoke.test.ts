import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { MIGRATIONS } from './migrations';

/**
 * Working on a selection runs against a real SQLite, because what has to be true of it is a
 * statement about rows: that a batch moves exactly the rows it found, and announces exactly those
 * to the change log a sync will later read.
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

vi.mock('./index', async () => {
	const actual = await import('./schema');
	return {
		db: () => proxy,
		schema: actual,
		transaction: <T>(work: () => Promise<T>) => work()
	};
});

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value)
});

const { deleteSessions, restoreSessions, setSessionsBow, deleteImportedSessions } = await import('./repository');

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

async function seed(ids: string[], deletedAt: number | null = null) {
	const now = Date.now();
	for (const id of ids) {
		await proxy
			.insert(schema.session)
			.values({ id, createdAt: now, updatedAt: now, deviceId: 'd', startedAt: now, kind: 'practice', deletedAt });
	}
}

const logged = async (op: string) =>
	(await proxy.select().from(schema.changeLog).where(eq(schema.changeLog.op, op)))
		.filter((row) => row.tableName === 'session')
		.map((row) => row.rowId)
		.sort();

beforeEach(() => {
	sqlite.exec('DELETE FROM change_log');
	sqlite.exec('DELETE FROM session');
});

describe('deleting a selection', () => {
	it('takes the rows it found and announces only those', async () => {
		await seed(['live-1', 'live-2']);
		await seed(['gone-1'], 1000);

		// The ghost is a row an import hard deleted between the selection and the tap that acted on it.
		await deleteSessions(['live-1', 'live-2', 'gone-1', 'ghost']);

		const rows = await proxy.select().from(schema.session);
		expect(rows.filter((row) => row.deletedAt !== null).map((row) => row.id).sort()).toEqual([
			'gone-1',
			'live-1',
			'live-2'
		]);
		// gone-1 was already deleted and the ghost never was, so neither is a delete anybody synced.
		expect(await logged('delete')).toEqual(['live-1', 'live-2']);
	});

	it('says nothing at all when the rows have gone', async () => {
		await deleteSessions(['ghost-1', 'ghost-2']);
		expect(await logged('delete')).toEqual([]);
	});
});

describe('undoing a deleted selection', () => {
	it('puts back only what is still there and still deleted', async () => {
		await seed(['live-1']);
		await seed(['gone-1'], 1000);

		await restoreSessions(['live-1', 'gone-1', 'ghost']);

		const rows = await proxy.select().from(schema.session);
		expect(rows.every((row) => row.deletedAt === null)).toBe(true);
		expect(await logged('update')).toEqual(['gone-1']);
	});
});

describe('changing the bow of a selection', () => {
	it('writes both columns, over the live rows only', async () => {
		await seed(['live-1']);
		await seed(['gone-1'], 1000);
		const now = Date.now();
		await proxy
			.insert(schema.bow)
			.values({ id: 'bow-1', createdAt: now, updatedAt: now, deviceId: 'd', name: 'Bow', type: 'recurve' });

		await setSessionsBow(['live-1', 'gone-1', 'ghost'], { bowId: 'bow-1', bowType: null });

		const [live] = await proxy.select().from(schema.session).where(eq(schema.session.id, 'live-1'));
		expect(live.bowId).toBe('bow-1');
		expect(live.bowType).toBeNull();
		expect(await logged('update')).toEqual(['live-1']);
	});
});

/**
 * Removing what an import wrote is an archer deleting outings, so it has to leave tombstones behind.
 * A hard delete would leave the server holding rows this device no longer has, and the next pull
 * would bring every one of them back.
 */
describe('removing imported sessions', () => {
	it('tombstones them and tells the change log', async () => {
		const now = Date.now();
		await proxy.insert(schema.session).values({
			id: 'imported:session:42',
			createdAt: now,
			updatedAt: now,
			deviceId: 'd',
			startedAt: now,
			kind: 'practice'
		});
		await proxy.delete(schema.changeLog);

		expect(await deleteImportedSessions()).toBe(1);

		const [row] = await proxy
			.select()
			.from(schema.session)
			.where(eq(schema.session.id, 'imported:session:42'));
		expect(row.deletedAt).not.toBeNull();

		const logged = await proxy.select().from(schema.changeLog);
		expect(logged.map((entry) => entry.op)).toContain('delete');
	});
});
