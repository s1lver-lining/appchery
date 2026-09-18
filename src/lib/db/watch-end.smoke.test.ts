import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import { MIGRATIONS } from './migrations';

/**
 * Putting an end exactly as given, against a real SQLite. The caller is a link that may deliver the
 * same end twice, later than it was sent, or one arrow shorter than last time, so what has to be
 * true is that the record ends up the same either way and that nothing else in it moves.
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

const { replaceEnd, removeEndAt, listEnds, listShots, setTrainingArrows, addTrainingArrows } =
	await import('./repository');

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

beforeEach(() => {
	sqlite.exec('DELETE FROM change_log');
	sqlite.exec('DELETE FROM shot');
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
		.run('a', now, now, 'd', 's', 'round', now);
});

const SIX = [
	{ ordinal: 1, value: 10, zoneLabel: 'X' },
	{ ordinal: 2, value: 10, zoneLabel: '10' },
	{ ordinal: 3, value: 9, zoneLabel: '9' },
	{ ordinal: 4, value: 9, zoneLabel: '9' },
	{ ordinal: 5, value: 8, zoneLabel: '8' },
	{ ordinal: 6, value: 7, zoneLabel: '7' }
];

async function activityRow() {
	const rows = await proxy.select().from(schema.activity);
	return rows[0];
}

describe('putting an end', () => {
	it('records a new end with its arrows and subtotal', async () => {
		await replaceEnd('a', 0, 1, SIX);

		const ends = await listEnds('a');
		expect(ends).toHaveLength(1);
		expect(ends[0].subtotal).toBe(53);

		const shots = await listShots(ends[0].id);
		expect(shots.map((s) => s.zoneLabel)).toEqual(['X', '10', '9', '9', '8', '7']);
		expect(shots.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('refreshes the activity totals from the arrows it stored', async () => {
		await replaceEnd('a', 0, 1, SIX);
		const activity = await activityRow();
		expect(activity.totalScore).toBe(53);
		expect(activity.arrowsShot).toBe(6);
		// An X is a ten as well, so both are counted and the tens include it.
		expect(activity.count10s).toBe(2);
		expect(activity.countX).toBe(1);
	});

	// The whole point: a link that delivers the same end twice must not double it.
	it('is idempotent', async () => {
		await replaceEnd('a', 0, 1, SIX);
		const first = (await listEnds('a'))[0].id;
		await replaceEnd('a', 0, 1, SIX);

		const ends = await listEnds('a');
		expect(ends).toHaveLength(1);
		expect(ends[0].id).toBe(first);
		expect(await listShots(first)).toHaveLength(6);
		expect((await activityRow()).arrowsShot).toBe(6);
	});

	it('keeps ends at different positions apart', async () => {
		await replaceEnd('a', 0, 1, SIX.slice(0, 3));
		await replaceEnd('a', 0, 2, SIX.slice(0, 2));
		await replaceEnd('a', 1, 1, SIX.slice(0, 1));
		expect(await listEnds('a')).toHaveLength(3);
		expect((await activityRow()).arrowsShot).toBe(6);
	});
});

describe('editing and shortening', () => {
	it('changes one arrow and the subtotal with it', async () => {
		await replaceEnd('a', 0, 1, SIX);
		const edited = [...SIX];
		edited[5] = { ordinal: 6, value: 10, zoneLabel: '10' };
		await replaceEnd('a', 0, 1, edited);

		const ends = await listEnds('a');
		expect(ends[0].subtotal).toBe(56);
		const shots = await listShots(ends[0].id);
		expect(shots).toHaveLength(6);
		expect(shots[5].zoneLabel).toBe('10');
		expect((await activityRow()).totalScore).toBe(56);
	});

	it('drops the arrow that was taken back', async () => {
		await replaceEnd('a', 0, 1, SIX);
		await replaceEnd('a', 0, 1, SIX.slice(0, 5));

		const ends = await listEnds('a');
		const shots = await listShots(ends[0].id);
		expect(shots).toHaveLength(5);
		expect(ends[0].subtotal).toBe(46);
		expect((await activityRow()).arrowsShot).toBe(5);
	});

	it('takes an end down to one arrow and back up again', async () => {
		await replaceEnd('a', 0, 1, SIX);
		await replaceEnd('a', 0, 1, SIX.slice(0, 1));
		expect(await listShots((await listEnds('a'))[0].id)).toHaveLength(1);

		await replaceEnd('a', 0, 1, SIX);
		const shots = await listShots((await listEnds('a'))[0].id);
		expect(shots).toHaveLength(6);
		expect(shots.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	/**
	 * A plotted arrow carries a position the wire knows nothing about. Re-sending the end it sits in
	 * must leave it alone, or a link with nothing new to say would quietly erase the plotting.
	 */
	it('leaves a plotted arrow its position when nothing about it changed', async () => {
		await replaceEnd('a', 0, 1, SIX);
		const endId = (await listEnds('a'))[0].id;
		const plotted = (await listShots(endId))[2];
		sqlite
			.prepare("UPDATE shot SET x = 0.1, y = -0.2, source = 'plotted' WHERE id = ?")
			.run(plotted.id);

		await replaceEnd('a', 0, 1, SIX);

		const after = (await listShots(endId))[2];
		expect(after.x).toBeCloseTo(0.1);
		expect(after.y).toBeCloseTo(-0.2);
		expect(after.source).toBe('plotted');
	});

	it('clears the position when that arrow really did change', async () => {
		await replaceEnd('a', 0, 1, SIX);
		const endId = (await listEnds('a'))[0].id;
		const plotted = (await listShots(endId))[2];
		sqlite
			.prepare("UPDATE shot SET x = 0.1, y = -0.2, source = 'plotted' WHERE id = ?")
			.run(plotted.id);

		const edited = [...SIX];
		edited[2] = { ordinal: 3, value: 7, zoneLabel: '7' };
		await replaceEnd('a', 0, 1, edited);

		const after = (await listShots(endId))[2];
		expect(after.zoneLabel).toBe('7');
		expect(after.x).toBeNull();
		expect(after.source).toBe('manual');
	});
});

describe('removing an end', () => {
	it('takes the end and its arrows with it', async () => {
		await replaceEnd('a', 0, 1, SIX);
		expect(await removeEndAt('a', 0, 1)).toBe(true);

		expect(await listEnds('a')).toHaveLength(0);
		expect((await activityRow()).arrowsShot).toBe(0);
		expect((await activityRow()).totalScore).toBe(0);
	});

	it('says so when there was never an end there', async () => {
		expect(await removeEndAt('a', 0, 9)).toBe(false);
	});

	it('leaves the other ends alone', async () => {
		await replaceEnd('a', 0, 1, SIX);
		await replaceEnd('a', 0, 2, SIX.slice(0, 3));
		await removeEndAt('a', 0, 1);

		const ends = await listEnds('a');
		expect(ends).toHaveLength(1);
		expect(ends[0].endNo).toBe(2);
		expect((await activityRow()).arrowsShot).toBe(3);
	});
});

describe('the change log', () => {
	it('records what a new end did, so sync can replay it', async () => {
		await replaceEnd('a', 0, 1, SIX);
		const rows = sqlite.prepare('SELECT table_name, op FROM change_log').all() as {
			table_name: string;
			op: string;
		}[];
		expect(rows.filter((r) => r.table_name === 'round_end' && r.op === 'insert')).toHaveLength(1);
		expect(rows.filter((r) => r.table_name === 'shot' && r.op === 'insert')).toHaveLength(6);
	});

	it('records the arrow that was taken back as a delete', async () => {
		await replaceEnd('a', 0, 1, SIX);
		sqlite.exec('DELETE FROM change_log');
		await replaceEnd('a', 0, 1, SIX.slice(0, 5));

		const rows = sqlite.prepare('SELECT table_name, op FROM change_log').all() as {
			table_name: string;
			op: string;
		}[];
		expect(rows.filter((r) => r.table_name === 'shot' && r.op === 'delete')).toHaveLength(1);
	});
});

describe('the session training arrows', () => {
	async function training() {
		const rows = await proxy.select().from(schema.activity);
		return rows.find((row) => row.kind === 'training') ?? null;
	}

	it('creates the counter on the first figure', async () => {
		expect(await setTrainingArrows('s', 12)).toBe(12);
		expect((await training())?.arrowsShot).toBe(12);
	});

	it('sets the figure rather than adding to it', async () => {
		await setTrainingArrows('s', 12);
		expect(await setTrainingArrows('s', 18)).toBe(18);
		expect((await training())?.arrowsShot).toBe(18);
	});

	// The whole reason a total travels instead of a difference.
	it('is idempotent where adding would double', async () => {
		await setTrainingArrows('s', 18);
		await setTrainingArrows('s', 18);
		expect((await training())?.arrowsShot).toBe(18);

		await addTrainingArrows('s', 6);
		await addTrainingArrows('s', 6);
		expect((await training())?.arrowsShot).toBe(30);
	});

	it('writes nothing when the figure already matches', async () => {
		await setTrainingArrows('s', 18);
		sqlite.exec('DELETE FROM change_log');
		await setTrainingArrows('s', 18);
		const rows = sqlite.prepare('SELECT count(*) AS n FROM change_log').all() as { n: number }[];
		expect(rows[0].n).toBe(0);
	});

	it('can take the count back down to nothing', async () => {
		await setTrainingArrows('s', 18);
		expect(await setTrainingArrows('s', 0)).toBe(0);
		expect((await training())?.arrowsShot).toBe(0);
	});

	it('creates nothing for a figure of nothing', async () => {
		expect(await setTrainingArrows('s', 0)).toBe(0);
		expect(await training()).toBeNull();
	});
});
