import { eq, and, isNull, desc, asc, inArray } from 'drizzle-orm';
import { db, schema } from './index';
import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
import { sumShots, countLabel, isRoundComplete } from '$lib/domain/rounds/geometry';

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
		if (delta <= 0) return 0;
		const base = stamp();
		await db()
			.insert(schema.activity)
			.values({
				...base,
				sessionId,
				kind: 'training',
				startedAt: base.createdAt,
				arrowsShot: delta,
				status: 'complete'
			});
		await log('activity', base.id, 'insert');
		return delta;
	}

	const next = Math.max(0, existing.arrowsShot + delta);
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

export async function listAllActivities() {
	return db()
		.select()
		.from(schema.activity)
		.where(isNull(schema.activity.deletedAt))
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
	video: string | null = null
) {
	const endBase = stamp();
	await db()
		.insert(schema.end)
		.values({
			...endBase,
			activityId,
			stageIndex,
			endNo,
			subtotal: shots.reduce((sum, s) => sum + s.value, 0),
			video
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

export async function deleteBow(id: string) {
	const now = Date.now();
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
 */
export async function createRevision(
	bowId: string,
	settings: Record<string, unknown>,
	reason?: string
) {
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
	if (!last) return;

	const now = Date.now();
	const shots = await listShots(last.id);
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
	await db().update(schema.end).set({ deletedAt: now, updatedAt: now }).where(eq(schema.end.id, last.id));
	await log('round_end', last.id, 'delete');

	await refreshActivityTotals(activityId);
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
	const activities = (await listAllActivities()).filter(
		(a) => ids.has(a.sessionId) && a.kind === 'scoring'
	);

	// A best score is only comparable between rounds that were shot to the end.
	const finished = activities.filter((a) =>
		isRoundComplete(a.roundDefinition ? JSON.parse(a.roundDefinition) : null, a.arrowsShot)
	);
	return {
		sessions: sessions.length,
		activities: activities.length,
		arrowsShot: activities.reduce((sum, a) => sum + a.arrowsShot, 0),
		bestScore: finished.length > 0 ? Math.max(...finished.map((a) => a.totalScore)) : null,
		lastUsedAt: sessions.length > 0 ? Math.max(...sessions.map((s) => s.startedAt)) : null
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
		.where(and(isNull(schema.shot.deletedAt), isNull(schema.end.deletedAt)));
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

export async function renamePlan(id: string, name: string) {
	await db()
		.update(schema.plan)
		.set({ name, updatedAt: Date.now() })
		.where(eq(schema.plan.id, id));
	await log('plan', id, 'update');
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
			arrowGoal: input.arrowGoal ?? null,
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
		.set({ ...patch, updatedAt: Date.now() })
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

export function shotFromZone(zone: Zone, source: Shot['source'] = 'manual'): Omit<Shot, 'ordinal'> {
	return { value: zone.value, zoneLabel: zone.label, x: null, y: null, source };
}

/** Plotted arrows carry coordinates, and the value is derived from them rather than entered twice. */
export function shotFromPlot(zone: Zone, x: number, y: number): Omit<Shot, 'ordinal'> {
	return { value: zone.value, zoneLabel: zone.label, x, y, source: 'plotted' };
}
