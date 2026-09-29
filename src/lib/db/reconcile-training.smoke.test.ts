import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import { MIGRATIONS } from './migrations';

/**
 * Repairing training counts a frozen page lost. The recordings of the shots survived where the
 * running total did not, so the true count is the largest `arrows_after` among a session's training
 * recordings. What has to be true: the count is raised to that, never lowered, and a session with
 * no recordings is left exactly as it was.
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

const { reconcileTrainingArrowsFromRecordings, setTrainingArrows, listActivities } =
	await import('./repository');

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

beforeEach(() => {
	sqlite.exec('DELETE FROM change_log');
	sqlite.exec('DELETE FROM wrist_motion');
	sqlite.exec('DELETE FROM activity');
	sqlite.exec('DELETE FROM session');
});

function session(id: string, startedAt: number) {
	sqlite
		.prepare(
			'INSERT INTO session (id, created_at, updated_at, device_id, started_at, kind) VALUES (?,?,?,?,?,?)'
		)
		.run(id, startedAt, startedAt, 'd', startedAt, 'practice');
}

/** A training recording as the watch kept it: the count reached after the shot it ends on. */
function recording(startedAt: number, arrowsAfter: number | null) {
	sqlite
		.prepare(
			`INSERT INTO wrist_motion
				(activity_id, stage_index, end_no, started_at, duration_ms, watch_key, data, received_at, arrows_after)
				VALUES ('training', 0, 0, ?, 1000, ?, 'x', ?, ?)`
		)
		.run(startedAt, startedAt, startedAt, arrowsAfter);
}

async function trainingCount(sessionId: string): Promise<number | null> {
	const activities = await listActivities(sessionId);
	const training = activities.find((a) => a.kind === 'training');
	return training ? training.arrowsShot : null;
}

describe('reconciling training counts from recordings', () => {
	it('raises a count the frozen page left behind to the largest recorded total', async () => {
		const t0 = 1_000_000;
		session('s', t0);
		await setTrainingArrows('s', 14);
		// The watch went on counting to 90 with the screen off; the recordings kept it, the count did not.
		for (let i = 1; i <= 90; i++) recording(t0 + i * 1000, i);

		expect(await reconcileTrainingArrowsFromRecordings()).toBe(1);
		expect(await trainingCount('s')).toBe(90);
	});

	it('creates the training activity when the session had none but was recorded', async () => {
		const t0 = 2_000_000;
		session('s', t0);
		recording(t0 + 1000, 42);

		await reconcileTrainingArrowsFromRecordings();
		expect(await trainingCount('s')).toBe(42);
	});

	it('never lowers a count, so an edit the archer made by hand stands', async () => {
		const t0 = 3_000_000;
		session('s', t0);
		await setTrainingArrows('s', 100);
		recording(t0 + 1000, 30);

		expect(await reconcileTrainingArrowsFromRecordings()).toBe(0);
		expect(await trainingCount('s')).toBe(100);
	});

	it('leaves a session with no recordings untouched', async () => {
		const t0 = 4_000_000;
		session('s', t0);
		await setTrainingArrows('s', 7);

		await reconcileTrainingArrowsFromRecordings();
		expect(await trainingCount('s')).toBe(7);
	});

	it('assigns recordings to the session they fell within, not a later one', async () => {
		const early = 5_000_000;
		const late = 6_000_000;
		session('early', early);
		session('late', late);
		// Recorded during the early session, before the late one began.
		recording(early + 1000, 20);
		recording(early + 2000, 21);
		// And one during the late session.
		recording(late + 1000, 5);

		await reconcileTrainingArrowsFromRecordings();
		expect(await trainingCount('early')).toBe(21);
		expect(await trainingCount('late')).toBe(5);
	});
});
