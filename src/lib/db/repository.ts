import { eq, and, isNull, isNotNull, desc, asc, inArray, like } from 'drizzle-orm';
import { getTableName } from 'drizzle-orm';
import { db, schema, tableNames, transaction } from './index';
import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
import { sumShots, countLabel, isRoundComplete } from '$lib/domain/rounds/geometry';
import { evaluateBadges, type BadgeEnd, type BadgeInput } from '$lib/domain/badges';
import type { XpActivity, XpInput } from '$lib/domain/experience';
import { weekArrowGoalOn, onlyActive } from '$lib/domain/plans';
import { shootsArrows } from '$lib/domain/stats';
import {
	parseConfig,
	tally,
	arrowsShot,
	matchScore,
	wonFromBehind,
	gatherNames,
	type MatchConfig,
	type MatchEnd
} from '$lib/domain/matches';
import type { CapTargetPlan } from '$lib/import/captarget';
import {
	STRENGTH_KIND,
	isStrengthDone,
	parseStrength,
	serialiseStrength,
	setsDone,
	type StrengthPlan
} from '$lib/domain/strength';
import { RUNNING_KIND, isRunDone, parseRun, serialiseRun, type RunRecord } from '$lib/domain/running';
import {
	FREE_SCORE_KIND,
	FREE_SCORE_LIMITS,
	clampFreeScore,
	serialiseFreeScore,
	type FreeScoreSetup
} from '$lib/domain/freeScore';
import {
	DRILL_KIND,
	countsOwnArrows,
	isDrillDone,
	serialiseDrill,
	type Drill,
	type DrillShot
} from '$lib/domain/drills';
import { LIMITS, safeCount, safeText } from '$lib/import/limits';

// All persistence goes through here so every mutation reaches change_log and soft deletes stay hidden.

const DEVICE_KEY = 'appchery.deviceId';

export function deviceId(): string {
	let id = localStorage.getItem(DEVICE_KEY);
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem(DEVICE_KEY, id);
	}
	return id;
}

function stamp() {
	const now = Date.now();
	return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, deviceId: deviceId() };
}

async function log(table: string, rowId: string, op: 'insert' | 'update' | 'delete') {
	await db()
		.insert(schema.changeLog)
		.values({ tableName: table, rowId, op, changedAt: Date.now(), syncedAt: null });
}

/**
 * Entries for rows taken away for real rather than tombstoned. A row that is simply gone announces
 * nothing: left behind, the entry is read by every push, never sent, and never stops being counted
 * as a change the archer is waiting on.
 */
async function forgetLog(table: string, rowIds: string[]) {
	for (let i = 0; i < rowIds.length; i += 100) {
		await db()
			.delete(schema.changeLog)
			.where(
				and(
					eq(schema.changeLog.tableName, table),
					inArray(schema.changeLog.rowId, rowIds.slice(i, i + 100))
				)
			);
	}
}

async function logMany(table: string, rowIds: string[], op: 'insert' | 'update' | 'delete') {
	if (rowIds.length === 0) return;
	const changedAt = Date.now();
	await db()
		.insert(schema.changeLog)
		.values(rowIds.map((rowId) => ({ tableName: table, rowId, op, changedAt, syncedAt: null })));
}

export type SessionRow = Awaited<ReturnType<typeof listSessions>>[number];
export type ActivityRow = Awaited<ReturnType<typeof listActivities>>[number];
export type EndRow = Awaited<ReturnType<typeof listEnds>>[number];
export type ShotRow = Awaited<ReturnType<typeof listShots>>[number];
export type BowRow = Awaited<ReturnType<typeof listBows>>[number];

/* Sessions */

export async function createSession(input: {
	label?: string;
	kind?: string;
	bowId?: string | null;
	bowType?: string | null;
	location?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	weather?: string | null;
}) {
	const base = stamp();
	await db()
		.insert(schema.session)
		.values({
			...base,
			label: input.label ?? null,
			startedAt: base.createdAt,
			kind: input.kind ?? 'practice',
			bowId: input.bowId ?? null,
			bowType: input.bowType ?? null,
			location: input.location ?? null,
			latitude: input.latitude ?? null,
			longitude: input.longitude ?? null,
			weather: input.weather ?? null
		});
	await log('session', base.id, 'insert');
	return base.id;
}

export async function listSessions() {
	return db()
		.select()
		.from(schema.session)
		.where(isNull(schema.session.deletedAt))
		.orderBy(desc(schema.session.startedAt));
}

export async function getSession(id: string): Promise<SessionRow | null> {
	const rows = await db().select().from(schema.session).where(eq(schema.session.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function updateSession(
	id: string,
	patch: Partial<{
		label: string | null;
		kind: string;
		startedAt: number;
		arrowGoal: number | null;
		bowId: string | null;
		bowType: string | null;
		location: string | null;
		latitude: number | null;
		longitude: number | null;
		weather: string | null;
		notes: string | null;
	}>
) {
	if ('arrowGoal' in patch) patch = { ...patch, arrowGoal: safeGoal(patch.arrowGoal) };
	await db()
		.update(schema.session)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(schema.session.id, id));
	await log('session', id, 'update');
}

export async function deleteSession(id: string) {
	const now = Date.now();
	await db()
		.update(schema.session)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(schema.session.id, id));
	await log('session', id, 'delete');
}

/**
 * The ids of `ids` that are really there and in the state the caller means to change. A selection is
 * made on screen and acted on a moment later, and an import can hard delete and rewrite rows under
 * it in between, so the batch is narrowed to what exists before anything is written or logged: the
 * change log is what a sync sends, and a row that never moved must not be announced as if it had.
 */
async function presentIds(
	table: typeof schema.session | typeof schema.activity,
	ids: string[],
	state: 'live' | 'deleted'
): Promise<string[]> {
	const rows = await db()
		.select({ id: table.id })
		.from(table)
		.where(
			and(
				inArray(table.id, ids),
				state === 'live' ? isNull(table.deletedAt) : isNotNull(table.deletedAt)
			)
		);
	return rows.map((row) => row.id);
}

// One statement, one log row per row that moved: a batch reaches a sync as the rows it really took.
export async function deleteSessions(ids: string[]) {
	if (ids.length === 0) return;
	await transaction(async () => {
		const present = await presentIds(schema.session, ids, 'live');
		if (present.length === 0) return;
		const now = Date.now();
		await db()
			.update(schema.session)
			.set({ deletedAt: now, updatedAt: now })
			.where(inArray(schema.session.id, present));
		await logMany('session', present, 'delete');
	});
}

export async function restoreSessions(ids: string[]) {
	if (ids.length === 0) return;
	await transaction(async () => {
		const present = await presentIds(schema.session, ids, 'deleted');
		if (present.length === 0) return;
		await db()
			.update(schema.session)
			.set({ deletedAt: null, updatedAt: Date.now() })
			.where(inArray(schema.session.id, present));
		await logMany('session', present, 'update');
	});
}

/** A generic type and a bow of one's own are exclusive, so both columns are written together. */
export async function setSessionsBow(
	ids: string[],
	value: { bowId: string | null; bowType: string | null }
) {
	if (ids.length === 0) return;
	await transaction(async () => {
		const present = await presentIds(schema.session, ids, 'live');
		if (present.length === 0) return;
		await db()
			.update(schema.session)
			.set({ ...value, updatedAt: Date.now() })
			.where(inArray(schema.session.id, present));
		await logMany('session', present, 'update');
	});
}

/* Activities */

/**
 * A planned session is one that has not happened yet, so the first activity in it makes it an
 * ordinary practice: nothing else distinguishes the two once arrows exist.
 */
async function unplan(sessionId: string) {
	const [session] = await db()
		.select()
		.from(schema.session)
		.where(eq(schema.session.id, sessionId));
	if (session?.kind !== 'planned') return;
	await db()
		.update(schema.session)
		.set({ kind: 'practice', updatedAt: Date.now() })
		.where(eq(schema.session.id, sessionId));
	await log('session', sessionId, 'update');
}

export async function createScoringActivity(sessionId: string, round: RoundDefinition) {
	await unplan(sessionId);
	const base = stamp();
	await db()
		.insert(schema.activity)
		.values({
			...base,
			sessionId,
			kind: 'scoring',
			roundDefinitionId: round.isBuiltin ? round.id : null,
			// Snapshot the definition so later edits cannot rewrite a round already shot.
			roundDefinition: JSON.stringify(round),
			startedAt: base.createdAt,
			status: 'in_progress'
		});
	await log('activity', base.id, 'insert');
	return base.id;
}

/**
 * Scoring nobody wrote down arrow by arrow, see src/lib/domain/freeScore.ts. It carries no round
 * definition on purpose: what makes it safe to keep a score on is that nothing can mistake it for
 * a round, and a round definition is exactly what everything else looks for.
 */
export async function createFreeScoreActivity(sessionId: string, setup: FreeScoreSetup) {
	await unplan(sessionId);
	const base = stamp();
	await db().insert(schema.activity).values({
		...base,
		sessionId,
		kind: FREE_SCORE_KIND,
		measurements: serialiseFreeScore(setup),
		startedAt: base.createdAt,
		status: 'in_progress'
	});
	await log('activity', base.id, 'insert');
	return base.id;
}

/**
 * The two figures this kind of activity is made of. Written straight to the columns rather than
 * derived from arrows, because there are no arrows to derive them from: that is the whole point.
 */
export async function updateFreeScore(
	activityId: string,
	patch: { arrowsShot?: number; totalScore?: number; setup?: FreeScoreSetup }
) {
	await db()
		.update(schema.activity)
		.set({
			...(patch.arrowsShot === undefined
				? {}
				: { arrowsShot: clampFreeScore(patch.arrowsShot, FREE_SCORE_LIMITS.arrows) }),
			...(patch.totalScore === undefined
				? {}
				: { totalScore: clampFreeScore(patch.totalScore, FREE_SCORE_LIMITS.score) }),
			...(patch.setup === undefined ? {} : { measurements: serialiseFreeScore(patch.setup) }),
			// Complete the moment it holds anything: there is no last arrow to wait for.
			status: 'complete',
			updatedAt: Date.now()
		})
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
}

/**
 * Strength work and running: activities that shoot nothing.
 *
 * Both keep what they are in the measurements column rather than in a column of their own, the same
 * as free scoring does. Nothing in the app reads that column without knowing which kind of activity
 * it belongs to, so a new kind of training costs no migration and no change to what syncs.
 *
 * Neither ever writes arrowsShot or totalScore. They stay at zero, which is what keeps a session of
 * bandwork out of every arrow figure the app keeps.
 */
export async function createStrengthActivity(sessionId: string, plan: StrengthPlan) {
	await unplan(sessionId);
	const base = stamp();
	await db().insert(schema.activity).values({
		...base,
		sessionId,
		kind: STRENGTH_KIND,
		measurements: serialiseStrength(plan),
		startedAt: base.createdAt,
		status: 'in_progress'
	});
	await log('activity', base.id, 'insert');
	return base.id;
}

/** Complete once the last set is ticked, and back in progress if one is unticked again. */
export async function updateStrengthPlan(activityId: string, plan: StrengthPlan) {
	await db()
		.update(schema.activity)
		.set({
			measurements: serialiseStrength(plan),
			status: isStrengthDone(plan) ? 'complete' : 'in_progress',
			updatedAt: Date.now()
		})
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
}

export async function createRunningActivity(sessionId: string, run: RunRecord) {
	await unplan(sessionId);
	const base = stamp();
	await db().insert(schema.activity).values({
		...base,
		sessionId,
		kind: RUNNING_KIND,
		measurements: serialiseRun(run),
		startedAt: base.createdAt,
		status: isRunDone(run) ? 'complete' : 'in_progress'
	});
	await log('activity', base.id, 'insert');
	return base.id;
}

export async function updateRun(activityId: string, run: RunRecord) {
	await db()
		.update(schema.activity)
		.set({
			measurements: serialiseRun(run),
			status: isRunDone(run) ? 'complete' : 'in_progress',
			updatedAt: Date.now()
		})
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
}

/**
 * A drill: shooting to a rule rather than to a round, see src/lib/domain/drills/types.ts.
 *
 * Its arrows go in the ordinary end and shot rows, which is what gives it plotting, the camera, the
 * score sheet and sync without a line of its own. What it never carries is a round definition: the
 * rule it was shot to lives in measurements, because anything that finds a round definition treats
 * what it found as a round, and a drill read as a round would join averages and personal bests.
 */
export async function createDrillActivity(sessionId: string, drill: Drill) {
	await unplan(sessionId);
	const base = stamp();
	await db().insert(schema.activity).values({
		...base,
		sessionId,
		kind: DRILL_KIND,
		measurements: serialiseDrill(drill),
		startedAt: base.createdAt,
		status: 'in_progress'
	});
	await log('activity', base.id, 'insert');
	return base.id;
}

/** Every arrow of a drill in the order it was shot, which is the order its rule reads them in. */
export async function loadDrillShots(activityId: string): Promise<DrillShot[]> {
	const { ends, shotsByEnd } = await loadSheet(activityId);
	return ends.flatMap((one) =>
		(shotsByEnd.get(one.id) ?? []).map((shot) => ({
			// The place in its end is the number written on the shaft, which is what sorting reads.
			ordinal: shot.ordinal,
			value: shot.value,
			zoneLabel: shot.zoneLabel,
			x: shot.x,
			y: shot.y
		}))
	);
}

/**
 * Whether a drill is finished is asked of its arrows rather than remembered: an arrow corrected on
 * the sheet can reopen a drill that its own rule had ended.
 *
 * A drill shot at no face has no shot rows to count, so its tally is written to the arrow column
 * here. Arrows shot are arrows shot, and leaving them out would lose them from the volume.
 */
export async function updateDrill(activityId: string, drill: Drill) {
	const shots = await loadDrillShots(activityId);
	const counted = countsOwnArrows(drill) ? { arrowsShot: drill.state.blindArrows } : {};
	await db()
		.update(schema.activity)
		.set({
			...counted,
			measurements: serialiseDrill(drill),
			status: isDrillDone(drill, shots) ? 'complete' : 'in_progress',
			updatedAt: Date.now()
		})
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
}

export async function createTuningActivity(sessionId: string, templateKey: string) {
	await unplan(sessionId);
	const base = stamp();
	await db().insert(schema.activity).values({
		...base,
		sessionId,
		kind: 'tuning',
		templateKey,
		startedAt: base.createdAt,
		status: 'in_progress'
	});
	await log('activity', base.id, 'insert');
	return base.id;
}

/**
 * Arrows shot without scoring them, kept in one activity per session so the counter has somewhere to
 * live. They count towards volume everywhere and never reach a score, which is the point of them.
 *
 * The figure is typed into a plain number field, so it arrives as whatever was typed and is bounded
 * and rounded like an imported one: half an arrow is not a thing anybody shot, and a billion of them
 * wins every volume badge at once.
 */
export async function addTrainingArrows(sessionId: string, delta: number) {
	await unplan(sessionId);
	const [existing] = await db()
		.select()
		.from(schema.activity)
		.where(
			and(
				eq(schema.activity.sessionId, sessionId),
				eq(schema.activity.kind, 'training'),
				isNull(schema.activity.deletedAt)
			)
		);

	const now = Date.now();
	if (!existing) {
		const opening = safeCount(delta, LIMITS.arrows);
		if (opening <= 0) return 0;
		const base = stamp();
		await db()
			.insert(schema.activity)
			.values({
				...base,
				sessionId,
				kind: 'training',
				startedAt: base.createdAt,
				arrowsShot: opening,
				status: 'complete'
			});
		await log('activity', base.id, 'insert');
		return opening;
	}

	const next = safeCount(existing.arrowsShot + delta, LIMITS.arrows);
	await db()
		.update(schema.activity)
		.set({ arrowsShot: next, updatedAt: now })
		.where(eq(schema.activity.id, existing.id));
	await log('activity', existing.id, 'update');
	return next;
}

export async function listActivities(sessionId: string) {
	return db()
		.select()
		.from(schema.activity)
		.where(and(eq(schema.activity.sessionId, sessionId), isNull(schema.activity.deletedAt)))
		.orderBy(asc(schema.activity.startedAt));
}

/**
 * The activities any figure may still be read from. A delete cascades to nothing so that a restore
 * can be exact, which leaves the rows of a deleted outing sitting in the tables: whatever reads them
 * whole has to ask for the ones whose session is still there, or the totals go on counting an outing
 * that is no longer in the list.
 */
function liveActivities() {
	const liveSessions = db()
		.select({ id: schema.session.id })
		.from(schema.session)
		.where(isNull(schema.session.deletedAt));
	return db()
		.select({ id: schema.activity.id })
		.from(schema.activity)
		.where(and(isNull(schema.activity.deletedAt), inArray(schema.activity.sessionId, liveSessions)));
}

/** Every activity still standing, anywhere in the history. */
export async function listAllActivities() {
	return db()
		.select()
		.from(schema.activity)
		.where(inArray(schema.activity.id, liveActivities()))
		.orderBy(desc(schema.activity.startedAt));
}

export async function getActivity(id: string): Promise<ActivityRow | null> {
	const rows = await db().select().from(schema.activity).where(eq(schema.activity.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function updateActivity(
	id: string,
	patch: Partial<{
		observations: string | null;
		conclusion: string | null;
		adjustmentMade: string | null;
		notes: string | null;
		status: string;
		measurements: string | null;
	}>
) {
	await db()
		.update(schema.activity)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(schema.activity.id, id));
	await log('activity', id, 'update');
}

export async function deleteActivity(id: string) {
	const now = Date.now();
	await db()
		.update(schema.activity)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(schema.activity.id, id));
	await log('activity', id, 'delete');
}

/**
 * Shared, or not shared. Who can then see it is the profile's business and the block list's, so this
 * is one flag rather than a row per viewer, and unsharing revokes because nothing was ever copied.
 */
export async function setActivityShared(id: string, shared: boolean) {
	const now = Date.now();
	await db()
		.update(schema.activity)
		.set({ sharedAt: shared ? now : null, updatedAt: now })
		.where(eq(schema.activity.id, id));
	await log('activity', id, 'update');
}

/** A selection removed at once, narrowed and logged for the same reason `deleteSessions` is. */
export async function deleteActivities(ids: string[]) {
	if (ids.length === 0) return;
	await transaction(async () => {
		const present = await presentIds(schema.activity, ids, 'live');
		if (present.length === 0) return;
		const now = Date.now();
		await db()
			.update(schema.activity)
			.set({ deletedAt: now, updatedAt: now })
			.where(inArray(schema.activity.id, present));
		await logMany('activity', present, 'delete');
	});
}

export async function restoreActivities(ids: string[]) {
	if (ids.length === 0) return;
	await transaction(async () => {
		const present = await presentIds(schema.activity, ids, 'deleted');
		if (present.length === 0) return;
		await db()
			.update(schema.activity)
			.set({ deletedAt: null, updatedAt: Date.now() })
			.where(inArray(schema.activity.id, present));
		await logMany('activity', present, 'update');
	});
}

/**
 * Putting back what a delete took away. Deletes are soft and cascade to nothing, so a restore is
 * exact rather than a rebuild: the row goes back the way it was, with everything still hanging off it.
 */
export async function restoreSession(id: string) {
	await db()
		.update(schema.session)
		.set({ deletedAt: null, updatedAt: Date.now() })
		.where(eq(schema.session.id, id));
	await log('session', id, 'update');
}

export async function restoreActivity(id: string) {
	await db()
		.update(schema.activity)
		.set({ deletedAt: null, updatedAt: Date.now() })
		.where(eq(schema.activity.id, id));
	await log('activity', id, 'update');
}

/* Ends and shots */

export async function listEnds(activityId: string) {
	return db()
		.select()
		.from(schema.end)
		.where(and(eq(schema.end.activityId, activityId), isNull(schema.end.deletedAt)))
		.orderBy(asc(schema.end.stageIndex), asc(schema.end.endNo));
}

export async function listShots(endId: string) {
	return db()
		.select()
		.from(schema.shot)
		.where(and(eq(schema.shot.endId, endId), isNull(schema.shot.deletedAt)))
		.orderBy(asc(schema.shot.ordinal));
}

export interface SheetData {
	ends: EndRow[];
	shotsByEnd: Map<string, ShotRow[]>;
}

/**
 * Loads a whole score sheet in two queries. Reading shots per end was an N+1 that made every commit
 * and undo visibly lag on a round with a dozen ends.
 */
export async function loadSheet(activityId: string): Promise<SheetData> {
	const ends = await listEnds(activityId);
	if (ends.length === 0) return { ends, shotsByEnd: new Map() };

	const rows = await db()
		.select()
		.from(schema.shot)
		.where(
			and(
				inArray(
					schema.shot.endId,
					ends.map((e) => e.id)
				),
				isNull(schema.shot.deletedAt)
			)
		)
		.orderBy(asc(schema.shot.ordinal));

	const shotsByEnd = new Map<string, ShotRow[]>();
	for (const row of rows) {
		const bucket = shotsByEnd.get(row.endId);
		if (bucket) bucket.push(row);
		else shotsByEnd.set(row.endId, [row]);
	}
	return { ends, shotsByEnd };
}

export async function recordEnd(
	activityId: string,
	stageIndex: number,
	endNo: number,
	shots: Omit<Shot, 'ordinal'>[],
	video: string | null = null,
	/** The bow setting the end was shot at, for a procedure that compares groups across one. */
	settingValue: number | null = null
) {
	const endBase = stamp();
	// The whole end as one commit: it is the write the archer waits on between every group of arrows.
	return transaction(async () => {
		await db()
			.insert(schema.end)
			.values({
				...endBase,
				activityId,
				stageIndex,
				endNo,
				subtotal: shots.reduce((sum, s) => sum + s.value, 0),
				video,
				settingValue
			});
		await log('round_end', endBase.id, 'insert');

		const rows = shots.map((s, index) => ({
			...stamp(),
			endId: endBase.id,
			ordinal: index + 1,
			value: s.value,
			zoneLabel: s.zoneLabel,
			x: s.x,
			y: s.y,
			source: s.source
		}));
		await db().insert(schema.shot).values(rows);
		await logMany('shot', rows.map((r) => r.id), 'insert');

		await refreshActivityTotals(activityId);
		return endBase.id;
	});
}

/** Editing a recorded arrow, from tapping it on the score sheet. */
export async function updateShot(
	shotId: string,
	endId: string,
	activityId: string,
	zone: Zone,
	plot?: { x: number; y: number }
) {
	await db()
		.update(schema.shot)
		.set({
			value: zone.value,
			zoneLabel: zone.label,
			x: plot?.x ?? null,
			y: plot?.y ?? null,
			source: plot ? 'plotted' : 'manual',
			updatedAt: Date.now()
		})
		.where(eq(schema.shot.id, shotId));
	await log('shot', shotId, 'update');

	const shots = await listShots(endId);
	await db()
		.update(schema.end)
		.set({ subtotal: shots.reduce((sum, s) => sum + s.value, 0), updatedAt: Date.now() })
		.where(eq(schema.end.id, endId));
	await log('round_end', endId, 'update');

	await refreshActivityTotals(activityId);
}

// Totals are recomputed from stored shots, never incremented, so an edited end cannot leave them drifting.
export async function refreshActivityTotals(activityId: string) {
	const { ends, shotsByEnd } = await loadSheet(activityId);
	const all: Shot[] = ends.flatMap((e) =>
		(shotsByEnd.get(e.id) ?? []).map((r) => ({
			ordinal: r.ordinal,
			value: r.value,
			zoneLabel: r.zoneLabel,
			x: r.x,
			y: r.y,
			source: r.source as Shot['source']
		}))
	);

	await db()
		.update(schema.activity)
		.set({
			totalScore: sumShots(all),
			// An X is also a ten, so counting them separately would understate the tens.
			count10s: countLabel(all, '10') + countLabel(all, 'X'),
			countX: countLabel(all, 'X'),
			arrowsShot: all.length,
			updatedAt: Date.now()
		})
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
}

/* Matches */

/**
 * A head to head match. It is an activity like any other so it lands in the session it was shot in,
 * but it carries its rules rather than a round: there is no round to shoot, only somebody to beat.
 */
export async function createMatchActivity(sessionId: string, config: MatchConfig) {
	await unplan(sessionId);
	const base = stamp();
	await db().insert(schema.activity).values({
		...base,
		sessionId,
		kind: 'match',
		matchConfig: JSON.stringify(config),
		startedAt: base.createdAt,
		status: 'in_progress'
	});
	await log('activity', base.id, 'insert');
	return base.id;
}

export async function updateMatchConfig(activityId: string, config: MatchConfig) {
	await db()
		.update(schema.activity)
		.set({ matchConfig: JSON.stringify(config), updatedAt: Date.now() })
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
	// The rules decide what counts as shot, so changing them changes the totals underneath.
	await refreshMatchTotals(activityId);
}

/**
 * One end of a match, both sides at once. Ends are written by number rather than appended, so an end
 * corrected after the match is over lands on the row it belongs to and the result follows it.
 */
export async function saveMatchEnd(
	activityId: string,
	endNo: number,
	input: { ours: number | null; theirs: number | null; shootOff?: boolean; winner?: 'us' | 'them' | null }
) {
	// Serialised like the other match writers, or two writes racing for a new end each find it
	// missing and each insert one.
	await transaction(async () => {
		const end = await ensureMatchEnd(activityId, endNo, input.shootOff);
		await db()
			.update(schema.end)
			.set({
				subtotal: input.ours ?? 0,
				opponentSubtotal: input.theirs,
				isShootOff: input.shootOff ? 1 : 0,
				winner: input.winner ?? null,
				updatedAt: Date.now()
			})
			.where(eq(schema.end.id, end.id));
		await log('round_end', end.id, 'update');
		await refreshMatchTotals(activityId);
	});
}

/** The row an end is written to, created on first use: entering anything is what starts an end. */
async function ensureMatchEnd(activityId: string, endNo: number, shootOff = false) {
	const existing = (await listEnds(activityId)).find((row) => row.endNo === endNo);
	if (existing) return existing;
	const base = stamp();
	await db()
		.insert(schema.end)
		.values({ ...base, activityId, stageIndex: 0, endNo, isShootOff: shootOff ? 1 : 0 });
	await log('round_end', base.id, 'insert');
	return (await listEnds(activityId)).find((row) => row.endNo === endNo)!;
}

async function clearSideArrows(endId: string, side: 'us' | 'them') {
	const previous = (await listShots(endId)).filter((shot) => shot.side === side);
	if (previous.length === 0) return;
	const now = Date.now();
	await db()
		.update(schema.shot)
		.set({ deletedAt: now, updatedAt: now })
		.where(
			inArray(
				schema.shot.id,
				previous.map((shot) => shot.id)
			)
		);
	await logMany('shot', previous.map((shot) => shot.id), 'delete');
}

/**
 * A side's total, typed rather than shot in. The arrows of that side go with it: a total entered by
 * hand is the archer saying the arrows do not matter, and two sources for one number is one too many.
 */
export async function setMatchEndTotal(
	activityId: string,
	endNo: number,
	side: 'us' | 'them',
	total: number | null,
	shootOff = false
) {
	// Serialised, or the two sides of a new end each find it missing and each insert one.
	await transaction(async () => {
		// Our side carries the end: emptying its total is emptying the end, not scoring it nothing.
		if (side === 'us' && total === null) return removeMatchEnd(activityId, endNo);
		const end = await ensureMatchEnd(activityId, endNo, shootOff);
		await clearSideArrows(end.id, side);
		await db()
			.update(schema.end)
			.set(
				side === 'us'
					? { subtotal: total ?? 0, updatedAt: Date.now() }
					: { opponentSubtotal: total, updatedAt: Date.now() }
			)
			.where(eq(schema.end.id, end.id));
		await log('round_end', end.id, 'update');
		await refreshMatchTotals(activityId);
	});
}

/** Arrows for one side of one end, replacing whatever was there: an end is entered, not appended to. */
export async function setMatchArrows(
	activityId: string,
	endNo: number,
	side: 'us' | 'them',
	shots: Omit<Shot, 'ordinal'>[],
	shootOff = false
) {
	// Serialised as well as committed once: two arrows tapped in quickly each replace the side's
	// arrows wholesale, and out of order the shorter set overwrites the longer one.
	await transaction(async () => {
		const end = await ensureMatchEnd(activityId, endNo, shootOff);

		const previous = (await listShots(end.id)).filter((shot) => shot.side === side);
		if (previous.length > 0) {
			const now = Date.now();
			await db()
				.update(schema.shot)
				.set({ deletedAt: now, updatedAt: now })
				.where(
					inArray(
						schema.shot.id,
						previous.map((shot) => shot.id)
					)
				);
			await logMany('shot', previous.map((shot) => shot.id), 'delete');
		}

		if (shots.length > 0) {
			const rows = shots.map((shot, index) => ({
				...stamp(),
				endId: end.id,
				ordinal: index + 1,
				value: shot.value,
				zoneLabel: shot.zoneLabel,
				side,
				x: shot.x,
				y: shot.y,
				source: shot.source
			}));
			await db().insert(schema.shot).values(rows);
			await logMany('shot', rows.map((row) => row.id), 'insert');
		}

		// Arrows are the truth once they exist: the end total follows them rather than the other way.
		const total = shots.reduce((sum, shot) => sum + shot.value, 0);
		await db()
			.update(schema.end)
			.set(
				side === 'us'
					? { subtotal: total, updatedAt: Date.now() }
					: { opponentSubtotal: total, updatedAt: Date.now() }
			)
			.where(eq(schema.end.id, end.id));
		await log('round_end', end.id, 'update');

		await refreshMatchTotals(activityId);
	});
}

export async function deleteMatchEnd(activityId: string, endNo: number) {
	// Renumbering the ends after it is several statements: half of it is a match with a hole.
	await transaction(() => removeMatchEnd(activityId, endNo));
}

/** The body of a removal, without a transaction of its own so a writer already in one can call it. */
async function removeMatchEnd(activityId: string, endNo: number) {
	const end = (await listEnds(activityId)).find((row) => row.endNo === endNo);
	if (!end) return;
	const now = Date.now();
	const shots = await listShots(end.id);
	if (shots.length > 0) {
		await db()
			.update(schema.shot)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				inArray(
					schema.shot.id,
					shots.map((shot) => shot.id)
				)
			);
		await logMany('shot', shots.map((shot) => shot.id), 'delete');
	}
	await db().update(schema.end).set({ deletedAt: now, updatedAt: now }).where(eq(schema.end.id, end.id));
	await log('round_end', end.id, 'delete');

	/**
	 * The ends that came after it close the gap. A match is a run of ends played in order, and an
	 * end four with no end three reads as a mistake rather than as a match with a hole in it.
	 */
	for (const later of (await listEnds(activityId)).filter(
		(row) => !row.isShootOff && row.endNo > endNo
	)) {
		await db()
			.update(schema.end)
			.set({ endNo: later.endNo - 1, updatedAt: now })
			.where(eq(schema.end.id, later.id));
		await log('round_end', later.id, 'update');
	}

	await refreshMatchTotals(activityId);
}

/**
 * Everybody named on a match card before, most recent first. Opponents are free text on purpose, so
 * this is what keeps the spelling of a name steady from one meeting to the next.
 */
export async function listMatchNames() {
	const rows = await db()
		.select({ config: schema.activity.matchConfig, at: schema.activity.startedAt })
		.from(schema.activity)
		.where(and(eq(schema.activity.kind, 'match'), isNull(schema.activity.deletedAt)))
		.orderBy(desc(schema.activity.startedAt));

	return gatherNames(rows.map((row) => parseConfig(row.config)));
}

/** The card as the match page reads it: the rules, the ends, and whatever arrows were plotted. */
export async function loadMatch(activityId: string) {
	const activity = await getActivity(activityId);
	const config = parseConfig(activity?.matchConfig ?? null);
	const { ends, shotsByEnd } = await loadSheet(activityId);
	return {
		config,
		ends: ends.map((row) => ({
			id: row.id,
			endNo: row.endNo,
			// A row exists because something was entered, so our total is a number from that moment on.
			ours: row.subtotal,
			theirs: row.opponentSubtotal,
			shootOff: row.isShootOff === 1,
			winner: (row.winner as 'us' | 'them' | null) ?? null,
			shots: shotsByEnd.get(row.id) ?? []
		}))
	};
}

/**
 * Totals for a match. The score is the result rather than a sum of arrows, and the arrows counted
 * are the ones the archer shot: none at all while the card is being kept for somebody else.
 */
export async function refreshMatchTotals(activityId: string) {
	const { config, ends } = await loadMatch(activityId);
	if (!config) return;

	const plain = ends.map((end) => ({
		endNo: end.endNo,
		ours: end.ours,
		theirs: end.theirs,
		shootOff: end.shootOff,
		winner: end.winner
	}));
	const result = tally(config, plain);
	const ours = ends.flatMap((end) => end.shots.filter((shot) => shot.side === 'us'));

	await db()
		.update(schema.activity)
		.set({
			totalScore: matchScore(config, plain),
			// Read off the plotted arrows when there are any: an end typed as a total has no tens to count.
			count10s: ours.filter((s) => s.zoneLabel === '10' || s.zoneLabel === 'X').length,
			countX: ours.filter((s) => s.zoneLabel === 'X').length,
			arrowsShot: arrowsShot(config, plain),
			status: result.decided ? 'complete' : 'in_progress',
			updatedAt: Date.now()
		})
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
}

/* Bows */

export async function createBow(name: string, type: string) {
	const base = stamp();
	await db().insert(schema.bow).values({ ...base, name, type });
	await log('bow', base.id, 'insert');
	return base.id;
}

export async function listBows() {
	return db()
		.select()
		.from(schema.bow)
		.where(isNull(schema.bow.deletedAt))
		.orderBy(asc(schema.bow.createdAt));
}

export async function getBow(id: string): Promise<BowRow | null> {
	const rows = await db().select().from(schema.bow).where(eq(schema.bow.id, id)).limit(1);
	return rows[0] ?? null;
}

/**
 * The outings shot with a bow outlive it, so they fall back to the generic type it was: a recurve
 * stays a recurve on the record, and no session is left naming a bow that is not in the list. The
 * bow's own name goes with the bow, since a name nobody can open again is a name nobody can read.
 */
export async function deleteBow(id: string) {
	const now = Date.now();
	const bow = await getBow(id);
	const shotWithIt = await db()
		.select({ id: schema.session.id })
		.from(schema.session)
		.where(eq(schema.session.bowId, id));

	if (shotWithIt.length > 0) {
		await db()
			.update(schema.session)
			.set({ bowId: null, bowType: bow?.type ?? null, updatedAt: now })
			.where(eq(schema.session.bowId, id));
		await logMany('session', shotWithIt.map((session) => session.id), 'update');
	}

	await db().update(schema.bow).set({ deletedAt: now, updatedAt: now }).where(eq(schema.bow.id, id));
	await log('bow', id, 'delete');
}

export async function updateBow(
	id: string,
	patch: Partial<{ name: string; photo: string | null; notes: string | null; isActive: number }>
) {
	await db()
		.update(schema.bow)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(schema.bow.id, id));
	await log('bow', id, 'update');
}

/* Bow revisions */

export type RevisionRow = Awaited<ReturnType<typeof listRevisions>>[number];

export async function listRevisions(bowId: string) {
	return db()
		.select()
		.from(schema.bowRevision)
		.where(and(eq(schema.bowRevision.bowId, bowId), isNull(schema.bowRevision.deletedAt)))
		.orderBy(desc(schema.bowRevision.revisionNo));
}

export async function currentRevision(bowId: string): Promise<RevisionRow | null> {
	return (await listRevisions(bowId))[0] ?? null;
}

/**
 * Appends a revision instead of updating one, so a score recorded last month still resolves to the
 * settings it was actually shot under.
 *
 * One commit, because the number it is filed under is read before it is written: two saves crossing
 * would each find the same last revision and each call itself the one after it, leaving a bow with
 * two of the same revision and a history that no longer reads in order.
 */
export async function createRevision(
	bowId: string,
	settings: Record<string, unknown>,
	reason?: string
) {
	return transaction(async () => {
		const base = stamp();
		const previous = await currentRevision(bowId);
		await db()
			.insert(schema.bowRevision)
			.values({
				...base,
				bowId,
				revisionNo: (previous?.revisionNo ?? 0) + 1,
				settings: JSON.stringify(settings),
				reason: reason?.trim() || null,
				effectiveFrom: base.createdAt
			});
		await log('bow_revision', base.id, 'insert');
		return base.id;
	});
}

/** Links a tuning activity to the revision it produced, closing the loop from test to change. */
export async function linkResultingRevision(activityId: string, revisionId: string) {
	await db()
		.update(schema.activity)
		.set({ resultingRevisionId: revisionId, updatedAt: Date.now() })
		.where(eq(schema.activity.id, activityId));
	await log('activity', activityId, 'update');
}

/* Corrections */

/** Undo for a committed end: the sheet only ever removes the last one, never a gap in the middle. */
export async function deleteLastEnd(activityId: string) {
	const ends = await listEnds(activityId);
	const last = ends[ends.length - 1];
	if (last) await deleteEnd(activityId, last.id);
}

/**
 * Removing one end wherever it sits, which a scored sheet never does and a tuning procedure does all
 * the time: its ends are readings grouped under a setting, not a run of numbers that has to add up.
 */
export async function deleteEnd(activityId: string, endId: string) {
	const now = Date.now();
	// One commit, like recording an end: an undo is waited on the same way an arrow is.
	await transaction(async () => {
		const shots = await listShots(endId);
		if (shots.length > 0) {
			await db()
				.update(schema.shot)
				.set({ deletedAt: now, updatedAt: now })
				.where(
					inArray(
						schema.shot.id,
						shots.map((s) => s.id)
					)
				);
			await logMany('shot', shots.map((s) => s.id), 'delete');
		}
		await db()
			.update(schema.end)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(schema.end.id, endId));
		await log('round_end', endId, 'delete');

		await refreshActivityTotals(activityId);
	});
}

export interface BowUsage {
	sessions: number;
	activities: number;
	arrowsShot: number;
	/** Best finished score with this bow, null until one round is complete. */
	bestScore: number | null;
	lastUsedAt: number | null;
}

/** Usage is derived from the sessions that name the bow, so nothing needs denormalising onto it. */
export async function bowUsage(bowId: string): Promise<BowUsage> {
	const sessions = (await listSessions()).filter((s) => s.bowId === bowId);
	const ids = new Set(sessions.map((s) => s.id));
	const done = (await listAllActivities()).filter((a) => ids.has(a.sessionId));
	const activities = done.filter((a) => a.kind === 'scoring');
	/**
	 * An outing counts once something happened in it, training arrows included. A session opened and
	 * left empty says nothing about the bow, so it is not one of its outings.
	 */
	const used = new Set(
		done
			.filter((a) => shootsArrows(a.kind) && (a.arrowsShot > 0 || a.kind !== 'training'))
			.map((a) => a.sessionId)
	);

	// A best score is only comparable between rounds that were shot to the end.
	const finished = activities.filter((a) =>
		isRoundComplete(a.roundDefinition ? JSON.parse(a.roundDefinition) : null, a.arrowsShot)
	);
	// Read off the outings that count, so "last used" can never be a session nothing happened in.
	const outings = sessions.filter((s) => used.has(s.id));
	return {
		sessions: outings.length,
		activities: activities.length,
		// Every arrow the bow sent, training included: wear is wear, whether or not it was scored.
		arrowsShot: done
			.filter((a) => shootsArrows(a.kind))
			.reduce((sum, a) => sum + a.arrowsShot, 0),
		// Reduced rather than spread: a bow shot for years carries more rows than a call takes arguments.
		bestScore: finished.length > 0 ? finished.reduce((top, a) => Math.max(top, a.totalScore), -Infinity) : null,
		lastUsedAt: outings.length > 0 ? outings.reduce((last, s) => Math.max(last, s.startedAt), -Infinity) : null
	};
}

/**
 * Every arrow ever entered, tagged with the activity it belongs to. Read whole because the stats
 * page groups it by round: fetching per round would be one query per card.
 */
export async function listShotValues() {
	return db()
		.select({
			activityId: schema.end.activityId,
			value: schema.shot.value,
			zoneLabel: schema.shot.zoneLabel
		})
		.from(schema.shot)
		.innerJoin(schema.end, eq(schema.shot.endId, schema.end.id))
		.where(
			and(
				isNull(schema.shot.deletedAt),
				isNull(schema.end.deletedAt),
				inArray(schema.end.activityId, liveActivities())
			)
		);
}

/**
 * Every end ever shot, with how many arrows were in it. Read whole rather than per activity because
 * the stats page asks the same question of the entire history: how a score moves through a round.
 */
export async function listEndTotals() {
	const ends = await db()
		.select({
			id: schema.end.id,
			activityId: schema.end.activityId,
			stageIndex: schema.end.stageIndex,
			endNo: schema.end.endNo,
			subtotal: schema.end.subtotal
		})
		.from(schema.end)
		.where(and(isNull(schema.end.deletedAt), inArray(schema.end.activityId, liveActivities())));

	const shots = await db()
		.select({ endId: schema.shot.endId })
		.from(schema.shot)
		.where(isNull(schema.shot.deletedAt));

	// Counted here rather than in SQL: one grouped query per table beats a join drizzle has to shape.
	const arrows = shots.reduce<Record<string, number>>((acc, row) => {
		acc[row.endId] = (acc[row.endId] ?? 0) + 1;
		return acc;
	}, {});
	return ends.map((end) => ({ ...end, arrows: arrows[end.id] ?? 0 }));
}

/* Plans */

export type PlanRow = Awaited<ReturnType<typeof listPlans>>[number];
export type PlanSlotRow = Awaited<ReturnType<typeof listPlanSlots>>[number];

export async function listPlans() {
	return db()
		.select()
		.from(schema.plan)
		.where(isNull(schema.plan.deletedAt))
		.orderBy(asc(schema.plan.createdAt));
}

export async function getPlan(id: string) {
	const [row] = await db()
		.select()
		.from(schema.plan)
		.where(and(eq(schema.plan.id, id), isNull(schema.plan.deletedAt)));
	return row ?? null;
}

export async function createPlan(name: string) {
	const base = stamp();
	await db().insert(schema.plan).values({ ...base, name });
	await log('plan', base.id, 'insert');
	return base.id;
}

export async function updatePlan(
	id: string,
	patch: Partial<{
		name: string;
		freeArrows: number | null;
		isActive: number;
		startDate: number | null;
		endDate: number | null;
	}>
) {
	if ('freeArrows' in patch) patch = { ...patch, freeArrows: safeGoal(patch.freeArrows) };
	await db()
		.update(schema.plan)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(schema.plan.id, id));
	await log('plan', id, 'update');
}

export async function renamePlan(id: string, name: string) {
	await updatePlan(id, { name });
}

export async function deletePlan(id: string) {
	const now = Date.now();
	const slots = await listPlanSlots(id);
	if (slots.length > 0) {
		await db()
			.update(schema.planSlot)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(schema.planSlot.planId, id));
		await logMany('plan_slot', slots.map((s) => s.id), 'delete');
	}
	await db().update(schema.plan).set({ deletedAt: now, updatedAt: now }).where(eq(schema.plan.id, id));
	await log('plan', id, 'delete');
}

/** Every slot of every plan, since the sessions list draws the week from all of them at once. */
export async function listPlanSlots(planId?: string) {
	const where = planId
		? and(eq(schema.planSlot.planId, planId), isNull(schema.planSlot.deletedAt))
		: isNull(schema.planSlot.deletedAt);
	return db().select().from(schema.planSlot).where(where).orderBy(asc(schema.planSlot.minuteOfDay));
}

/**
 * An arrow goal as it can be stored. Typed into a plain number field like the arrow counter, and it
 * sets the bar the week is read against, so half an arrow asked for reads back as half an arrow owed.
 */
function safeGoal(value: number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const bounded = safeCount(value, LIMITS.arrows);
	// Nothing asked for is no goal at all, which is not the same as a goal of zero arrows.
	return bounded > 0 ? bounded : null;
}

export async function createPlanSlot(input: {
	planId: string;
	weekday: number;
	minuteOfDay: number;
	arrowGoal?: number | null;
	label?: string | null;
}) {
	const base = stamp();
	await db()
		.insert(schema.planSlot)
		.values({
			...base,
			planId: input.planId,
			weekday: input.weekday,
			minuteOfDay: input.minuteOfDay,
			arrowGoal: safeGoal(input.arrowGoal),
			label: input.label ?? null
		});
	await log('plan_slot', base.id, 'insert');
	return base.id;
}

export async function updatePlanSlot(
	id: string,
	patch: Partial<{ weekday: number; minuteOfDay: number; arrowGoal: number | null; label: string | null }>
) {
	await db()
		.update(schema.planSlot)
		.set({
			...patch,
			...('arrowGoal' in patch ? { arrowGoal: safeGoal(patch.arrowGoal) } : {}),
			updatedAt: Date.now()
		})
		.where(eq(schema.planSlot.id, id));
	await log('plan_slot', id, 'update');
}

export async function deletePlanSlot(id: string) {
	const now = Date.now();
	await db()
		.update(schema.planSlot)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(schema.planSlot.id, id));
	await log('plan_slot', id, 'delete');
}

/* Sight marks */

export type SightMarkRow = Awaited<ReturnType<typeof listSightMarks>>[number];

/** Nearest distance first, which is the order a sight tape is read in. */
export async function listSightMarks(bowId: string) {
	return db()
		.select()
		.from(schema.sightMark)
		.where(and(eq(schema.sightMark.bowId, bowId), isNull(schema.sightMark.deletedAt)))
		.orderBy(asc(schema.sightMark.distance));
}

export async function createSightMark(input: {
	bowId: string;
	distance: number;
	unit: string;
	height?: string | null;
	interpolated?: boolean;
}) {
	const base = stamp();
	await db()
		.insert(schema.sightMark)
		.values({
			...base,
			bowId: input.bowId,
			distance: input.distance,
			unit: input.unit,
			height: input.height ?? null,
			interpolated: input.interpolated ? 1 : 0
		});
	await log('sight_mark', base.id, 'insert');
	return base.id;
}

export async function updateSightMark(
	id: string,
	patch: Partial<{
		distance: number;
		unit: string;
		height: string | null;
		interpolated: number;
		windage: string | null;
		clicker: string | null;
		plunger: string | null;
		position: string | null;
	}>
) {
	await db()
		.update(schema.sightMark)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(schema.sightMark.id, id));
	await log('sight_mark', id, 'update');
}

export async function deleteSightMark(id: string) {
	const now = Date.now();
	await db()
		.update(schema.sightMark)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(schema.sightMark.id, id));
	await log('sight_mark', id, 'delete');
}

/* Favourite rounds */

export async function listFavouriteRounds(): Promise<string[]> {
	const rows = await db()
		.select()
		.from(schema.favouriteRound)
		.where(isNull(schema.favouriteRound.deletedAt));
	return rows.map((row) => row.roundKey);
}

/** Returns whether the round is a favourite after the call, so the caller can reflect it at once. */
export async function toggleFavouriteRound(roundKey: string): Promise<boolean> {
	const [existing] = await db()
		.select()
		.from(schema.favouriteRound)
		.where(
			and(eq(schema.favouriteRound.roundKey, roundKey), isNull(schema.favouriteRound.deletedAt))
		);

	if (existing) {
		const now = Date.now();
		await db()
			.update(schema.favouriteRound)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(schema.favouriteRound.id, existing.id));
		await log('favourite_round', existing.id, 'delete');
		return false;
	}

	const base = stamp();
	await db().insert(schema.favouriteRound).values({ ...base, roundKey });
	await log('favourite_round', base.id, 'insert');
	return true;
}

/* Badges */

/** An arrow in the gold, which on a ten ring face is a 9 or better. */
const GOLD_VALUE = 9;

export async function listBadges() {
	return db().select().from(schema.badge).where(isNull(schema.badge.deletedAt));
}

/**
 * Everything the badge rules read, gathered in one pass. Assembled here rather than in the domain
 * because the rules must stay testable without a database, see doc/dev_guidelines.md.
 */
/** What an activity that shoots nothing did, read off its measurements once for the badge rules. */
function trainingFigures(kind: string, measurements: string | null) {
	if (kind === STRENGTH_KIND) {
		return { setsDone: setsDone(parseStrength(measurements)), distanceM: 0, seconds: 0 };
	}
	if (kind === RUNNING_KIND) {
		const run = parseRun(measurements);
		return { setsDone: 0, distanceM: run.distanceM ?? 0, seconds: run.durationSeconds ?? 0 };
	}
	return null;
}

export async function loadBadgeInput(): Promise<BadgeInput> {
	const activities = await listAllActivities();
	const sessions = await listSessions();
	const bows = await listBows();
	const ends = await db().select().from(schema.end).where(isNull(schema.end.deletedAt));
	const shots = await db()
		.select({
			endId: schema.shot.endId,
			value: schema.shot.value,
			x: schema.shot.x,
			y: schema.shot.y
		})
		.from(schema.shot)
		.where(isNull(schema.shot.deletedAt));
	const marks = await db()
		.select({ bowId: schema.sightMark.bowId, createdAt: schema.sightMark.createdAt })
		.from(schema.sightMark)
		.where(isNull(schema.sightMark.deletedAt));
	const slots = await listPlanSlots();
	const plans = await listPlans();
	// A plan put aside stops setting the bar a weekly badge is measured against.
	const live = onlyActive(plans, slots);

	// A match's result is worked out from its ends, and only ever the archer's own matches.
	const matchResults = new Map<string, { won: boolean; fromBehind: boolean; bot: string | null }>();
	for (const activity of activities.filter((a) => a.kind === 'match')) {
		const card = await loadMatch(activity.id);
		if (!card.config?.forSelf) continue;
		const plain = card.ends.map((end) => ({
			endNo: end.endNo,
			ours: end.ours,
			theirs: end.theirs,
			shootOff: end.shootOff,
			winner: end.winner
		}));
		matchResults.set(activity.id, {
			won: tally(card.config, plain).winner === 'us',
			fromBehind: wonFromBehind(card.config, plain),
			bot: card.config.bot
		});
	}

	const bowTypes = new Map(bows.map((bow) => [bow.id, bow.type]));
	const sessionsById = new Map(sessions.map((session) => [session.id, session]));

	type Tally = { arrows: number; golds: number; lowest: number | null; plots: { x: number; y: number }[] };
	const tallies = new Map<string, Tally>();
	for (const shot of shots) {
		const tally: Tally = tallies.get(shot.endId) ?? { arrows: 0, golds: 0, lowest: null, plots: [] };
		tally.arrows += 1;
		if (shot.value >= GOLD_VALUE) tally.golds += 1;
		tally.lowest = tally.lowest === null ? shot.value : Math.min(tally.lowest, shot.value);
		if (shot.x !== null && shot.y !== null) tally.plots.push({ x: shot.x, y: shot.y });
		tallies.set(shot.endId, tally);
	}

	const endsByActivity = new Map<string, BadgeEnd[]>();
	for (const end of ends) {
		const tally = tallies.get(end.id) ?? { arrows: 0, golds: 0, lowest: null, plots: [] };
		const list = endsByActivity.get(end.activityId) ?? [];
		list.push({
			stageIndex: end.stageIndex,
			arrows: tally.arrows,
			subtotal: end.subtotal,
			golds: tally.golds,
			lowest: tally.lowest,
			plots: tally.plots
		});
		endsByActivity.set(end.activityId, list);
	}

	return {
		activities: activities.map((activity) => {
			const session = sessionsById.get(activity.sessionId);
			const weather = session?.weather ? JSON.parse(session.weather) : null;
			return {
				id: activity.id,
				sessionId: activity.sessionId,
				// The outing's date, like every other field here. A badge counting distinct days or a
				// week's arrows asks when the shooting happened, and an activity is stamped when its row
				// was written: a week of outings entered in one sitting read as a single day.
				startedAt: session?.startedAt ?? activity.startedAt,
				totalScore: activity.totalScore,
				arrowsShot: activity.arrowsShot,
				count10s: activity.count10s,
				countX: activity.countX,
				roundDefinitionId: activity.roundDefinitionId,
				round: activity.roundDefinition
					? (JSON.parse(activity.roundDefinition) as RoundDefinition)
					: null,
				kind: activity.kind,
				sessionKind: session?.kind ?? 'practice',
				// The bow the outing named, or the generic type when it only recorded that much.
				bowType: (session?.bowId ? bowTypes.get(session.bowId) : session?.bowType) ?? null,
				windKmh: typeof weather?.windSpeedKmh === 'number' ? weather.windSpeedKmh : null,
				temperatureC: typeof weather?.temperatureC === 'number' ? weather.temperatureC : null,
				location: session?.location ?? null,
				ends: endsByActivity.get(activity.id) ?? [],
				match: matchResults.get(activity.id) ?? null,
				training: trainingFigures(activity.kind, activity.measurements)
			};
		}),
		sightMarks: marks,
		// Asked per week, so a season that had not begun or is over sets no bar for the weeks around it.
		weekArrowGoal: (weekStart: number) => weekArrowGoalOn(weekStart, live.slots, live.plans)
	};
}

/**
 * Everything the experience points are worked out from. Lighter than the badge input on purpose: the
 * home page reads it on every visit, and points are decided by what an activity totalled rather than
 * by what any single arrow did, so nothing here has to touch the shots.
 */
export async function loadExperienceInput(): Promise<XpInput> {
	const activities = await listAllActivities();
	const badges = await listBadges();

	const matches = activities.filter((activity) => activity.kind === 'match');
	const ends = matches.length
		? await db()
				.select()
				.from(schema.end)
				.where(
					and(
						inArray(
							schema.end.activityId,
							matches.map((activity) => activity.id)
						),
						isNull(schema.end.deletedAt)
					)
				)
		: [];

	const endsByMatch = new Map<string, MatchEnd[]>();
	for (const end of ends) {
		const list = endsByMatch.get(end.activityId) ?? [];
		list.push({
			endNo: end.endNo,
			ours: end.subtotal,
			theirs: end.opponentSubtotal,
			shootOff: end.isShootOff === 1,
			winner: (end.winner as 'us' | 'them' | null) ?? null
		});
		endsByMatch.set(end.activityId, list);
	}

	const results = new Map<string, NonNullable<XpActivity['match']>>();
	for (const activity of matches) {
		const config = parseConfig(activity.matchConfig);
		// A card kept for somebody else earns them nothing: it is not their result to be paid for.
		if (!config?.forSelf) continue;
		const result = tally(config, endsByMatch.get(activity.id) ?? []);
		results.set(activity.id, {
			won: result.winner === 'us',
			drawn: result.drawn,
			stage: config.stage,
			bot: config.bot
		});
	}

	return {
		activities: activities.map((activity) => ({
			id: activity.id,
			sessionId: activity.sessionId,
			startedAt: activity.startedAt,
			totalScore: activity.totalScore,
			arrowsShot: activity.arrowsShot,
			count10s: activity.count10s,
			countX: activity.countX,
			roundDefinitionId: activity.roundDefinitionId,
			round: activity.roundDefinition
				? (JSON.parse(activity.roundDefinition) as RoundDefinition)
				: null,
			kind: activity.kind,
			match: results.get(activity.id) ?? null
		})),
		badges: badges.map((row) => row.key)
	};
}

/**
 * Never logged: a badge is local forever, see doc/sync.md § 2. Every device works its own out from
 * the shooting record, so an entry naming one is a change no exchange can ever carry off the queue.
 */
async function writeBadges(keys: { key: string; earnedAt: number }[]) {
	const rows = keys.map((entry) => ({ ...stamp(), key: entry.key, earnedAt: entry.earnedAt }));
	if (rows.length === 0) return;
	await db().insert(schema.badge).values(rows);
}

/**
 * Awards whatever the shooting so far has earned and is not already held. Never takes one back: a
 * badge is kept once won, and only the recalculation in settings can revoke it.
 *
 * Returns the keys awarded by this call, so the caller can celebrate them. A caller that has already
 * loaded the input passes it in rather than paying for a second pass over every arrow ever shot.
 */
export async function awardBadges(preloaded?: BadgeInput): Promise<string[]> {
	const held = new Set((await listBadges()).map((row) => row.key));
	const earned = evaluateBadges(preloaded ?? (await loadBadgeInput())).filter(
		(badge) => badge.earnedAt !== null && !held.has(badge.definition.key)
	);
	await writeBadges(earned.map((badge) => ({ key: badge.definition.key, earnedAt: badge.earnedAt! })));
	return earned.map((badge) => badge.definition.key);
}

/**
 * Checks every badge against the shooting that is left and revokes the ones nothing supports any
 * more, after a session was deleted or a score corrected. A badge that still stands keeps the date
 * it was first earned, because that is the day it was shot.
 */
export async function recalculateBadges(): Promise<{ awarded: string[]; revoked: string[] }> {
	const rows = await listBadges();
	const badges = evaluateBadges(await loadBadgeInput());
	const earned = new Map(
		badges.filter((badge) => badge.earnedAt !== null).map((badge) => [badge.definition.key, badge.earnedAt!])
	);

	const now = Date.now();
	const stale = rows.filter((row) => !earned.has(row.key));
	for (const row of stale) {
		await db()
			.update(schema.badge)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(schema.badge.id, row.id));
	}

	const held = new Set(rows.filter((row) => earned.has(row.key)).map((row) => row.key));
	const missing = [...earned.entries()]
		.filter(([key]) => !held.has(key))
		.map(([key, earnedAt]) => ({ key, earnedAt }));
	await writeBadges(missing);

	return { awarded: missing.map((entry) => entry.key), revoked: stale.map((row) => row.key) };
}

export function shotFromZone(zone: Zone, source: Shot['source'] = 'manual'): Omit<Shot, 'ordinal'> {
	return { value: zone.value, zoneLabel: zone.label, x: null, y: null, source };
}

/** Plotted arrows carry coordinates, and the value is derived from them rather than entered twice. */
export function shotFromPlot(zone: Zone, x: number, y: number): Omit<Shot, 'ordinal'> {
	return { value: zone.value, zoneLabel: zone.label, x, y, source: 'plotted' };
}

/* Imports from other apps */

/**
 * Writing a plan read out of another app's export, see src/lib/import/captarget.ts.
 *
 * Imported rows are keyed by what the other app called them rather than by a fresh uuid, so running
 * the same file again replaces what it wrote last time instead of doubling every score. That is the
 * only sane behaviour for a file an archer will re-export after adding a month of shooting to it,
 * and it is why the prefix matters: nothing outside an import can ever collide with these ids.
 *
 * Rows the archer has since created by hand are untouched, and so is an imported row the new file
 * no longer mentions: a shorter export is a smaller export, not an instruction to delete history.
 */
const IMPORT_PREFIX = 'imported:';

function importedId(kind: string, externalId: string): string {
	return `${IMPORT_PREFIX}${kind}:${externalId}`;
}

export interface ImportReport {
	sessions: number;
	activities: number;
	arrows: number;
	replaced: number;
}

export interface ImportOptions {
	/** The bow every imported session was shot with, when the archer says which one it was. */
	bowId?: string | null;
	/**
	 * Called after each session is written. A file holding years of shooting takes long enough that
	 * the screen has to be able to say how far along it is, and only the loop knows.
	 */
	onProgress?: (done: number, total: number) => void;
}

export async function importPlan(plan: CapTargetPlan, options: ImportOptions = {}): Promise<ImportReport> {
	const report: ImportReport = { sessions: 0, activities: 0, arrows: 0, replaced: 0 };
	const total = plan.sessions.length;
	options.onProgress?.(0, total);

	for (const planned of plan.sessions) {
		const sessionId = importedId('session', planned.externalId);
		const existing = await getSession(sessionId);
		if (existing) report.replaced += 1;
		await clearImportedSession(sessionId);
		// A later export can move a round to another session, and its row is keyed by the round
		// rather than by its parent, so the copy under the old parent has to go with it.
		await clearImportedActivities(
			planned.activities.map((activity) => importedId('activity', activity.externalId))
		);

		const now = Date.now();
		const base = { createdAt: now, updatedAt: now, deviceId: deviceId() };
		await db()
			.insert(schema.session)
			.values({
				...base,
				id: sessionId,
				label: planned.label === null ? null : safeText(planned.label, LIMITS.idChars),
				startedAt: planned.startedAt,
				kind: planned.kind,
				// What the archer added to an imported session is theirs, and a second import of the
				// same file must not take it back: only what the export itself carries is rewritten.
				bowId: options.bowId ?? existing?.bowId ?? null,
				notes: safeText(sessionNote(planned, existing?.notes ?? null), LIMITS.textChars) || null
			});
		await log('session', sessionId, 'insert');
		report.sessions += 1;

		for (const activity of planned.activities) {
			const activityId = importedId('activity', activity.externalId);
			const shots = activity.ends.flatMap((end) => end.shots);
			const [stage] = activity.round.stages;
			const freeScore = activity.kind === FREE_SCORE_KIND;
			await db()
				.insert(schema.activity)
				.values({
					...base,
					id: activityId,
					sessionId,
					kind: activity.kind,
					roundDefinitionId: null,
					// Scoring with no arrows behind it keeps where it was shot and nothing more: written
					// as a round definition it would be counted as a round it never was.
					roundDefinition: freeScore
						? null
						: JSON.stringify({ ...activity.round, name: safeText(activity.round.name, LIMITS.idChars) }),
					measurements: freeScore
						? serialiseFreeScore({
								distance: stage?.distance?.value ?? null,
								unit: stage?.distance?.unit ?? 'm',
								faceSize: stage?.faceSize ?? 122
							})
						: null,
					startedAt: activity.startedAt,
					// A round whose arrows the export did not carry keeps the total it reported: the
					// score is the thing the archer shot for, and it is not recoverable any other way.
					totalScore: safeCount(
						shots.length
							? shots.reduce((sum, shot) => sum + shot.value, 0)
							: (activity.reportedTotal ?? 0),
						LIMITS.score
					),
					count10s: shots.filter((shot) => shot.zoneLabel === '10' || shot.zoneLabel === 'X').length,
					countX: shots.filter((shot) => shot.zoneLabel === 'X').length,
					arrowsShot: safeCount(shots.length || activity.reportedArrows, LIMITS.arrows),
					status: 'complete',
					notes: activity.notes === null ? null : safeText(activity.notes) || null
				});
			await log('activity', activityId, 'insert');
			report.activities += 1;

			for (const end of activity.ends) {
				const endBase = stamp();
				await db()
					.insert(schema.end)
					.values({
						...endBase,
						activityId,
						stageIndex: 0,
						endNo: end.endNo,
						subtotal: end.shots.reduce((sum, shot) => sum + shot.value, 0)
					});
				await log('round_end', endBase.id, 'insert');

				if (end.shots.length === 0) continue;
				const rows = end.shots.map((shot, index) => ({
					...stamp(),
					endId: endBase.id,
					ordinal: index + 1,
					value: shot.value,
					zoneLabel: shot.zoneLabel,
					x: shot.x,
					y: shot.y,
					// Provenance is kept honest: an arrow read out of a file was not scored here.
					source: shot.x === null ? 'manual' : 'plotted'
				}));
				await db().insert(schema.shot).values(rows);
				await logMany('shot', rows.map((row) => row.id), 'insert');
				report.arrows += rows.length;
			}
		}

		if (planned.trainingArrows > 0) {
			// Written here rather than through addTrainingArrows, which dates the activity now: an
			// import is the one caller whose arrows were shot on a day that is not today, and dating
			// them today piles years of volume onto the day the file was opened.
			const training = stamp();
			await db()
				.insert(schema.activity)
				.values({
					...training,
					sessionId,
					kind: 'training',
					startedAt: planned.startedAt,
					arrowsShot: safeCount(planned.trainingArrows, LIMITS.arrows),
					status: 'complete'
				});
			await log('activity', training.id, 'insert');
			report.arrows += planned.trainingArrows;
		}

		options.onProgress?.(report.sessions, total);
	}

	return report;
}

/** Everything from this line down was written by an import, so a re-import may rewrite it. */
const IMPORT_NOTE_MARKER = 'CapTarget import';

/**
 * What the export said about the outing, plus what it could not say. An exercise CapTarget lists
 * without arrows and without a score leaves no count anywhere in the file, not even in the session's
 * own totals, so it is written down in words: an arrow figure that is quietly short is worse than
 * one the archer knows is short.
 *
 * Anything the archer typed above the marker is theirs and survives every later import of the file.
 */
function sessionNote(planned: CapTargetPlan['sessions'][number], existing: string | null): string | null {
	const details = [planned.notes];
	if (planned.unrecordedExercises > 0) {
		const n = planned.unrecordedExercises;
		details.push(`${n} exercise${n > 1 ? 's' : ''} with no arrows recorded in the export`);
	}
	const written = details.filter(Boolean).join('\n');
	const kept = (existing ?? '').split(IMPORT_NOTE_MARKER)[0].trim();
	const parts = [kept, written ? `${IMPORT_NOTE_MARKER}\n${written}` : ''].filter(Boolean);
	return parts.length > 0 ? parts.join('\n\n') : null;
}

/**
 * Every session an import wrote, taken away in one go so a bad import can be undone wholesale.
 *
 * Soft deleted rather than cleared, unlike the re-import path below. This is an archer deleting
 * outings, and a hard delete leaves the server holding rows the device no longer has: the next pull
 * would bring every one of them back, which is the opposite of what the button says it does.
 */
export async function deleteImportedSessions(): Promise<number> {
	const sessions = await db()
		.select({ id: schema.session.id })
		.from(schema.session)
		.where(like(schema.session.id, `${IMPORT_PREFIX}%`));
	if (sessions.length === 0) return 0;

	const ids = sessions.map((row) => row.id);
	for (let i = 0; i < ids.length; i += 100) await deleteSessions(ids.slice(i, i + 100));
	return sessions.length;
}

/**
 * Everything the app holds, gone. Rows rather than the file itself, so the database it leaves behind
 * is the one a fresh install would have made rather than a schema this build has to migrate again.
 */
export async function deleteEverything(): Promise<void> {
	// Children first, so nothing is left pointing at a parent that has gone.
	const tables = [
		schema.shot,
		schema.end,
		schema.activity,
		schema.session,
		schema.bowRevision,
		schema.sightMark,
		schema.bow,
		schema.arrowSet,
		schema.planSlot,
		schema.plan,
		schema.favouriteRound,
		schema.badge,
		schema.socialActivity,
		schema.socialProfile,
		schema.ianseoFavourite,
		schema.ianseoCache,
		schema.changeLog
	];
	// Only the tables the file actually has. Erasing the device is what somebody reaches for when the
	// database is already wrong, so it must not be the one thing that needs the database to be right:
	// a table this build knows and the file has never heard of has nothing in it to delete anyway.
	const present = new Set(await tableNames());
	for (const table of tables) {
		if (present.has(getTableName(table))) await db().delete(table);
	}

	// The cursors describe a history this device no longer has. Left where they are, signing back in
	// would ask the server only for what changed since, and the record would never come home. The
	// endpoint stays: where the server is is a setting, not data.
	if (present.has(getTableName(schema.syncState))) {
		await db()
			.update(schema.syncState)
			.set({ lastPullCursor: null, lastPushCursor: null, lastSyncAt: null });
	}
}

/** Rows an earlier import wrote for the same activities, wherever they ended up sitting. */
async function clearImportedActivities(ids: string[]) {
	if (ids.length === 0) return;
	for (let i = 0; i < ids.length; i += 100) {
		const chunk = ids.slice(i, i + 100);
		const ends = await db()
			.select({ id: schema.end.id })
			.from(schema.end)
			.where(inArray(schema.end.activityId, chunk));
		const endIds = ends.map((row) => row.id);
		if (endIds.length > 0) {
			// A hundred activities carry far more than a hundred ends, so the arrows are walked in
			// chunks of their own rather than named all at once in a single statement.
			const shotIds: string[] = [];
			for (let j = 0; j < endIds.length; j += 100) {
				const ofEnds = endIds.slice(j, j + 100);
				const shots = await db()
					.select({ id: schema.shot.id })
					.from(schema.shot)
					.where(inArray(schema.shot.endId, ofEnds));
				shotIds.push(...shots.map((row) => row.id));
				await db().delete(schema.shot).where(inArray(schema.shot.endId, ofEnds));
			}
			await db().delete(schema.end).where(inArray(schema.end.activityId, chunk));
			await forgetLog('shot', shotIds);
			await forgetLog('round_end', endIds);
		}
		await db().delete(schema.activity).where(inArray(schema.activity.id, chunk));
		await forgetLog('activity', chunk);
	}
}

/**
 * Takes a previously imported session's rows away for real rather than soft deleting them. A
 * tombstone is how the archer deleting an outing is told apart from an outing that never was; a
 * re-import is neither, and leaving tombstones behind would make every re-run of the same file
 * grow the database it is meant to be replacing rows in.
 */
async function clearImportedSession(sessionId: string) {
	const activities = await db()
		.select({ id: schema.activity.id })
		.from(schema.activity)
		.where(eq(schema.activity.sessionId, sessionId));
	const activityIds = activities.map((row) => row.id);

	if (activityIds.length > 0) {
		const ends = await db()
			.select({ id: schema.end.id })
			.from(schema.end)
			.where(inArray(schema.end.activityId, activityIds));
		const endIds = ends.map((row) => row.id);
		const shotIds: string[] = [];
		for (let i = 0; i < endIds.length; i += 100) {
			const chunk = endIds.slice(i, i + 100);
			const shots = await db()
				.select({ id: schema.shot.id })
				.from(schema.shot)
				.where(inArray(schema.shot.endId, chunk));
			shotIds.push(...shots.map((row) => row.id));
			await db().delete(schema.shot).where(inArray(schema.shot.endId, chunk));
		}
		await db().delete(schema.end).where(inArray(schema.end.activityId, activityIds));
		await db().delete(schema.activity).where(eq(schema.activity.sessionId, sessionId));
		await forgetLog('shot', shotIds);
		await forgetLog('round_end', endIds);
		await forgetLog('activity', activityIds);
	}
	await db().delete(schema.session).where(eq(schema.session.id, sessionId));
	await forgetLog('session', [sessionId]);
}
