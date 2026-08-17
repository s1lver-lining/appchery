import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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

describe('badge persistence', () => {
	it('writes a badge and reads back the day it was earned', async () => {
		const now = Date.now();
		await proxy.insert(schema.badge).values({
			id: 'badge-1',
			createdAt: now,
			updatedAt: now,
			deviceId: 'device',
			key: 'thousandArrows',
			earnedAt: now - 86_400_000
		});

		const [row] = await proxy.select().from(schema.badge);
		expect(row.key).toBe('thousandArrows');
		expect(row.earnedAt).toBe(now - 86_400_000);
	});
});

/**
 * The arrows of a deleted outing must leave every total with it. A soft delete cascades to nothing,
 * so the activity row is still there: only the query keeps it out, which is worth running for real.
 */
describe('activities of a deleted session', () => {
	const stamp = (id: string) => ({
		id,
		createdAt: 1,
		updatedAt: 1,
		deviceId: 'device'
	});

	beforeAll(async () => {
		for (const [id, deletedAt] of [
			['kept', null],
			['binned', 2000]
		] as const) {
			await proxy
				.insert(schema.session)
				.values({ ...stamp(`s-${id}`), startedAt: 1, kind: 'practice', deletedAt });
			await proxy.insert(schema.activity).values({
				...stamp(`a-${id}`),
				sessionId: `s-${id}`,
				kind: 'scoring',
				startedAt: 1,
				arrowsShot: 72,
				status: 'complete'
			});
		}
	});

	it('leaves out the activities of a session that was deleted', async () => {
		const live = proxy
			.select({ id: schema.session.id })
			.from(schema.session)
			.where(isNull(schema.session.deletedAt));
		const rows = await proxy
			.select()
			.from(schema.activity)
			.where(and(isNull(schema.activity.deletedAt), inArray(schema.activity.sessionId, live)));

		expect(rows.map((row) => row.id)).toEqual(['a-kept']);
		expect(rows.reduce((sum, row) => sum + row.arrowsShot, 0)).toBe(72);
	});

	it('still holds the row, so putting the session back puts its arrows back too', async () => {
		const all = await proxy.select().from(schema.activity);
		expect(all.map((row) => row.id).sort()).toEqual(['a-binned', 'a-kept']);
	});

	it('leaves out the ends of a deleted outing, which is the same question one table down', async () => {
		for (const suffix of ['kept', 'binned']) {
			await proxy.insert(schema.end).values({
				...stamp(`e-${suffix}`),
				activityId: `a-${suffix}`,
				stageIndex: 0,
				endNo: 1,
				subtotal: 54
			});
		}

		const live = proxy
			.select({ id: schema.activity.id })
			.from(schema.activity)
			.where(
				and(
					isNull(schema.activity.deletedAt),
					inArray(
						schema.activity.sessionId,
						proxy
							.select({ id: schema.session.id })
							.from(schema.session)
							.where(isNull(schema.session.deletedAt))
					)
				)
			);
		const ends = await proxy
			.select()
			.from(schema.end)
			.where(and(isNull(schema.end.deletedAt), inArray(schema.end.activityId, live)));

		expect(ends.map((row) => row.id)).toEqual(['e-kept']);
	});
});

