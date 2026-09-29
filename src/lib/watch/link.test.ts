import { describe, it, expect, beforeEach } from 'vitest';
import { WA_10_RING } from '$lib/domain/rounds/seed';
import { missZone, scorableZones } from '$lib/domain/rounds/geometry';
import { WatchLink, belongsHere, type LinkEvent, type RecordedEnd, type Record, type Round } from './link';
import {
	decode,
	encode,
	endKey,
	PHONE_CAN,
	PROTOCOL_VERSION,
	type EndState,
	type Wire
} from './protocol';
import type { PlannedShot } from './apply';

const ROUND: Round = {
	activityId: 'activity-1',
	// Keypad order, as `mirror.ts` builds it: the link sends what it is given, in the order given.
	zones: [...scorableZones(WA_10_RING), missZone(WA_10_RING)],
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
	it('says hello with this device, its clock, and that it acks controls', async () => {
		await link.open();
		expect(sent).toEqual([{ v: PROTOCOL_VERSION, t: 'hello', k: PHONE_CAN.ACK_CONTROLS, d: 'phone', c: PHONE_NOW }]);
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
		/**
		 * In the order the keys are drawn, highest first. A score set runs the other way, outermost to
		 * innermost, and sending it as it stands puts M in the corner an archer reaches for X.
		 */
		expect(round.z[0]).toEqual(['X', 10]);
		expect(round.z[1]).toEqual(['10', 10]);
		expect(round.z[round.z.length - 1]).toEqual(['M', 0]);
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

	/**
	 * The failure behind heart rates that stopped mid run: a page frozen with a hello out thawed, its
	 * liveness timer fired before the queued answer was read, and a healthy link was called stale and
	 * taken down, the native run with it. A timer that fires far late is a page that was asleep.
	 */
	it('asks again rather than calling the link stale when its timer fires long after it was due', async () => {
		let clock = PHONE_NOW;
		const late = new WatchLink(
			{
				send: async (bytes) => {
					const decoded = decode(bytes);
					if (decoded.ok) sent.push(decoded.message);
				}
			},
			'phone',
			(event) => events.push(event),
			() => clock,
			(run) => timers.push(run)
		);
		await late.open();
		sent = [];
		// Frozen with the screen off for most of an hour, then thawed.
		clock += 45 * 60_000;
		elapse();
		expect(events.filter((e) => e.kind === 'stale')).toHaveLength(0);
		expect(sent.map((m) => m.t)).toEqual(['hello']);
		// The answer that was queued behind the timer, read now.
		await late.receive(encode({ v: 2, t: 'hello', d: 'watch', c: clock }));
		elapse();
		expect(events.filter((e) => e.kind === 'stale')).toHaveLength(0);
		expect(late.live).toBe(true);
	});

	it('still calls the link stale when nobody answered while the page was awake throughout', async () => {
		let clock = PHONE_NOW;
		const awake = new WatchLink(
			{ send: async () => {} },
			'phone',
			(event) => events.push(event),
			() => clock,
			(run) => timers.push(run)
		);
		await awake.open();
		clock += 2500;
		elapse();
		expect(events).toContainEqual({ kind: 'stale' });
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

/**
 * Run controls reaching the page, which in the installed app only an old watch's do: the native side
 * takes the rest. In a browser this is where every one of them lands.
 */
describe('a run control from the wrist', () => {
	it('takes a stamped press once and acks every copy of it, since the watch sends it until acked', async () => {
		await link.receive(encode({ v: 2, t: 'rl', at: 42 }));
		await link.receive(encode({ v: 2, t: 'rl', at: 42 }));
		expect(events).toEqual([{ kind: 'command', command: 'lap' }]);
		expect(sent).toEqual([
			{ v: PROTOCOL_VERSION, t: 'ck', at: 42 },
			{ v: PROTOCOL_VERSION, t: 'ck', at: 42 }
		]);
	});

	it('takes two presses as two', async () => {
		await link.receive(encode({ v: 2, t: 'rl', at: 42 }));
		await link.receive(encode({ v: 2, t: 'rl', at: 43 }));
		expect(events).toEqual([
			{ kind: 'command', command: 'lap' },
			{ kind: 'command', command: 'lap' }
		]);
	});

	it('takes an unstamped press as it always did, and acks nothing', async () => {
		await link.receive(encode({ v: 2, t: 're' }));
		expect(events).toEqual([{ kind: 'command', command: 'stop' }]);
		expect(sent).toEqual([]);
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

describe('telling the watch about every end', () => {
	it('leaves out ends nobody has shot, which the watch already shows as empty', async () => {
		await withRound();
		await record.writeEnd(0, 2, [{ ordinal: 1, value: 10, zoneLabel: 'X' }]);

		await link.pushAll();

		const ends = sent.filter((m) => m.t === 'end');
		expect(ends).toHaveLength(1);
		expect(ends[0]).toMatchObject({ s: 0, n: 2 });
	});

	/**
	 * Undo on the phone. The end is gone from the record, and saying nothing about it would leave
	 * the arrows on the wrist that the phone has just taken away.
	 */
	it('sends an end it has already sent as empty once it has been undone', async () => {
		await withRound();
		await record.writeEnd(0, 1, [{ ordinal: 1, value: 9, zoneLabel: '9' }]);
		await link.pushAll();
		sent = [];

		await record.removeEnd(0, 1);
		await link.pushAll();

		const ends = sent.filter((m) => m.t === 'end');
		expect(ends).toHaveLength(1);
		if (ends[0]?.t !== 'end') return;
		expect(ends[0].n).toBe(1);
		expect(ends[0].l.every((label) => label === null)).toBe(true);
	});

	it('stops mentioning it once the watch has been told it is empty', async () => {
		await withRound();
		await record.writeEnd(0, 1, [{ ordinal: 1, value: 9, zoneLabel: '9' }]);
		await link.pushAll();
		await record.removeEnd(0, 1);
		await link.pushAll();
		sent = [];

		await link.pushAll();

		expect(sent.filter((m) => m.t === 'end')).toHaveLength(0);
	});

	it('forgets what the last round was told when another one is opened', async () => {
		await withRound();
		await record.writeEnd(0, 1, [{ ordinal: 1, value: 9, zoneLabel: '9' }]);
		await link.pushAll();

		await link.setRound({ ...ROUND, activityId: 'activity-2' }, new FakeRecord());
		sent = [];
		await link.pushAll();

		// A different activity's watch state is not this one's to correct.
		expect(sent.filter((m) => m.t === 'end')).toHaveLength(0);
	});
});

describe('recorded motion', () => {
	const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
	const b64 = (part: Uint8Array) => btoa(String.fromCharCode(...part));
	const header: Wire = { v: 2, t: 'mh', k: 42, a: 'activity-1', s: 0, n: 3, st: 5000, du: 60_000, b: 7 };
	let kept: RecordedEnd[];

	beforeEach(() => {
		kept = [];
		link.keepMotion = async (end) => {
			kept.push(end);
		};
	});

	async function chunk(offset: number, part: Uint8Array) {
		await link.receive(encode({ v: 2, t: 'mc', k: 42, o: offset, d: b64(part) }));
	}

	it('puts an end back together in whatever order the chunks arrive, and says it is kept', async () => {
		await link.receive(encode(header));
		await chunk(4, bytes.slice(4));
		await chunk(0, bytes.slice(0, 4));
		expect(kept).toHaveLength(1);
		expect([...kept[0].data]).toEqual([...bytes]);
		expect(kept[0]).toMatchObject({ activityId: 'activity-1', endNo: 3, key: 42, durationMs: 60_000 });
		expect(sent).toContainEqual({ v: 2, t: 'mk', k: 42 });
	});

	it('reads the start on the phone clock', async () => {
		await link.receive(encode({ v: 2, t: 'hello', d: 'watch', c: PHONE_NOW - 3000 }));
		await link.receive(encode(header));
		await chunk(0, bytes);
		expect(kept[0].startedAt).toBe(8000);
	});

	it('ignores chunks that arrive without a header, and a chunk given twice', async () => {
		await chunk(0, bytes.slice(0, 4));
		await link.receive(encode(header));
		await chunk(0, bytes.slice(0, 4));
		await chunk(0, bytes.slice(0, 4));
		expect(kept).toHaveLength(0);
		await chunk(4, bytes.slice(4));
		expect(kept).toHaveLength(1);
	});

	it('does not say kept when keeping failed, so the watch sends it again', async () => {
		link.keepMotion = async () => {
			throw new Error('disk on fire');
		};
		await link.receive(encode(header));
		await chunk(0, bytes);
		expect(sent.some((m) => m.t === 'mk')).toBe(false);
	});

	it('tells the watch whether to record, and again with every round', async () => {
		await link.setMotion(true);
		expect(sent).toContainEqual({ v: 2, t: 'mr', o: 1 });
		sent = [];
		await link.setRound(ROUND, record);
		expect(sent).toContainEqual({ v: 2, t: 'mr', o: 1 });
	});
});

describe('the shot rule', () => {
	it('goes with the recording switch, and fits the message budget', async () => {
		await link.setMotion(true);
		const rule = sent.find((m) => m.t === 'ms');
		expect(rule).toEqual({ v: 2, t: 'ms', r: 250, s: 400, f: 1500, h: 200, g: 3000, a: 700 });
		const most = 9_999_999;
		const worst = { ...rule, r: most, s: most, f: most, h: most, g: most, a: most };
		expect(new TextEncoder().encode(JSON.stringify(worst)).length).toBeLessThanOrEqual(180);
	});
});

describe('the watch alerts', () => {
	it('go with the recording switch, and again when changed', async () => {
		await link.setMotion(false);
		expect(sent).toContainEqual({ v: 2, t: 'al', e: 0, b: 1, d: 0 });
		sent = [];
		await link.setAlerts({ end: true, block: false, distanceMetres: 1500 });
		expect(sent).toEqual([{ v: 2, t: 'al', e: 1, b: 0, d: 1500 }]);
	});
});

/**
 * Assertions the native side kept while the page was elsewhere, offered back on waking. Each carries
 * what the watch was showing when it was made, and only goes where that is open again.
 */
describe('a kept assertion finding its way back', () => {
	it('goes to the round it was scored on, and never onto another', async () => {
		await withRound();
		const end = { v: 2, t: 'end', s: 0, n: 1, l: SIX, at: PHONE_NOW, _scope: ROUND.activityId };
		expect(belongsHere(end, link)).toBe(true);
		expect(belongsHere({ ...end, _scope: 'another-activity' }, link)).toBe(false);
	});

	it('waits while no round is open at all', () => {
		expect(belongsHere({ v: 2, t: 'end', s: 0, n: 1, l: SIX, at: 1, _scope: 'activity-1' }, link)).toBe(false);
	});

	it('goes to the session it was counted in, by the label the watch was shown', async () => {
		const long = 'A session whose name is far too long for any watch to show whole';
		await link.showSession(long, [], 0);
		const count = { v: 2, t: 'arrows', n: 40, at: PHONE_NOW };
		expect(belongsHere({ ...count, _scope: long.slice(0, 40) }, link)).toBe(true);
		expect(belongsHere({ ...count, _scope: 'Another session' }, link)).toBe(false);
	});

	it('takes one kept before scopes existed as it always did', () => {
		expect(belongsHere({ v: 2, t: 'end', s: 0, n: 1, l: SIX, at: 1 }, link)).toBe(true);
	});
});
