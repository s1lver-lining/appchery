import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import { MIGRATIONS } from './migrations';

/**
 * Exercises the real SQL Drizzle generates against a real SQLite, which unit tests over the domain
 * cannot catch: a schema and a migration that disagree only ever fail at runtime.
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

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

describe('session persistence', () => {
	it('inserts a session and reads it back', async () => {
		const now = Date.now();
		await proxy.insert(schema.session).values({
			id: 'session-1',
			createdAt: now,
			updatedAt: now,
			deviceId: 'device',
			startedAt: now,
			kind: 'practice'
		});

		const rows = await proxy.select().from(schema.session);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('session-1');
		expect(rows[0].startedAt).toBe(now);
	});
});
