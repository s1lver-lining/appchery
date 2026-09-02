import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { isNull } from 'drizzle-orm';
import * as schema from './schema';
import { MIGRATIONS } from './migrations';

/**
 * Restoring is the one moment a device's whole history appears at once with no mutation behind it,
 * so what has to be true is about the change log a later sync reads, not about the rows themselves.
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
		schemaVersion: async () => MIGRATIONS.length,
		// Erasing the device asks the file what it has before deleting from it, so the fake answers too.
		tableNames: async () =>
			sqlite
				.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`)
				.all()
				.map((row) => (row as { name: string }).name),
		// A real one, because a restore empties the database before it fills it and the rollback is
		// the whole reason a half readable file must not be able to take the history with it.
		transaction: async <T>(work: () => Promise<T>) => {
			sqlite.exec('BEGIN');
			try {
				const result = await work();
				sqlite.exec('COMMIT');
				return result;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		}
	};
});

const { importBackup, BACKUP_FORMAT } = await import('./backup');
const { deleteEverything } = await import('./repository');

function backupOf(tables: Record<string, unknown[]>) {
	return {
		format: BACKUP_FORMAT,
		version: 1,
		exportedAt: 1,
		schemaVersion: MIGRATIONS.length,
		tables
	} as never;
}

const SESSION = {
	id: 'session-a',
	createdAt: 1,
	updatedAt: 1,
	deletedAt: null,
	deviceId: 'device-old',
	userId: null,
	startedAt: 1,
	kind: 'practice'
};

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

beforeEach(async () => {
	for (const table of [schema.session, schema.changeLog, schema.syncState, schema.ianseoFavourite])
		await proxy.delete(table);
});

describe('restoring a backup', () => {
	it('marks every restored row as waiting to be pushed', async () => {
		await importBackup(backupOf({ session: [SESSION] }));

		const pending = await proxy.select().from(schema.changeLog).where(isNull(schema.changeLog.syncedAt));
		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({ tableName: 'session', rowId: 'session-a', op: 'update' });
	});

	it('ignores the log the file was carrying, which describes another device', async () => {
		await importBackup(
			backupOf({
				session: [SESSION],
				changeLog: [{ id: 1, tableName: 'session', rowId: 'session-a', op: 'insert', changedAt: 1, syncedAt: 99 }]
			})
		);

		const log = await proxy.select().from(schema.changeLog);
		expect(log).toHaveLength(1);
		expect(log[0].syncedAt).toBeNull();
	});

	it('clears the cursors, which describe a history this device no longer has', async () => {
		await proxy.insert(schema.syncState).values({
			id: 'local',
			deviceId: 'device-here',
			lastPullCursor: '2020-01-01',
			lastPushCursor: '12',
			endpoint: 'https://self.hosted|key',
			lastSyncAt: 5
		});

		await importBackup(
			backupOf({
				session: [SESSION],
				syncState: [{ id: 'local', deviceId: 'device-old', lastPullCursor: '2030-01-01', lastPushCursor: '900', endpoint: null }]
			})
		);

		const [state] = await proxy.select().from(schema.syncState);
		expect(state).toMatchObject({ lastPullCursor: null, lastPushCursor: null, lastSyncAt: null });
	});

	it('keeps where the server is and which device this is, neither of them being data', async () => {
		await proxy.insert(schema.syncState).values({
			id: 'local',
			deviceId: 'device-here',
			lastPullCursor: null,
			lastPushCursor: null,
			endpoint: 'https://self.hosted|key',
			lastSyncAt: null
		});

		await importBackup(backupOf({ session: [SESSION] }));

		const [state] = await proxy.select().from(schema.syncState);
		expect(state).toMatchObject({ deviceId: 'device-here', endpoint: 'https://self.hosted|key' });
	});

	it('leaves the history alone when the file turns out to be unreadable part way through', async () => {
		await proxy.insert(schema.session).values(SESSION);

		await expect(
			importBackup(backupOf({ session: [{ ...SESSION, id: 'session-b' }, { kind: 'practice' }] }))
		).rejects.toThrow();

		expect((await proxy.select().from(schema.session)).map((row) => row.id)).toEqual(['session-a']);
	});

	it('carries the competitions being followed, which nothing else moves off the device', async () => {
		await proxy.insert(schema.ianseoFavourite).values({
			id: 'stale',
			kind: 'competition',
			label: 'Somewhere else',
			addedAt: 1
		});

		await importBackup(
			backupOf({
				ianseoFavourite: [{ id: 'comp-a', kind: 'competition', label: 'Nîmes', addedAt: 2 }]
			})
		);

		const rows = await proxy.select().from(schema.ianseoFavourite);
		expect(rows.map((row) => row.id)).toEqual(['comp-a']);
		// Local forever, like a badge: enqueueing it would leave an entry no exchange can ever send.
		expect(await proxy.select().from(schema.changeLog)).toEqual([]);
	});

	it('enqueues a deleted row too, so the delete reaches the server as well', async () => {
		await importBackup(backupOf({ session: [{ ...SESSION, deletedAt: 5 }] }));

		const pending = await proxy.select().from(schema.changeLog).where(isNull(schema.changeLog.syncedAt));
		expect(pending.map((row) => row.rowId)).toEqual(['session-a']);
	});
});

describe('erasing everything', () => {
	it('clears the cursors, so signing back in brings the record home', async () => {
		await proxy.insert(schema.syncState).values({
			id: 'local',
			deviceId: 'device-old',
			lastPullCursor: '2030-01-01',
			lastPushCursor: '900',
			endpoint: 'https://example.test|anon-key',
			lastSyncAt: 5
		});

		await deleteEverything();

		const [state] = await proxy.select().from(schema.syncState);
		expect(state).toMatchObject({ lastPullCursor: null, lastPushCursor: null, lastSyncAt: null });
		// Where the server is is a setting the archer typed, not history: wiping must not take it away.
		expect(state.endpoint).toBe('https://example.test|anon-key');
	});
});
