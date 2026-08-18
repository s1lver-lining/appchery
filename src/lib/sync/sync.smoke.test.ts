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
	let refuse = false;
	let unreachable = false;
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
					if (refuse) return Promise.resolve({ error: { message: 'refused', code: '23514' } });
					if (unreachable) return Promise.resolve({ error: { message: 'fetch failed' } });

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
				eq(column: string, value: unknown) {
					query.filters.push((row) => row[column] === value);
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

	return {
		client,
		tables,
		upserts,
		rowsOf,
		refuseEverything: () => (refuse = true),
		beUnreachable: () => (unreachable = true),
		behave: () => {
			refuse = false;
			unreachable = false;
		}
	};
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
	for (const table of [
		schema.shot,
		schema.end,
		schema.activity,
		schema.session,
		schema.changeLog,
		schema.syncState,
		schema.socialProfile,
		schema.socialActivity
	]) {
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

describe('a change the server will not take', () => {
	it('is given up on, so everything behind it can still go', async () => {
		await insertSession('session-poison');
		await logChange('session', 'session-poison');

		const server = fakeServer();
		server.refuseEverything();

		// Five refusals, each of which would be its own exchange minutes apart.
		for (let attempt = 0; attempt < 5; attempt++) {
			await push(server.client as never, USER).catch(() => {});
		}

		const { failedCount, pendingCount } = await import('./push');
		expect(await failedCount()).toBe(1);
		expect(await pendingCount()).toBe(0);

		// The queue is clear, so a row written afterwards goes up rather than queueing behind it.
		server.behave();
		await insertSession('session-after');
		await logChange('session', 'session-after');
		await push(server.client as never, USER);
		expect(server.upserts).toContain('session:session-after');
	});

	it('is not given up on when the server was simply unreachable', async () => {
		await insertSession('session-offline');
		await logChange('session', 'session-offline');

		const server = fakeServer();
		server.beUnreachable();
		for (let attempt = 0; attempt < 8; attempt++) {
			await push(server.client as never, USER).catch(() => {});
		}

		// A server nobody could reach has refused nothing, so a fortnight offline costs no changes.
		const { failedCount, pendingCount } = await import('./push');
		expect(await failedCount()).toBe(0);
		expect(await pendingCount()).toBe(1);
	});

	it('goes back in the queue when the archer presses sync', async () => {
		await insertSession('session-retry');
		await logChange('session', 'session-retry');

		const server = fakeServer();
		server.refuseEverything();
		for (let attempt = 0; attempt < 5; attempt++) {
			await push(server.client as never, USER).catch(() => {});
		}

		const { failedCount, retryFailed, pendingCount } = await import('./push');
		expect(await failedCount()).toBe(1);

		await retryFailed();
		expect(await failedCount()).toBe(0);
		expect(await pendingCount()).toBe(1);
	});
});

describe('pull', () => {
	it('leaves a shared activity belonging to another account out of these tables', async () => {
		const server = fakeServer();
		server.rowsOf('activity').set('activity-theirs', {
			id: 'activity-theirs',
			created_at: 10,
			updated_at: 10,
			deleted_at: null,
			device_id: 'device-z',
			user_id: 'user-2',
			session_id: 'session-z',
			kind: 'scoring',
			started_at: 10,
			shared_at: 11,
			server_updated_at: '2026-01-01T00:00:00.000Z'
		});

		const result = await pull(server.client as never, USER);

		expect(result.applied).toBe(0);
		expect(await proxy.select().from(schema.activity)).toEqual([]);
	});

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

		const result = await pull(server.client as never, USER);

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

		const result = await pull(server.client as never, USER);

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

		await pull(server.client as never, USER);

		const pending = await proxy.select().from(schema.changeLog).where(isNull(schema.changeLog.syncedAt));
		expect(pending).toEqual([]);
	});

	/**
	 * The case that used to diverge for good: the local row was pushed and marked synced, then another
	 * device with a clock running behind overwrote it. Local wins the merge, so nothing was applied,
	 * and nothing was left to send the winner back up either.
	 */
	it('queues the local winner so the server catches up with it', async () => {
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
			label: 'older, from the other phone',
			server_updated_at: '2026-01-01T00:00:00.000Z'
		});

		await pull(server.client as never, USER);

		const pending = await proxy.select().from(schema.changeLog).where(isNull(schema.changeLog.syncedAt));
		expect(pending.map((row) => row.rowId)).toEqual(['session-a']);

		await push(server.client as never, USER);
		expect(server.rowsOf('session').get('session-a')).toMatchObject({ label: 'edited here' });
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

		await pull(server.client as never, USER);
		expect(await pull(server.client as never, USER)).toMatchObject({ applied: 0, skipped: 0 });
	});
});

describe('adoption and signing out', () => {
	it('claims a history far larger than one SQL statement can carry', async () => {
		const many = 450;
		for (let i = 0; i < many; i++) await insertSession(`bulk-${i}`, { userId: null });

		const { adoptLocalRows } = await import('./auth');
		const adopted = await adoptLocalRows(USER);

		expect(adopted).toBe(many);
		const pending = await proxy.select().from(schema.changeLog).where(isNull(schema.changeLog.syncedAt));
		expect(pending).toHaveLength(many);
	});

	it('drops what other archers shared when the account signs out', async () => {
		await proxy.insert(schema.socialProfile).values({
			userId: 'someone-else',
			handle: 'their_handle',
			displayName: 'Somebody',
			isPublic: 1,
			followStatus: 'approved',
			followsUs: 'none',
			cachedAt: 1
		});
		await proxy.insert(schema.socialActivity).values({
			id: 'their-activity',
			ownerId: 'someone-else',
			sharedAt: 1,
			payload: '{}',
			cachedAt: 1
		});

		const { signOut } = await import('./auth');
		await signOut();

		// A shared device must not show one archer the friends and scores of the one before them.
		expect(await proxy.select().from(schema.socialProfile)).toEqual([]);
		expect(await proxy.select().from(schema.socialActivity)).toEqual([]);
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

	/**
	 * Signing out mid exchange must stop it. Push claims every ownerless row for the account it was
	 * handed, so an exchange that carried on would file whatever is shot next under the archer who
	 * just left.
	 */
	it('stops when the account changes underneath it', async () => {
		const server = fakeServer();
		stub.client = server.client;

		await insertSession('session-a');
		await logChange('session', 'session-a');
		account.set({ id: USER, email: 'archer@example.com' });

		const exchange = syncNow();
		account.set(null);
		await exchange;

		// The push had already begun, so the row went up; nothing after that point ran for an account
		// nobody is signed into any more.
		expect(get(syncStatus).phase).not.toBe('syncing');
	});

	/**
	 * Resume and reconnect fire far more often than there is anything to say, so an automatic trigger
	 * waits its turn. Without this an archer switching apps is a request storm against the server.
	 */
	it('holds automatic triggers to one exchange a minute', async () => {
		const server = fakeServer();
		stub.client = server.client;

		await insertSession('session-quiet');
		await logChange('session', 'session-quiet');
		account.set({ id: USER, email: 'archer@example.com' });

		await syncNow('automatic');
		const afterFirst = server.upserts.length;

		await insertSession('session-again');
		await logChange('session', 'session-again');
		for (let i = 0; i < 20; i++) await syncNow('automatic');

		expect(server.upserts.length).toBe(afterFirst);
		account.set(null);
	});

	it('lets the archer press the button whenever they like', async () => {
		const server = fakeServer();
		stub.client = server.client;

		await insertSession('session-manual');
		await logChange('session', 'session-manual');
		account.set({ id: USER, email: 'archer@example.com' });

		await syncNow('automatic');
		await insertSession('session-manual-2');
		await logChange('session', 'session-manual-2');
		await syncNow();

		expect(server.upserts).toContain('session:session-manual-2');
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
