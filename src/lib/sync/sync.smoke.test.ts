import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq, isNull } from 'drizzle-orm';
import { get } from 'svelte/store';
import * as schema from '$lib/db/schema';
import { MIGRATIONS } from '$lib/db/migrations';

/**
 * Push and pull against a real SQLite and a stand-in server. What has to be true here is about rows
 * and ordering, not about Postgres: that a row edited five times is sent once, that a chunk marks
 * exactly what it consumed, and that a pull never overwrites a local edit that is still pending.
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

vi.mock('$lib/db', async () => {
	const actual = await import('$lib/db/schema');
	return {
		db: () => proxy,
		schema: actual,
		transaction: <T>(work: () => Promise<T>) => work()
	};
});
vi.mock('$lib/db/changed', () => ({ dataChanged: () => {} }));

// The stand-in server, swapped per test. syncNow reaches for its client through this module.
const stub = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('./client', () => ({
	supabase: async () => stub.client,
	clientFor: async () => stub.client,
	forgetClient: () => {}
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value)
});

const { push } = await import('./push');
const { pull } = await import('./pull');
const { syncNow, syncStatus } = await import('./index');
const { account } = await import('./auth');

const USER = 'user-1';

/** Just enough PostgREST to answer what push and pull actually call. */
function fakeServer() {
	const tables = new Map<string, Map<string, Record<string, unknown>>>();
	let clock = 0;
	const upserts: string[] = [];

	function rowsOf(name: string) {
		if (!tables.has(name)) tables.set(name, new Map());
		return tables.get(name)!;
	}

	const client = {
		from(name: string) {
			const query = {
				filters: [] as ((row: Record<string, unknown>) => boolean)[],
				descending: false,
				max: Infinity,
				upsert(payload: Record<string, unknown>[]) {
					for (const row of payload) {
						upserts.push(`${name}:${row.id}`);
						rowsOf(name).set(String(row.id), { ...row, server_updated_at: new Date(++clock * 1000).toISOString() });
					}
					return Promise.resolve({ error: null });
				},
				select(columns?: string) {
					void columns;
					return query;
				},
				gt(column: string, value: string) {
					query.filters.push((row) => String(row[column]) > value);
					return query;
				},
				order(_column: string, options?: { ascending?: boolean }) {
					query.descending = options?.ascending === false;
					return query;
				},
				limit(n: number) {
					query.max = n;
					return query.run();
				},
				run() {
					let data = [...rowsOf(name).values()].filter((row) => query.filters.every((f) => f(row)));
					data.sort((a, b) =>
						String(a.server_updated_at).localeCompare(String(b.server_updated_at)) * (query.descending ? -1 : 1)
					);
					return Promise.resolve({ data: data.slice(0, query.max), error: null });
				},
				then(resolve: (value: unknown) => unknown) {
					return query.run().then(resolve);
				}
			};
			return query;
		}
	};

	return { client, tables, upserts, rowsOf };
}

function insertSession(id: string, patch: Record<string, unknown> = {}) {
	return proxy.insert(schema.session).values({
		id,
		createdAt: 100,
		updatedAt: 100,
		deviceId: 'device-a',
		userId: USER,
		startedAt: 100,
		kind: 'practice',
		...patch
	});
}

function logChange(table: string, rowId: string, op = 'update') {
	return proxy.insert(schema.changeLog).values({ tableName: table, rowId, op, changedAt: 1, syncedAt: null });
}

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

beforeEach(async () => {
	for (const table of [schema.shot, schema.end, schema.activity, schema.session, schema.changeLog, schema.syncState]) {
		await proxy.delete(table);
	}
});

describe('push', () => {
	it('sends a row edited many times exactly once', async () => {
		await insertSession('session-a');
		for (let i = 0; i < 5; i++) await logChange('session', 'session-a');

		const server = fakeServer();
		const result = await push(server.client as never, USER);

		expect(result.uploaded).toBe(1);
		expect(server.upserts).toEqual(['session:session-a']);
	});

	it('leaves nothing pending once it has finished', async () => {
		await insertSession('session-a');
		await logChange('session', 'session-a');

		const server = fakeServer();
		await push(server.client as never, USER);

		const pending = await proxy.select().from(schema.changeLog).where(isNull(schema.changeLog.syncedAt));
		expect(pending).toEqual([]);
		expect(await push(server.client as never, USER)).toMatchObject({ uploaded: 0, pending: 0 });
	});

	it('claims rows that belong to no account yet, and sends them', async () => {
		await insertSession('session-orphan', { userId: null });
		await logChange('session', 'session-orphan');

		const server = fakeServer();
		const result = await push(server.client as never, USER);

		expect(result.uploaded).toBe(1);
		const [row] = await proxy.select().from(schema.session).where(eq(schema.session.id, 'session-orphan'));
		expect(row.userId).toBe(USER);
		// Adoption must not disturb the record itself, or a device that has been offline for a month
		// would outrank every genuinely newer copy of the same row the moment it signed in.
		expect(row.updatedAt).toBe(100);
	});

	it('refuses to send rows belonging to another account on a shared device', async () => {
		await insertSession('session-theirs', { userId: 'user-2' });
		await logChange('session', 'session-theirs');

		const server = fakeServer();
		const result = await push(server.client as never, USER);

		expect(result.uploaded).toBe(0);
		expect(server.upserts).toEqual([]);
	});

	it('uploads a soft deleted row rather than dropping it', async () => {
		await insertSession('session-gone', { deletedAt: 500 });
		await logChange('session', 'session-gone', 'delete');

		const server = fakeServer();
		await push(server.client as never, USER);

		expect(server.rowsOf('session').get('session-gone')).toMatchObject({ deleted_at: 500 });
	});
});

describe('pull', () => {
	it('writes a row this device has never seen', async () => {
		const server = fakeServer();
		server.rowsOf('session').set('session-remote', {
			id: 'session-remote',
			created_at: 10,
			updated_at: 10,
			deleted_at: null,
			device_id: 'device-b',
			user_id: USER,
			started_at: 10,
			kind: 'practice',
			label: 'From the other phone',
			server_updated_at: '2026-01-01T00:00:00.000Z'
		});

		const result = await pull(server.client as never);

		expect(result.applied).toBe(1);
		const [row] = await proxy.select().from(schema.session).where(eq(schema.session.id, 'session-remote'));
		expect(row.label).toBe('From the other phone');
	});

	it('never applies a server row over a newer local edit', async () => {
		await insertSession('session-a', { updatedAt: 900, label: 'edited here' });

		const server = fakeServer();
		server.rowsOf('session').set('session-a', {
			id: 'session-a',
			created_at: 100,
			updated_at: 200,
			deleted_at: null,
			device_id: 'device-b',
			user_id: USER,
			started_at: 100,
			kind: 'practice',
			label: 'stale',
			server_updated_at: '2026-01-01T00:00:00.000Z'
		});

		const result = await pull(server.client as never);

		expect(result).toMatchObject({ applied: 0, skipped: 1 });
		const [row] = await proxy.select().from(schema.session).where(eq(schema.session.id, 'session-a'));
		expect(row.label).toBe('edited here');
	});

	it('does not send back what it just pulled', async () => {
		const server = fakeServer();
		server.rowsOf('session').set('session-remote', {
			id: 'session-remote',
			created_at: 10,
			updated_at: 10,
			deleted_at: null,
			device_id: 'device-b',
			user_id: USER,
			started_at: 10,
			kind: 'practice',
			server_updated_at: '2026-01-01T00:00:00.000Z'
		});

		await pull(server.client as never);

		const pending = await proxy.select().from(schema.changeLog).where(isNull(schema.changeLog.syncedAt));
		expect(pending).toEqual([]);
	});

	it('reads nothing twice once the cursor has moved', async () => {
		const server = fakeServer();
		server.rowsOf('session').set('session-remote', {
			id: 'session-remote',
			created_at: 10,
			updated_at: 10,
			deleted_at: null,
			device_id: 'device-b',
			user_id: USER,
			started_at: 10,
			kind: 'practice',
			server_updated_at: '2026-01-01T00:00:00.000Z'
		});

		await pull(server.client as never);
		expect(await pull(server.client as never)).toMatchObject({ applied: 0, skipped: 0 });
	});
});

describe('syncNow', () => {
	it('runs one exchange when several triggers fire together', async () => {
		const server = fakeServer();
		stub.client = server.client;

		await insertSession('session-a');
		await logChange('session', 'session-a');
		account.set({ id: USER, email: 'archer@example.com' });

		await Promise.all([syncNow(), syncNow(), syncNow()]);

		// Resume, regained connectivity and the manual button can all land at once. One upload.
		expect(server.upserts).toEqual(['session:session-a']);
		expect(get(syncStatus).phase).toBe('idle');
		expect(get(syncStatus).pending).toBe(0);
		account.set(null);
	});

	it('does nothing at all when nobody is signed in', async () => {
		const server = fakeServer();
		stub.client = server.client;
		await insertSession('session-b');
		await logChange('session', 'session-b');
		account.set(null);

		await syncNow();

		expect(server.upserts).toEqual([]);
	});
});
