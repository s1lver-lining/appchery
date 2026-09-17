import { describe, it, expect } from 'vitest';
import {
	decode,
	encode,
	endKey,
	isEmpty,
	keepIncoming,
	skew,
	MAX_MESSAGE_BYTES,
	PROTOCOL_VERSION,
	type EndState,
	type Wire
} from './protocol';

function end(patch: Partial<EndState> = {}): EndState {
	return {
		stageIndex: 0,
		endNo: 1,
		labels: ['X', '10', '9', '9', '8', '7'],
		updatedAt: 1000,
		deviceId: 'device-a',
		...patch
	};
}

describe('encoding', () => {
	it('round trips every kind of message', () => {
		const messages: Wire[] = [
			{ v: PROTOCOL_VERSION, t: 'hello', d: 'device-a', c: 1789668623593 },
			{
				v: PROTOCOL_VERSION,
				t: 'round',
				a: 'activity-1',
				z: [
					['X', 10],
					['10', 10],
					['M', 0]
				],
				s: [[12, 6]]
			},
			{ v: PROTOCOL_VERSION, t: 'end', s: 0, n: 3, l: ['X', '10', null], at: 1789668623593 },
			{ v: PROTOCOL_VERSION, t: 'ack', s: 0, n: 3, at: 1789668623593 },
			{ v: PROTOCOL_VERSION, t: 'bye' }
		];

		for (const message of messages) {
			const decoded = decode(encode(message));
			expect(decoded.ok, JSON.stringify(message)).toBe(true);
			if (decoded.ok) expect(decoded.message).toEqual(message);
		}
	});

	// The budget is the whole reason the activity and the device id live on the link instead.
	it('keeps a full end inside the MTU budget', () => {
		const message: Wire = {
			v: PROTOCOL_VERSION,
			t: 'end',
			s: 3,
			n: 12,
			l: ['X', '10', '10', '9', '9', '8', '8', '7', '6', '5', 'M', 'M'],
			at: 1789668623593
		};
		expect(encode(message).byteLength).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
	});

	it('keeps a round descriptor for a WA face inside the budget', () => {
		const zones: [string, number][] = [
			['X', 10],
			['10', 10],
			['9', 9],
			['8', 8],
			['7', 7],
			['6', 6],
			['5', 5],
			['4', 4],
			['3', 3],
			['2', 2],
			['1', 1],
			['M', 0]
		];
		const message: Wire = {
			v: PROTOCOL_VERSION,
			t: 'round',
			a: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
			z: zones,
			s: [[12, 6]]
		};
		expect(encode(message).byteLength).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
	});
});

describe('decoding hostile input', () => {
	it('never throws, whatever arrives', () => {
		const rubbish = [
			new Uint8Array(0),
			new Uint8Array([0x7b]),
			new TextEncoder().encode('not json at all'),
			new TextEncoder().encode('null'),
			new TextEncoder().encode('[]'),
			new TextEncoder().encode('"a string"'),
			new TextEncoder().encode('{}'),
			new TextEncoder().encode('{"v":1}'),
			new TextEncoder().encode('{"v":1,"t":"nonsense"}'),
			new TextEncoder().encode('{"v":"one","t":"bye"}'),
			new TextEncoder().encode('{"v":0,"t":"bye"}')
		];
		for (const bytes of rubbish) {
			expect(() => decode(bytes)).not.toThrow();
			expect(decode(bytes).ok, new TextDecoder().decode(bytes)).toBe(false);
		}
	});

	it('names a newer protocol rather than calling it broken', () => {
		const decoded = decode(new TextEncoder().encode('{"v":99,"t":"bye"}'));
		expect(decoded).toEqual({ ok: false, reason: 'unsupported-version', version: 99 });
	});

	it('rejects an end with no arrows or too many', () => {
		expect(decode(encode({ v: 1, t: 'end', s: 0, n: 1, l: [], at: 1 })).ok).toBe(false);
		expect(
			decode(encode({ v: 1, t: 'end', s: 0, n: 1, l: new Array(13).fill('9'), at: 1 })).ok
		).toBe(false);
	});

	it('rejects an end numbered from zero, because ends count from one', () => {
		expect(decode(encode({ v: 1, t: 'end', s: 0, n: 0, l: ['9'], at: 1 })).ok).toBe(false);
	});

	it('rejects a negative stage, a negative time and an overlong label', () => {
		expect(decode(encode({ v: 1, t: 'end', s: -1, n: 1, l: ['9'], at: 1 })).ok).toBe(false);
		expect(decode(encode({ v: 1, t: 'end', s: 0, n: 1, l: ['9'], at: -1 })).ok).toBe(false);
		expect(decode(encode({ v: 1, t: 'end', s: 0, n: 1, l: ['toolong'], at: 1 })).ok).toBe(false);
	});

	it('rejects a malformed zone or stage in a round', () => {
		expect(
			decode(new TextEncoder().encode('{"v":1,"t":"round","a":"x","z":[["X"]],"s":[[12,6]]}')).ok
		).toBe(false);
		expect(
			decode(new TextEncoder().encode('{"v":1,"t":"round","a":"x","z":[["X",10]],"s":[[12,0]]}')).ok
		).toBe(false);
		expect(
			decode(new TextEncoder().encode('{"v":1,"t":"round","a":"x","z":[],"s":[[12,6]]}')).ok
		).toBe(false);
	});

	it('accepts an end from a DataView, which is what a notification hands over', () => {
		const bytes = encode({ v: 1, t: 'end', s: 0, n: 2, l: ['9', null], at: 5 });
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const decoded = decode(view);
		expect(decoded.ok).toBe(true);
		if (decoded.ok && decoded.message.t === 'end') expect(decoded.message.l).toEqual(['9', null]);
	});
});

describe('deciding which copy of an end to keep', () => {
	it('keeps anything when nothing is held', () => {
		expect(keepIncoming(null, end())).toBe(true);
	});

	it('keeps the newer edit', () => {
		expect(keepIncoming(end({ updatedAt: 1000 }), end({ updatedAt: 1001 }))).toBe(true);
		expect(keepIncoming(end({ updatedAt: 1001 }), end({ updatedAt: 1000 }))).toBe(false);
	});

	it('breaks a tie on device id, the same way both sides will', () => {
		const local = end({ updatedAt: 1000, deviceId: 'device-a' });
		const incoming = end({ updatedAt: 1000, deviceId: 'device-b' });
		expect(keepIncoming(local, incoming)).toBe(true);
		// The mirror image has to reach the same answer, or the two disagree for ever.
		expect(keepIncoming(incoming, local)).toBe(false);
	});

	it('keeps the held copy when the two are identical', () => {
		expect(keepIncoming(end(), end())).toBe(false);
	});

	// Taking the last arrow back is an ordinary assertion, so it must be able to win.
	it('lets an end shrink', () => {
		const full = end({ updatedAt: 1000, labels: ['X', '10', '9', '9', '8', '7'] });
		const shorter = end({ updatedAt: 1001, labels: ['X', '10', '9', '9', '8', null] });
		expect(keepIncoming(full, shorter)).toBe(true);
	});

	it('lets an end empty completely', () => {
		const one = end({ updatedAt: 1000, labels: ['X', null, null] });
		const none = end({ updatedAt: 1001, labels: [null, null, null] });
		expect(keepIncoming(one, none)).toBe(true);
		expect(isEmpty(none.labels)).toBe(true);
		expect(isEmpty(one.labels)).toBe(false);
	});
});

describe('bookkeeping', () => {
	it('keys an end by stage and number', () => {
		expect(endKey(0, 1)).toBe('0:1');
		expect(endKey(1, 12)).toBe('1:12');
		expect(endKey(0, 1)).not.toBe(endKey(1, 1));
	});

	it('measures clock skew in the direction that corrects the peer', () => {
		expect(skew(1000, 900)).toBe(100);
		expect(skew(900, 1000)).toBe(-100);
		expect(skew(1000, 1000)).toBe(0);
	});
});
