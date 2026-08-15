import { eq, and, isNull, desc, asc, inArray } from 'drizzle-orm';
import { db, schema } from './index';
import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
import { sumShots, countLabel, isRoundComplete } from '$lib/domain/rounds/geometry';
import { evaluateBadges, type BadgeEnd, type BadgeInput } from '$lib/domain/badges';
import { weekArrowGoalOn, onlyActive } from '$lib/domain/plans';
import { startOfWeek } from '$lib/domain/dates';
import {
	parseConfig,
	tally,
	arrowsShot,
	matchScore,
	wonFromBehind,
	type MatchConfig
} from '$lib/domain/matches';

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
	const existing = (await listEnds(activityId)).find((row) => row.endNo === endNo);
	const patch = {
		subtotal: input.ours ?? 0,
		opponentSubtotal: input.theirs,
		isShootOff: input.shootOff ? 1 : 0,
		winner: input.winner ?? null
	};

	if (existing) {
		await db()
			.update(schema.end)
			.set({ ...patch, updatedAt: Date.now() })
			.where(eq(schema.end.id, existing.id));
		await log('round_end', existing.id, 'update');
	} else {
		const base = stamp();
		await db()
			.insert(schema.end)
			.values({ ...base, activityId, stageIndex: 0, endNo, ...patch });
		await log('round_end', base.id, 'insert');
	}

	await refreshMatchTotals(activityId);
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
}

/** Arrows for one side of one end, replacing whatever was there: an end is entered, not appended to. */
export async function setMatchArrows(
	activityId: string,
	endNo: number,
	side: 'us' | 'them',
	shots: Omit<Shot, 'ordinal'>[],
	shootOff = false
) {
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
}

export async function deleteMatchEnd(activityId: string, endNo: number) {
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

	const opponents = new Set<string>();
	const ours = new Set<string>();
	for (const row of rows) {
		const config = parseConfig(row.config);
		if (config?.opponent) opponents.add(config.opponent);
		if (config?.ourName) ours.add(config.ourName);
	}
	return { opponents: [...opponents], ours: [...ours] };
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
	if (last) await deleteEnd(activityId, last.id);
}

/**
 * Removing one end wherever it sits, which a scored sheet never does and a tuning procedure does all
 * the time: its ends are readings grouped under a setting, not a run of numbers that has to add up.
 */
export async function deleteEnd(activityId: string, endId: string) {
	const now = Date.now();
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
	await db().update(schema.end).set({ deletedAt: now, updatedAt: now }).where(eq(schema.end.id, endId));
	await log('round_end', endId, 'delete');

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
	const done = (await listAllActivities()).filter((a) => ids.has(a.sessionId));
	const activities = done.filter((a) => a.kind === 'scoring');
	/**
	 * An outing counts once something happened in it, training arrows included. A session opened and
	 * left empty says nothing about the bow, so it is not one of its outings.
	 */
	const used = new Set(
		done.filter((a) => a.arrowsShot > 0 || a.kind !== 'training').map((a) => a.sessionId)
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
		arrowsShot: done.reduce((sum, a) => sum + a.arrowsShot, 0),
		bestScore: finished.length > 0 ? Math.max(...finished.map((a) => a.totalScore)) : null,
		lastUsedAt: outings.length > 0 ? Math.max(...outings.map((s) => s.startedAt)) : null
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
		.where(isNull(schema.end.deletedAt));

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
				sessionKind: session?.kind ?? 'practice',
				// The bow the outing named, or the generic type when it only recorded that much.
				bowType: (session?.bowId ? bowTypes.get(session.bowId) : session?.bowType) ?? null,
				windKmh: typeof weather?.windSpeedKmh === 'number' ? weather.windSpeedKmh : null,
				temperatureC: typeof weather?.temperatureC === 'number' ? weather.temperatureC : null,
				location: session?.location ?? null,
				ends: endsByActivity.get(activity.id) ?? [],
				match: matchResults.get(activity.id) ?? null
			};
		}),
		sightMarks: marks,
		// The bar a weekly badge is measured against is what this week asks for, dates included.
		weekArrowGoal: weekArrowGoalOn(startOfWeek(Date.now()), live.slots, live.plans)
	};
}

async function writeBadges(keys: { key: string; earnedAt: number }[]) {
	const rows = keys.map((entry) => ({ ...stamp(), key: entry.key, earnedAt: entry.earnedAt }));
	if (rows.length === 0) return;
	await db().insert(schema.badge).values(rows);
	await logMany(
		'badge',
		rows.map((row) => row.id),
		'insert'
	);
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
	await logMany(
		'badge',
		stale.map((row) => row.id),
		'delete'
	);

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
