import { describe, it, expect, beforeEach } from 'vitest';
import { WA_10_RING } from '$lib/domain/rounds/seed';
import { WatchLink, type LinkEvent, type Record, type Round } from './link';
import { decode, encode, endKey, PROTOCOL_VERSION, type EndState, type Wire } from './protocol';
import type { PlannedShot } from './apply';

const ROUND: Round = {
	activityId: 'activity-1',
	zones: WA_10_RING.zones,
	stages: [{ ends: 3, arrowsPerEnd: 6 }]
};

/** The record, in a map, so the session's decisions can be watched without a database. */
class FakeRecord implements Record {
	ends = new Map<string, EndState>();
	removed: string[] = [];
	failWrites = false;

	async readEnd(stageIndex: number, endNo: number): Promise<EndState | null> {
		return this.ends.get(endKey(stageIndex, endNo)) ?? null;
	}

	async writeEnd(stageIndex: number, endNo: number, shots: PlannedShot[]): Promise<void> {
		if (this.failWrites) throw new Error('disk on fire');
		const labels: (string | null)[] = new Array(6).fill(null);
		for (const shot of shots) labels[shot.ordinal - 1] = shot.zoneLabel;
		this.ends.set(endKey(stageIndex, endNo), {
			stageIndex,
			endNo,
			labels,
			updatedAt: 10_000,
			deviceId: 'phone'
		});
	}

	async removeEnd(stageIndex: number, endNo: number): Promise<void> {
		this.removed.push(endKey(stageIndex, endNo));
		this.ends.delete(endKey(stageIndex, endNo));
	}
}

let sent: Wire[];
let events: LinkEvent[];
let record: FakeRecord;
let link: WatchLink;
let timers: (() => void)[];

/** The phone's clock, fixed, so what the session does with the watch's is visible. */
const PHONE_NOW = 1_000_000;

beforeEach(() => {
	sent = [];
	events = [];
	record = new FakeRecord();
	timers = [];
	link = new WatchLink(
		{
			send: async (bytes) => {
				const decoded = decode(bytes);
				if (!decoded.ok) throw new Error('the link encoded something undecodable');
				sent.push(decoded.message);
			}
		},
		'phone',
		(event) => events.push(event),
		() => PHONE_NOW,
		(run) => timers.push(run)
	);
});

/** Fires whatever the link asked to have run later, so liveness can be tested without waiting. */
function elapse() {
	const due = timers;
	timers = [];
	for (const run of due) run();
}

/** The scoring context, which most of these tests need in place first. */
async function withRound() {
	await link.setRound(ROUND, record);
	sent = [];
	events = [];
}

function watchEnd(labels: (string | null)[], at: number): Uint8Array {
	return encode({ v: 1, t: 'end', s: 0, n: 1, l: labels, at });
}

const SIX = ['X', '10', '9', '9', '8', '7'];

describe('opening a link', () => {
	it('says hello with this device and its clock', async () => {
		await link.open();
		expect(sent).toEqual([{ v: PROTOCOL_VERSION, t: 'hello', d: 'phone', c: PHONE_NOW }]);
	});

	it('answers a hello with the round, so the watch can draw the right keypad', async () => {
		await link.setRound(ROUND, record);
		sent = [];
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		const round = sent.find((m) => m.t === 'round');
		expect(round).toBeDefined();
		if (round?.t !== 'round') return;
		expect(round.a).toBe('activity-1');
		expect(round.s).toEqual([[3, 6]]);
		expect(round.z).toContainEqual(['X', 10]);
		expect(round.z).toContainEqual(['M', 0]);
	});

	it('remembers who it is talking to', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch-abc', c: PHONE_NOW }));
		expect(link.peer).toBe('watch-abc');
		expect(events[0]).toEqual({ kind: 'greeted', peerDeviceId: 'watch-abc', offsetMs: 0 });
	});

	it('measures a watch clock that is behind and says by how much', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW - 5000 }));
		expect(events[0]).toEqual({ kind: 'greeted', peerDeviceId: 'watch', offsetMs: 5000 });
	});

	it('sends the ends already shot, so a watch joining mid round shows the real card', async () => {
		record.ends.set(endKey(0, 1), {
			stageIndex: 0,
			endNo: 1,
			labels: SIX,
			updatedAt: 500,
			deviceId: 'phone'
		});
		await link.setRound(ROUND, record);
		sent = [];
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));

		const ends = sent.filter((m) => m.t === 'end');
		expect(ends).toHaveLength(1);
		if (ends[0].t !== 'end') return;
		expect(ends[0].l).toEqual(SIX);
	});

	it('says nothing about ends never shot', async () => {
		await link.setRound(ROUND, record);
		sent = [];
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		expect(sent.filter((m) => m.t === 'end')).toHaveLength(0);
	});
});

describe('an end arriving from the watch', () => {
	beforeEach(async () => {
		await withRound();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		sent = [];
		events = [];
	});

	it('is written and acknowledged', async () => {
		await link.receive(watchEnd(SIX, PHONE_NOW));

		expect(record.ends.get(endKey(0, 1))?.labels).toEqual(SIX);
		expect(events).toContainEqual({ kind: 'applied', stageIndex: 0, endNo: 1 });
		expect(sent).toContainEqual({ v: PROTOCOL_VERSION, t: 'ack', s: 0, n: 1, at: PHONE_NOW });
	});

	// The watch keeps its queue keyed on its own timestamps, so the ack has to speak its clock.
	it('acknowledges on the watch clock, not the phone clock', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW - 5000 }));
		sent = [];
		await link.receive(watchEnd(SIX, PHONE_NOW - 5000));
		const ack = sent.find((m) => m.t === 'ack');
		if (ack?.t !== 'ack') throw new Error('expected an ack');
		expect(ack.at).toBe(PHONE_NOW - 5000);
	});

	it('takes the end away when the last arrow in it was taken back', async () => {
		await link.receive(watchEnd(SIX, PHONE_NOW));
		await link.receive(watchEnd([null, null, null, null, null, null], PHONE_NOW + 1));
		expect(record.removed).toEqual([endKey(0, 1)]);
	});

	it('refuses a label the round has no zone for and stays quiet about the record', async () => {
		await link.receive(watchEnd(['11', null, null, null, null, null], PHONE_NOW));
		expect(record.ends.size).toBe(0);
		expect(events).toContainEqual({
			kind: 'refused',
			stageIndex: 0,
			endNo: 1,
			reason: 'unknown-label'
		});
	});

	it('refuses a stage the round does not have', async () => {
		await link.receive(encode({ v: 1, t: 'end', s: 7, n: 1, l: ['9'], at: PHONE_NOW }));
		expect(events).toContainEqual({
			kind: 'refused',
			stageIndex: 7,
			endNo: 1,
			reason: 'no-such-stage'
		});
	});

	it('survives a write that fails, and leaves the watch free to try again', async () => {
		record.failWrites = true;
		await expect(link.receive(watchEnd(SIX, PHONE_NOW))).resolves.toBeUndefined();
		expect(sent.filter((m) => m.t === 'ack')).toHaveLength(0);
	});
});

describe('the phone and the watch disagreeing', () => {
	beforeEach(async () => {
		await withRound();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		sent = [];
		events = [];
	});

	/**
	 * The case worth being careful about: an assertion the phone has already moved past must not be
	 * applied, and the watch must be told what is true instead or the two sit disagreeing for ever.
	 */
	it('refuses a stale assertion and sends its own copy back', async () => {
		record.ends.set(endKey(0, 1), {
			stageIndex: 0,
			endNo: 1,
			labels: ['X', '10', '10', '9', '9', '9'],
			updatedAt: PHONE_NOW,
			deviceId: 'phone'
		});

		await link.receive(watchEnd(SIX, PHONE_NOW - 1000));

		expect(record.ends.get(endKey(0, 1))?.labels).toEqual(['X', '10', '10', '9', '9', '9']);
		expect(events).toContainEqual({ kind: 'refused', stageIndex: 0, endNo: 1, reason: 'older' });

		const pushed = sent.find((m) => m.t === 'end');
		if (pushed?.t !== 'end') throw new Error('expected the phone copy to go back');
		expect(pushed.l).toEqual(['X', '10', '10', '9', '9', '9']);
	});

	it('does not send anything back when the refusal was the watch being wrong, not late', async () => {
		await link.receive(watchEnd(['11', null, null, null, null, null], PHONE_NOW));
		expect(sent.filter((m) => m.t === 'end')).toHaveLength(0);
	});

	it('takes a watch edit that really is newer', async () => {
		record.ends.set(endKey(0, 1), {
			stageIndex: 0,
			endNo: 1,
			labels: ['X', '10', '10', '9', '9', '9'],
			updatedAt: PHONE_NOW - 1000,
			deviceId: 'phone'
		});
		await link.receive(watchEnd(SIX, PHONE_NOW));
		expect(record.ends.get(endKey(0, 1))?.labels).toEqual(SIX);
	});

	/**
	 * A watch five seconds behind must not lose an edit it genuinely made later. Without the offset
	 * its timestamps read as older than the phone's and every one of its arrows would be refused.
	 */
	it('corrects for a watch clock that runs behind before comparing', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW - 5000 }));
		record.ends.set(endKey(0, 1), {
			stageIndex: 0,
			endNo: 1,
			labels: ['1', null, null, null, null, null],
			updatedAt: PHONE_NOW - 100,
			deviceId: 'phone'
		});

		// On the watch's clock this is a moment ago; on the phone's it is newer than what is held.
		await link.receive(watchEnd(SIX, PHONE_NOW - 5000 + 1));
		expect(record.ends.get(endKey(0, 1))?.labels).toEqual(SIX);
	});
});

describe('pushing a phone edit to the wrist', () => {
	beforeEach(async () => {
		await withRound();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		sent = [];
	});

	it('sends the end as the phone now holds it', async () => {
		record.ends.set(endKey(0, 2), {
			stageIndex: 0,
			endNo: 2,
			labels: ['8', '8', null, null, null, null],
			updatedAt: PHONE_NOW,
			deviceId: 'phone'
		});
		await link.pushEnd(0, 2);

		const pushed = sent.find((m) => m.t === 'end');
		if (pushed?.t !== 'end') throw new Error('expected an end');
		expect(pushed.n).toBe(2);
		expect(pushed.l).toEqual(['8', '8', null, null, null, null]);
	});

	// Deleting an end on the phone has to reach the watch as well, as an end with nothing in it.
	it('sends an empty end when the phone no longer has one', async () => {
		await link.pushEnd(0, 3);
		const pushed = sent.find((m) => m.t === 'end');
		if (pushed?.t !== 'end') throw new Error('expected an end');
		expect(pushed.l).toEqual([null, null, null, null, null, null]);
	});

	it('says nothing about a stage the round does not have', async () => {
		await link.pushEnd(9, 1);
		expect(sent).toHaveLength(0);
	});
});

describe('nonsense on the wire', () => {
	it('reports noise without throwing', async () => {
		await expect(
			link.receive(new TextEncoder().encode('half a packet'))
		).resolves.toBeUndefined();
		expect(events).toEqual([{ kind: 'noise' }]);
	});

	it('names a newer protocol so the archer can be told to update', async () => {
		await link.receive(new TextEncoder().encode('{"v":99,"t":"bye"}'));
		expect(events).toEqual([{ kind: 'version-mismatch', theirs: 99, ours: PROTOCOL_VERSION }]);
	});

	it('notices a deliberate goodbye', async () => {
		await link.receive(encode({ v: 1, t: 'bye' }));
		expect(events).toEqual([{ kind: 'farewell' }]);
	});

	it('ignores an ack, having nothing to do with one', async () => {
		await link.receive(encode({ v: 1, t: 'ack', s: 0, n: 1, at: 1 }));
		expect(events).toEqual([]);
	});
});

describe('not believing the link until the watch answers', () => {
	/**
	 * The failure this exists for: re-registering the service gives it new handles, so a phone
	 * holding the old ones subscribes to nothing. The transport reports a healthy connection either
	 * way, so silence is the only signal there is.
	 */
	it('reports a link nobody answered', async () => {
		await link.open();
		expect(link.live).toBe(false);
		elapse();
		expect(events).toContainEqual({ kind: 'stale' });
	});

	it('says nothing about staleness once the watch has spoken', async () => {
		await link.open();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		elapse();
		expect(events.filter((e) => e.kind === 'stale')).toHaveLength(0);
		expect(link.live).toBe(true);
	});

	it('stops believing the link when the watch says goodbye', async () => {
		await link.open();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		await link.receive(encode({ v: 1, t: 'bye' }));
		expect(link.live).toBe(false);
	});

	// A watch that restarted has forgotten everything and cannot say so, so it is told again.
	it('sends the screen and the round again on a second hello', async () => {
		await withRound();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		expect(sent.filter((m) => m.t === 'screen')).toHaveLength(1);
		expect(sent.filter((m) => m.t === 'round')).toHaveLength(1);
	});
});

describe('showing the session', () => {
	it('sends the screen, the session and one message per activity', async () => {
		await link.showSession(
			'Tuesday evening',
			[
				{ kind: 'scoring', label: 'WA 720 (70m)', scorable: true },
				{ kind: 'tuning', label: 'Bare shaft', scorable: false }
			],
			42
		);

		expect(sent[0]).toEqual({ v: 2, t: 'screen', s: 'session' });
		expect(sent[1]).toEqual({ v: 2, t: 'session', l: 'Tuesday evening', c: 2, a: 42 });
		expect(sent[2]).toEqual({ v: 2, t: 'activity', i: 0, k: 'scoring', l: 'WA 720 (70m)', s: 1 });
		expect(sent[3]).toEqual({ v: 2, t: 'activity', i: 1, k: 'tuning', l: 'Bare shaft', s: 0 });
	});

	it('cuts a name too long for the wire rather than being refused by it', async () => {
		await link.showSession('x'.repeat(80), [], 0);
		const session = sent.find((m) => m.t === 'session');
		if (session?.t !== 'session') throw new Error('expected a session');
		expect(session.l).toHaveLength(40);
	});

	it('goes back to idle when the phone leaves the session', async () => {
		await link.showIdle();
		expect(sent).toEqual([{ v: 2, t: 'screen', s: 'idle' }]);
	});
});

describe('what the watch asks for', () => {
	it('passes on a request to open an activity without acting on it itself', async () => {
		await link.receive(encode({ v: 2, t: 'open', i: 3 }));
		expect(events).toEqual([{ kind: 'open', index: 3 }]);
	});

	it('reads an arrow total onto this device clock', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW - 5000 }));
		events = [];
		await link.receive(encode({ v: 2, t: 'arrows', n: 48, at: PHONE_NOW - 5000 }));
		expect(events).toEqual([{ kind: 'arrows', total: 48, at: PHONE_NOW }]);
	});

	it('sends an arrow total back on the watch clock', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW - 5000 }));
		sent = [];
		await link.pushArrows(48, PHONE_NOW);
		expect(sent).toEqual([{ v: 2, t: 'arrows', n: 48, at: PHONE_NOW - 5000 }]);
	});

	/** An arrow with nowhere to go is refused rather than written onto a guess. */
	it('refuses an end when no round is open', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		events = [];
		await link.receive(encode({ v: 1, t: 'end', s: 0, n: 1, l: SIX, at: PHONE_NOW }));
		expect(events).toContainEqual({
			kind: 'refused',
			stageIndex: 0,
			endNo: 1,
			reason: 'no-round'
		});
		expect(record.ends.size).toBe(0);
	});

	it('refuses an end again once the round has been left', async () => {
		await withRound();
		link.clearRound();
		await link.receive(encode({ v: 1, t: 'end', s: 0, n: 1, l: SIX, at: PHONE_NOW }));
		expect(record.ends.size).toBe(0);
	});
});

describe('checking on a link that is already up', () => {
	/** Re-sending the session and every end every few seconds would fill the air for nothing. */
	it('says nothing again when the watch was already answering', async () => {
		await withRound();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		sent = [];

		await link.ping();
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));

		// The hello it sent, and nothing else: no screen, no round, no ends.
		expect(sent.filter((m) => m.t === 'hello')).toHaveLength(1);
		expect(sent.filter((m) => m.t === 'screen')).toHaveLength(0);
		expect(sent.filter((m) => m.t === 'round')).toHaveLength(0);
		expect(sent.filter((m) => m.t === 'end')).toHaveLength(0);
	});

	it('reports a link that stops answering', async () => {
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		expect(link.live).toBe(true);

		await link.ping();
		elapse();
		expect(link.live).toBe(false);
		expect(events).toContainEqual({ kind: 'stale' });
	});

	/** The watch app restarting is exactly this: it comes back knowing nothing at all. */
	it('tells a recovered watch everything again', async () => {
		await link.showSession('Tuesday evening', [{ kind: 'scoring', label: 'WA 720', scorable: true }], 12);
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));

		await link.ping();
		elapse();
		sent = [];
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));

		expect(sent.filter((m) => m.t === 'screen')).toHaveLength(1);
		const session = sent.find((m) => m.t === 'session');
		if (session?.t !== 'session') throw new Error('expected the session again');
		// The counter has to come back with it, or the wrist shows nothing shot.
		expect(session.a).toBe(12);
		expect(sent.filter((m) => m.t === 'activity')).toHaveLength(1);
	});

	it('forgets the session once the phone has left it', async () => {
		await link.showSession('Tuesday evening', [], 12);
		await link.showIdle();
		await link.ping();
		elapse();
		sent = [];
		await link.receive(encode({ v: 1, t: 'hello', d: 'watch', c: PHONE_NOW }));
		expect(sent.filter((m) => m.t === 'session')).toHaveLength(0);
	});
});
