import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { db, schema } from './index';
import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
import { endSlots, sumShots, countLabel } from '$lib/domain/rounds/geometry';

/**
 * All persistence goes through here. Two things it guarantees that scattered
 * queries would not:
 *   1. every mutation is written to `change_log`, so phase-3 sync has a history;
 *   2. soft-deleted rows are filtered out of every read.
 */

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
	await db().insert(schema.changeLog).values({
		tableName: table,
		rowId,
		op,
		changedAt: Date.now(),
		syncedAt: null
	});
}

export async function createSession(
	round: RoundDefinition,
	opts: { kind?: string; bowRevisionId?: string; location?: string } = {}
) {
	const base = stamp();
	await db()
		.insert(schema.session)
		.values({
			...base,
			roundDefinitionId: round.id,
			bowRevisionId: opts.bowRevisionId ?? null,
			startedAt: base.createdAt,
			kind: opts.kind ?? 'practice',
			location: opts.location ?? null,
			status: 'in_progress'
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

export type SessionRow = Awaited<ReturnType<typeof listSessions>>[number];

export async function getSession(id: string): Promise<SessionRow | null> {
	const rows = await db().select().from(schema.session).where(eq(schema.session.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function listEnds(sessionId: string) {
	return db()
		.select()
		.from(schema.end)
		.where(and(eq(schema.end.sessionId, sessionId), isNull(schema.end.deletedAt)))
		.orderBy(asc(schema.end.stageIndex), asc(schema.end.endNo));
}

export async function listShots(endId: string) {
	return db()
		.select()
		.from(schema.shot)
		.where(and(eq(schema.shot.endId, endId), isNull(schema.shot.deletedAt)))
		.orderBy(asc(schema.shot.ordinal));
}

/**
 * Records a completed end and refreshes the session's denormalised totals.
 *
 * Totals are recomputed from the stored shots rather than incremented, so an
 * edited or re-recorded end can never leave the session's total drifting away
 * from the arrows that actually justify it.
 */
export async function recordEnd(
	sessionId: string,
	stageIndex: number,
	endNo: number,
	shots: Omit<Shot, 'ordinal'>[]
) {
	const endBase = stamp();
	const subtotal = shots.reduce((sum, s) => sum + s.value, 0);

	await db().insert(schema.end).values({
		...endBase,
		sessionId,
		stageIndex,
		endNo,
		subtotal
	});
	await log('round_end', endBase.id, 'insert');

	for (const [index, s] of shots.entries()) {
		const shotBase = stamp();
		await db()
			.insert(schema.shot)
			.values({
				...shotBase,
				endId: endBase.id,
				ordinal: index + 1,
				value: s.value,
				zoneLabel: s.zoneLabel,
				x: s.x,
				y: s.y,
				source: s.source
			});
		await log('shot', shotBase.id, 'insert');
	}

	await refreshSessionTotals(sessionId);
	return endBase.id;
}

export async function refreshSessionTotals(sessionId: string) {
	const ends = await listEnds(sessionId);
	const allShots: Shot[] = [];
	for (const e of ends) {
		const rows = await listShots(e.id);
		allShots.push(
			...rows.map((r) => ({
				ordinal: r.ordinal,
				value: r.value,
				zoneLabel: r.zoneLabel,
				x: r.x,
				y: r.y,
				source: r.source as Shot['source']
			}))
		);
	}

	await db()
		.update(schema.session)
		.set({
			totalScore: sumShots(allShots),
			// An X is also a 10: counting them separately would understate the tens.
			count10s: countLabel(allShots, '10') + countLabel(allShots, 'X'),
			countX: countLabel(allShots, 'X'),
			arrowsShot: allShots.length,
			updatedAt: Date.now()
		})
		.where(eq(schema.session.id, sessionId));
	await log('session', sessionId, 'update');
}

export async function finishSession(sessionId: string) {
	await db()
		.update(schema.session)
		.set({ status: 'complete', endedAt: Date.now(), updatedAt: Date.now() })
		.where(eq(schema.session.id, sessionId));
	await log('session', sessionId, 'update');
}

/** Soft delete — a hard delete leaves nothing for sync to propagate. */
export async function deleteSession(sessionId: string) {
	const now = Date.now();
	await db()
		.update(schema.session)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(schema.session.id, sessionId));
	await log('session', sessionId, 'delete');
}

/** Which end comes next, or null when the round is fully shot. */
export function nextEndSlot(round: RoundDefinition, endsRecorded: number) {
	const slots = endSlots(round);
	return endsRecorded < slots.length ? slots[endsRecorded] : null;
}

export function shotFromZone(zone: Zone, source: Shot['source'] = 'manual'): Omit<Shot, 'ordinal'> {
	return { value: zone.value, zoneLabel: zone.label, x: null, y: null, source };
}
