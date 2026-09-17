import { describe, it, expect } from 'vitest';
import { WA_10_RING } from '$lib/domain/rounds/seed';
import { planEnd, zoneIndex, localEnd } from './apply';
import type { EndState } from './protocol';

const zones = zoneIndex(WA_10_RING.zones);

function incoming(patch: Partial<EndState> = {}): EndState {
	return {
		stageIndex: 0,
		endNo: 1,
		labels: ['X', '10', '9', '9', '8', '7'],
		updatedAt: 2000,
		deviceId: 'watch',
		...patch
	};
}

function held(patch: Partial<EndState> = {}): EndState {
	return incoming({ updatedAt: 1000, deviceId: 'phone', ...patch });
}

describe('scoring an asserted end', () => {
	it('derives every value from the score set rather than the wire', () => {
		const plan = planEnd(null, incoming(), zones, 6);
		expect(plan.kind).toBe('write');
		if (plan.kind !== 'write') return;
		expect(plan.shots).toEqual([
			{ ordinal: 1, value: 10, zoneLabel: 'X' },
			{ ordinal: 2, value: 10, zoneLabel: '10' },
			{ ordinal: 3, value: 9, zoneLabel: '9' },
			{ ordinal: 4, value: 9, zoneLabel: '9' },
			{ ordinal: 5, value: 8, zoneLabel: '8' },
			{ ordinal: 6, value: 7, zoneLabel: '7' }
		]);
		expect(plan.subtotal).toBe(53);
	});

	it('scores a miss as nothing but still records it', () => {
		const plan = planEnd(null, incoming({ labels: ['M', 'M', null, null, null, null] }), zones, 6);
		expect(plan).toEqual({
			kind: 'write',
			subtotal: 0,
			shots: [
				{ ordinal: 1, value: 0, zoneLabel: 'M' },
				{ ordinal: 2, value: 0, zoneLabel: 'M' }
			]
		});
	});

	it('numbers ordinals from one, the way recordEnd does', () => {
		const plan = planEnd(null, incoming({ labels: ['9', null, null, null, null, null] }), zones, 6);
		if (plan.kind !== 'write') throw new Error('expected a write');
		expect(plan.shots[0].ordinal).toBe(1);
	});

	it('refuses a label the round has no zone for', () => {
		const plan = planEnd(null, incoming({ labels: ['11', null, null, null, null, null] }), zones, 6);
		expect(plan).toEqual({ kind: 'reject', reason: 'unknown-label' });
	});

	it('refuses more arrows than the end holds', () => {
		const plan = planEnd(null, incoming({ labels: new Array(7).fill('9') }), zones, 6);
		expect(plan).toEqual({ kind: 'reject', reason: 'too-many' });
	});

	// An arrow missing before one that was shot cannot be true, and would break what ordinal means.
	it('refuses a hole in the middle of an end', () => {
		const plan = planEnd(null, incoming({ labels: ['9', null, '8', null, null, null] }), zones, 6);
		expect(plan).toEqual({ kind: 'reject', reason: 'gap' });
	});
});

describe('editing and taking arrows back', () => {
	it('replaces the whole end when one arrow is edited', () => {
		const plan = planEnd(
			held(),
			incoming({ labels: ['X', '10', '9', '9', '8', '10'], updatedAt: 3000 }),
			zones,
			6
		);
		if (plan.kind !== 'write') throw new Error('expected a write');
		expect(plan.shots).toHaveLength(6);
		expect(plan.shots[5]).toEqual({ ordinal: 6, value: 10, zoneLabel: '10' });
		expect(plan.subtotal).toBe(56);
	});

	it('shrinks an end when the last arrow is taken back', () => {
		const plan = planEnd(
			held(),
			incoming({ labels: ['X', '10', '9', '9', '8', null], updatedAt: 3000 }),
			zones,
			6
		);
		if (plan.kind !== 'write') throw new Error('expected a write');
		expect(plan.shots).toHaveLength(5);
		expect(plan.subtotal).toBe(46);
	});

	it('deletes the end when the last arrow in it is taken back', () => {
		const plan = planEnd(
			held({ labels: ['9', null, null, null, null, null] }),
			incoming({ labels: [null, null, null, null, null, null], updatedAt: 3000 }),
			zones,
			6
		);
		expect(plan).toEqual({ kind: 'delete' });
	});

	it('will not delete an end on the strength of a stale message', () => {
		const plan = planEnd(
			held({ updatedAt: 5000 }),
			incoming({ labels: [null, null, null, null, null, null], updatedAt: 3000 }),
			zones,
			6
		);
		expect(plan).toEqual({ kind: 'reject', reason: 'older' });
	});
});

describe('the phone and the watch disagreeing', () => {
	it('keeps a phone edit made after the watch message it races', () => {
		const plan = planEnd(held({ updatedAt: 9000 }), incoming({ updatedAt: 8000 }), zones, 6);
		expect(plan).toEqual({ kind: 'reject', reason: 'older' });
	});

	it('takes the watch edit when it is the later one', () => {
		const plan = planEnd(held({ updatedAt: 8000 }), incoming({ updatedAt: 9000 }), zones, 6);
		expect(plan.kind).toBe('write');
	});

	it('is idempotent: the same assertion twice changes nothing the second time', () => {
		const first = incoming({ updatedAt: 4000 });
		expect(planEnd(null, first, zones, 6).kind).toBe('write');
		const stored = localEnd(0, 1, shotsOf(first), 6, first.updatedAt, first.deviceId);
		expect(planEnd(stored, first, zones, 6)).toEqual({ kind: 'reject', reason: 'older' });
	});

	it('settles a tie the same way whichever side is asking', () => {
		const a: EndState = incoming({ updatedAt: 7000, deviceId: 'device-a' });
		const b: EndState = incoming({ updatedAt: 7000, deviceId: 'device-b', labels: ['8', null, null, null, null, null] });
		const oneWay = planEnd(a, b, zones, 6).kind === 'write';
		const otherWay = planEnd(b, a, zones, 6).kind === 'write';
		expect(oneWay).not.toBe(otherWay);
	});
});

describe('reading the phone end back out', () => {
	it('puts arrows at their ordinals and leaves the rest empty', () => {
		const state = localEnd(
			1,
			4,
			[
				{ ordinal: 1, zoneLabel: 'X' },
				{ ordinal: 3, zoneLabel: '8' }
			],
			6,
			1234,
			'phone'
		);
		expect(state).toEqual({
			stageIndex: 1,
			endNo: 4,
			labels: ['X', null, '8', null, null, null],
			updatedAt: 1234,
			deviceId: 'phone'
		});
	});

	it('ignores an ordinal outside the end rather than throwing', () => {
		const state = localEnd(0, 1, [{ ordinal: 99, zoneLabel: '9' }], 6, 1, 'phone');
		expect(state.labels).toEqual([null, null, null, null, null, null]);
	});
});

function shotsOf(state: EndState): { ordinal: number; zoneLabel: string }[] {
	return state.labels
		.map((label, i) => ({ ordinal: i + 1, zoneLabel: label ?? '' }))
		.filter((s) => s.zoneLabel !== '');
}
