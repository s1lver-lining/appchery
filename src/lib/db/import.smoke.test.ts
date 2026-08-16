import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { MIGRATIONS } from './migrations';
import type { CapTargetPlan } from '$lib/import/captarget';

/**
 * Importing runs against a real SQLite, because what has to be true of it — that running the same
 * file twice leaves one copy of everything, and that it never touches what the archer typed in
 * himself — is a statement about rows, not about the plan the reader built.
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
	return { db: () => proxy, schema: actual };
});

// The repository reads a device id out of storage on every write, and node has none.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value)
});

const { importPlan } = await import('./repository');

beforeAll(() => {
	for (const group of MIGRATIONS) for (const statement of group) sqlite.exec(statement);
});

function plan(total: number): CapTargetPlan {
	return {
		sessions: [
			{
				externalId: 'sess-1',
				startedAt: Date.UTC(2026, 5, 19, 12),
				kind: 'practice',
				label: null,
				notes: 'CapTarget · 50m',
				trainingArrows: 30,
				totalArrows: 33,
				countedArrows: 3,
				unrecordedExercises: 0,
				activities: [
					{
						externalId: 'shoot-1',
						kind: 'scoring',
						startedAt: Date.UTC(2026, 5, 19, 12),
						round: {
							id: 'captarget-50-122-1x3',
							name: '50m · 122cm · 1x3',
							discipline: 'custom',
							scoreSetId: 'wa-10-ring',
							isBuiltin: false,
							stages: [{ distance: { value: 50, unit: 'm' }, faceSize: 122, ends: 1, arrowsPerEnd: 3 }]
						},
						ends: [
							{
								endNo: 1,
								shots: [
									{ value: 10, zoneLabel: 'X', x: 0.01, y: 0 },
									{ value: 10, zoneLabel: '10', x: null, y: null },
									{ value: total - 20, zoneLabel: String(total - 20), x: null, y: null }
								]
							}
						],
						reportedTotal: null,
						reportedArrows: 3,
						notes: null
					}
				]
			}
		],
		warnings: [],
		summary: { sessions: 1, rounds: 1, arrows: 30, from: 0, to: 0 }
	};
}

describe('importPlan', () => {
	it('dates the volume arrows the day they were shot, not the day of the import', async () => {
		await importPlan(plan(29));
		const training = (await proxy.select().from(schema.activity)).find((r) => r.kind === 'training')!;
		expect(training.startedAt).toBe(Date.UTC(2026, 5, 19, 12));
	});

	it('writes the session, the round and its arrows', async () => {
		const report = await importPlan(plan(29));
		expect(report.sessions).toBe(1);
		expect(report.activities).toBe(1);

		const activities = await proxy.select().from(schema.activity);
		const scoring = activities.find((row) => row.kind === 'scoring')!;
		expect(scoring.totalScore).toBe(29);
		expect(scoring.count10s).toBe(2);
		expect(scoring.countX).toBe(1);
		expect(scoring.status).toBe('complete');

		// The arrows the session recorded beyond the scored ones are kept as volume shooting.
		expect(activities.find((row) => row.kind === 'training')?.arrowsShot).toBe(30);

		const shots = await proxy.select().from(schema.shot);
		expect(shots).toHaveLength(3);
		expect(shots.find((s) => s.zoneLabel === 'X')?.source).toBe('plotted');
		expect(shots.find((s) => s.zoneLabel === '10')?.source).toBe('manual');
	});

	it('replaces rather than duplicates when the same file is imported again', async () => {
		const report = await importPlan(plan(27));
		expect(report.replaced).toBe(1);

		expect(await proxy.select().from(schema.session)).toHaveLength(1);
		const scoring = (await proxy.select().from(schema.activity)).filter((r) => r.kind === 'scoring');
		expect(scoring).toHaveLength(1);
		// The corrected score from the second file wins, and no arrow is left behind by the first.
		expect(scoring[0].totalScore).toBe(27);
		expect(await proxy.select().from(schema.shot)).toHaveLength(3);
	});

	it('sets the bow the archer chose on every imported session', async () => {
		const now = Date.now();
		await proxy.insert(schema.bow).values({
			id: 'bow-1',
			createdAt: now,
			updatedAt: now,
			deviceId: 'device',
			name: 'Club recurve',
			type: 'recurve'
		});

		await importPlan(plan(29), { bowId: 'bow-1' });
		const sessions = await proxy.select().from(schema.session);
		expect(sessions.every((row) => row.bowId === 'bow-1')).toBe(true);
	});

	it('writes scoring with no arrows as its own kind, never as a round', async () => {
		const scoreOnly = plan(29);
		const [session] = scoreOnly.sessions;
		session.externalId = 'sess-2';
		session.unrecordedExercises = 3;
		session.activities[0] = {
			...session.activities[0],
			externalId: 'situ-1',
			kind: 'freeScore',
			ends: [],
			reportedTotal: 104,
			reportedArrows: 11
		};

		await importPlan(scoreOnly);

		const activity = (await proxy.select().from(schema.activity)).find(
			(row) => row.id === 'imported:activity:situ-1'
		)!;
		expect(activity.kind).toBe('freeScore');
		expect(activity.totalScore).toBe(104);
		expect(activity.arrowsShot).toBe(11);
		// No round definition, so nothing downstream can read it as a round that was shot.
		expect(activity.roundDefinition).toBeNull();
		expect(JSON.parse(activity.measurements!)).toEqual({ distance: 50, unit: 'm', faceSize: 122 });

		// The exercises the export kept no arrows for are said in words rather than invented.
		const session2 = (await proxy.select().from(schema.session)).find(
			(row) => row.id === 'imported:session:sess-2'
		)!;
		expect(session2.notes).toContain('3 exercises');
	});

	it('leaves sessions the archer created alone', async () => {
		const now = Date.now();
		await proxy.insert(schema.session).values({
			id: 'mine',
			createdAt: now,
			updatedAt: now,
			deviceId: 'device',
			startedAt: now,
			kind: 'practice'
		});

		await importPlan(plan(30));

		const mine = await proxy.select().from(schema.session).where(eq(schema.session.id, 'mine'));
		expect(mine).toHaveLength(1);
	});
});
