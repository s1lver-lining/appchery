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
		transaction: <T>(work: () => Promise<T>) => work()
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
	for (const table of [schema.session, schema.changeLog, schema.syncState]) await proxy.delete(table);
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

	it('does not inherit the cursors the file was written with', async () => {
		await importBackup(
			backupOf({
				session: [SESSION],
				syncState: [{ id: 'local', deviceId: 'device-old', lastPullCursor: '2030-01-01', lastPushCursor: '900', endpoint: null }]
			})
		);

		expect(await proxy.select().from(schema.syncState)).toEqual([]);
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
