import { resolve, type Mergeable } from '$lib/sync/merge';

/**
 * What travels between the phone and the watch. See doc/llm-memory/watch-link.md for why the shape
 * is what it is; the rules worth stating here are the two that keep it resilient.
 *
 * An end is asserted whole, never as a delta. "End 3 of stage 0 is X, 10, 9, 9, 8, 7" survives being
 * sent twice, arriving late, or arriving after the sender has been rebooted, and an arrow edited or
 * an arrow taken back are the same kind of message as an arrow added. A queue of assertions also
 * collapses: only the newest one per end is worth keeping, so an hour out of range costs a handful
 * of messages rather than one per tap.
 *
 * Context lives on the link rather than in every message. The peer's device id arrives once in
 * `hello` and the activity once in `round`, because two UUIDs on every end would put a six arrow end
 * at about 170 bytes against an MTU that cannot be relied on past 180.
 */

export const PROTOCOL_VERSION = 2;

/**
 * Default BLE MTU leaves 20 usable bytes and Chrome negotiates about 185 with no way to ask for
 * more, so nothing may be written that assumes headroom above this.
 */
export const MAX_MESSAGE_BYTES = 180;

/** The most arrows an end may carry, generous against every round the app ships. */
const MAX_ARROWS = 12;

/** A zone label is `10`, `X`, `M`, `vital`: nothing longer travels. */
const MAX_LABEL_LENGTH = 6;

/** A round or session name, cut by the sender: a watch cannot show more than this anyway. */
const MAX_NAME_LENGTH = 40;

/**
 * An activity is referred to by its position in the session rather than by its id. Four uuids in one
 * message comes to about 307 bytes against a budget of 180, so the phone keeps the map and the wire
 * carries an index.
 */
const MAX_ACTIVITIES = 60;

export type Wire =
	/** Who is on the other end, and what its clock reads, so the two can be compared. */
	| { v: number; t: 'hello'; d: string; c: number }
	/** What is being shot: the score set's labels and values, and the shape of each stage. */
	| { v: number; t: 'round'; a: string; z: [string, number][]; s: [number, number][] }
	/** One end, entire. A label is null where no arrow has been shot yet. */
	| { v: number; t: 'end'; s: number; n: number; l: (string | null)[]; at: number }
	/** The end named has been applied as of `at`, so the sender may forget its pending copy. */
	| { v: number; t: 'ack'; s: number; n: number; at: number }
	/** Which screen the watch should be showing, so the wrist follows the phone. */
	| { v: number; t: 'screen'; s: Screen }
	/** The session the phone has open: its name, how many activities it holds, its training arrows. */
	| { v: number; t: 'session'; l: string; c: number; a: number }
	/** One activity in that session, by position. `s` is whether the watch can score it. */
	| { v: number; t: 'activity'; i: number; k: string; l: string; s: 0 | 1 }
	/** The watch asking the phone to open an activity, since the phone owns where the two are. */
	| { v: number; t: 'open'; i: number }
	/** The watch asking to come back out of wherever it is, for the same reason. */
	| { v: number; t: 'back' }
	/**
	 * The session's training arrows, entire rather than as a difference. A count sent as "add six"
	 * doubles when the message arrives twice, and arriving twice is normal for a queue.
	 */
	| { v: number; t: 'arrows'; n: number; at: number }
	/**
	 * A run as it stands. Sent while one is going and never stored, so it carries everything the
	 * wrist draws and nothing it has to remember.
	 *
	 * Deliberately not a new `screen`: a watch built before runs existed ignores a message type it
	 * has never heard of and goes on showing the session, where a screen name it does not know would
	 * leave it with nothing drawn at all. The block fields are left out entirely when the run follows
	 * no programme, which is what keeps this inside one write.
	 */
	| {
			v: number;
			t: 'run';
			st: RunStatus;
			/** Seconds, metres, seconds per kilometre, all whole: a wrist reads no decimals. */
			s: number;
			d: number;
			p: number;
			a: number;
			/** Counts up on every block change, which is what the watch buzzes for. */
			c: number;
			/** Seconds since the programme ran out and the run carried on, counting up rather than down. */
			fr?: number;
			/**
			 * Which zone the beat the watch is reading falls in, one to five.
			 *
			 * Worked out on the phone and sent back rather than worked out where it is measured,
			 * because the zone is the beat against that runner's own maximum and the maximum is a
			 * setting of the app. The wrist would otherwise need to be told it and kept up to date
			 * with it, for a figure the phone can send in eight bytes.
			 */
			hz?: number;
			k?: BlockKind;
			/** What the block is called, cut by the sender. */
			b?: string;
			i?: number;
			n?: number;
			r?: number;
			ro?: number;
			tp?: number;
			/** What is left of the block, in whichever unit it is run to. */
			ls?: number;
			lm?: number;
			/** The whole of what the block asks for, so the wrist can draw how much of it is done. */
			gs?: number;
			gm?: number;
			/** What comes next, which is worth knowing before it arrives. */
			nk?: BlockKind;
			ntp?: number;
			/** And what it will ask for, in whichever unit it is run to. */
			ngs?: number;
			ngm?: number;
			/** What the programme asks for in total, sent before the start where it is all there is. */
			ps?: number;
			pd?: number;
			pp?: number;
	  }
	/**
	 * The beat the watch is reading off the wrist, sent while a run is going.
	 *
	 * It travels the other way from everything else about a run: the phone works out the run and the
	 * watch shows it, but the sensor is on the wrist and the record is on the phone. Sent as it is
	 * measured rather than asked for, because a sample nobody collected is a gap in the graph.
	 *
	 * Not squeezed into the twenty bytes the buttons are held to. A button has to work on a link
	 * that never negotiated an MTU, because a pause that only sometimes pauses is worse than none; a
	 * beat lost is a few seconds missing from a graph, and a link that small carries no run frames
	 * either, so there would be nothing on the wrist to measure against.
	 */
	| { v: number; t: 'hr'; b: number }
	/**
	 * The watch asking the phone to drive the run: start it, hold it, let it go on, or finish it.
	 * The phone owns the run, its clock and its recording, so the wrist asks and the phone decides,
	 * exactly as it asks to open an activity rather than opening one.
	 *
	 * A type each rather than one type with an action in it, because the action costs nine bytes and
	 * the budget here is not the MTU the link usually gets but the twenty bytes it falls back to: a
	 * watch whose notifications were never given a larger one drops anything longer, silently, and a
	 * pause button that works only on a well negotiated link is a pause button that cannot be
	 * trusted. `{"v":2,"t":"rh"}` is sixteen bytes and always fits.
	 */
	| { v: number; t: RunCommandType }
	/** The link is being given up deliberately, as opposed to lost. */
	| { v: number; t: 'bye' };

/** Where the run is: idle, running, paused, done. One letter, because it is sent every second. */
export type RunStatus = 'i' | 'r' | 'p' | 'd';

const RUN_STATUSES: RunStatus[] = ['i', 'r', 'p', 'd'];

export type RunCommand = 'go' | 'pause' | 'resume' | 'stop' | 'lap';

/** On the wire, shortest first: run go, run hold, run unhold, run end, run lap. */
export type RunCommandType = 'rg' | 'rh' | 'ru' | 're' | 'rl';

const COMMAND_OF: Record<RunCommandType, RunCommand> = {
	rg: 'go',
	rh: 'pause',
	ru: 'resume',
	re: 'stop',
	rl: 'lap'
};

const TYPE_OF: Record<RunCommand, RunCommandType> = {
	go: 'rg',
	pause: 'rh',
	resume: 'ru',
	stop: 're',
	lap: 'rl'
};

/**
 * What a run frame gives up first when it will not fit one write.
 *
 * The budget is about a hundred and eighty bytes and a full frame is within a few of it: a long
 * label, a repeat in the sixties and a next block with a target of its own is already at the edge.
 * Rather than keep a worst case in somebody's head, the sender drops from the end of this list
 * until the message fits, so what is lost is always the least of it. The block being run keeps
 * every one of its figures, because that is the whole of what a wrist is for mid interval.
 */
const GIVE_UP: ('ngs' | 'ngm' | 'ntp' | 'nk' | 'ps' | 'pd' | 'pp' | 'b')[] = [
	'ngs',
	'ngm',
	'ntp',
	'nk',
	'pp',
	'pd',
	'ps',
	'b'
];

/** A run frame cut down until it fits one write, which is the only size a link promises. */
export function fitRun(message: Wire): Wire {
	if (message.t !== 'run') return message;
	const fitted = { ...message };
	for (const key of GIVE_UP) {
		if (encode(fitted).length <= MAX_MESSAGE_BYTES) break;
		delete fitted[key];
	}
	return fitted;
}

export function commandType(command: RunCommand): RunCommandType {
	return TYPE_OF[command];
}

export function commandOf(type: RunCommandType): RunCommand {
	return COMMAND_OF[type];
}

export type BlockKind = 'warmup' | 'work' | 'recovery' | 'cooldown';

const BLOCK_KINDS: BlockKind[] = ['warmup', 'work', 'recovery', 'cooldown'];

/** A block label on the wire. Longer than this does not fit a round screen anyway. */
export const MAX_BLOCK_LABEL = 10;

/** Where the watch is. Scoring is driven by `round`, so this only has to name the three states. */
export type Screen = 'idle' | 'session' | 'score';

const SCREENS: Screen[] = ['idle', 'session', 'score'];

export type Decoded =
	| { ok: true; message: Wire }
	/** A peer speaking a version this build has never heard of: say so rather than guess. */
	| { ok: false; reason: 'unsupported-version'; version: number }
	| { ok: false; reason: 'malformed' };

export function encode(message: Wire): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(message));
}

/**
 * Anything at all may arrive here: a half written packet, a peer from a future release, a device
 * that is not ours. Nothing in this function may throw, because the caller is a notification
 * handler with no user waiting and nowhere to put an exception.
 */
export function decode(bytes: Uint8Array | ArrayBuffer | DataView): Decoded {
	let raw: unknown;
	try {
		const view =
			bytes instanceof Uint8Array
				? bytes
				: bytes instanceof DataView
					? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
					: new Uint8Array(bytes);
		raw = JSON.parse(new TextDecoder().decode(view));
	} catch {
		return { ok: false, reason: 'malformed' };
	}

	if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'malformed' };
	const m = raw as Record<string, unknown>;

	if (!Number.isInteger(m.v)) return { ok: false, reason: 'malformed' };
	const version = m.v as number;
	// A newer peer is a different situation from a broken one: it is told to update, not ignored.
	if (version > PROTOCOL_VERSION) return { ok: false, reason: 'unsupported-version', version };
	if (version < 1) return { ok: false, reason: 'malformed' };

	switch (m.t) {
		case 'hello':
			if (!isId(m.d) || !isTime(m.c)) break;
			return { ok: true, message: { v: version, t: 'hello', d: m.d, c: m.c } };

		case 'round': {
			if (!isId(m.a) || !Array.isArray(m.z) || !Array.isArray(m.s)) break;
			if (m.z.length === 0 || m.z.length > 32 || m.s.length === 0 || m.s.length > 8) break;
			const zones: [string, number][] = [];
			for (const zone of m.z) {
				if (!Array.isArray(zone) || zone.length !== 2) return { ok: false, reason: 'malformed' };
				if (!isLabel(zone[0]) || !Number.isInteger(zone[1])) {
					return { ok: false, reason: 'malformed' };
				}
				zones.push([zone[0], zone[1]]);
			}
			const stages: [number, number][] = [];
			for (const stage of m.s) {
				if (!Array.isArray(stage) || stage.length !== 2) return { ok: false, reason: 'malformed' };
				if (!isCount(stage[0]) || !isCount(stage[1]) || stage[1] > MAX_ARROWS) {
					return { ok: false, reason: 'malformed' };
				}
				stages.push([stage[0], stage[1]]);
			}
			return { ok: true, message: { v: version, t: 'round', a: m.a, z: zones, s: stages } };
		}

		case 'end': {
			if (!isIndex(m.s) || !isCount(m.n) || !isTime(m.at) || !Array.isArray(m.l)) break;
			if (m.l.length === 0 || m.l.length > MAX_ARROWS) break;
			const labels: (string | null)[] = [];
			for (const label of m.l) {
				if (label !== null && !isLabel(label)) return { ok: false, reason: 'malformed' };
				labels.push(label);
			}
			return { ok: true, message: { v: version, t: 'end', s: m.s, n: m.n, l: labels, at: m.at } };
		}

		case 'ack':
			if (!isIndex(m.s) || !isCount(m.n) || !isTime(m.at)) break;
			return { ok: true, message: { v: version, t: 'ack', s: m.s, n: m.n, at: m.at } };

		case 'screen':
			if (!SCREENS.includes(m.s as Screen)) break;
			return { ok: true, message: { v: version, t: 'screen', s: m.s as Screen } };

		case 'session':
			if (!isName(m.l) || !isIndex(m.c) || !isIndex(m.a)) break;
			if ((m.c as number) > MAX_ACTIVITIES) break;
			return { ok: true, message: { v: version, t: 'session', l: m.l, c: m.c, a: m.a } };

		case 'activity':
			if (!isIndex(m.i) || (m.i as number) >= MAX_ACTIVITIES) break;
			if (!isName(m.k) || !isName(m.l) || (m.s !== 0 && m.s !== 1)) break;
			return {
				ok: true,
				message: { v: version, t: 'activity', i: m.i, k: m.k, l: m.l, s: m.s }
			};

		case 'open':
			if (!isIndex(m.i) || (m.i as number) >= MAX_ACTIVITIES) break;
			return { ok: true, message: { v: version, t: 'open', i: m.i } };

		case 'arrows':
			if (!isIndex(m.n) || !isTime(m.at)) break;
			return { ok: true, message: { v: version, t: 'arrows', n: m.n, at: m.at } };

		case 'run': {
			if (!RUN_STATUSES.includes(m.st as RunStatus)) break;
			if (!isFigure(m.s) || !isFigure(m.d) || !isFigure(m.p) || !isFigure(m.a)) break;
			if (!isFigure(m.c)) break;
			const run: Wire = {
				v: version,
				t: 'run',
				st: m.st as RunStatus,
				s: m.s as number,
				d: m.d as number,
				p: m.p as number,
				a: m.a as number,
				c: m.c as number
			};
			// A run with no programme sends none of these, so absent and wrong are different answers.
			if (m.k !== undefined) {
				if (!BLOCK_KINDS.includes(m.k as BlockKind)) break;
				run.k = m.k as BlockKind;
			}
			if (m.b !== undefined) {
				if (typeof m.b !== 'string' || m.b.length > MAX_BLOCK_LABEL) break;
				run.b = m.b;
			}
			if (m.nk !== undefined) {
				if (!BLOCK_KINDS.includes(m.nk as BlockKind)) break;
				run.nk = m.nk as BlockKind;
			}
			for (const key of ['i', 'n', 'r', 'ro', 'tp', 'ls', 'lm', 'gs', 'gm', 'ntp', 'ngs', 'ngm', 'fr', 'hz', 'ps', 'pd', 'pp'] as const) {
				if (m[key] === undefined) continue;
				if (!isFigure(m[key])) return { ok: false, reason: 'malformed' };
				run[key] = m[key] as number;
			}
			return { ok: true, message: run };
		}

		case 'back':
			return { ok: true, message: { v: version, t: 'back' } };

		case 'hr':
			if (!isBeat(m.b)) break;
			return { ok: true, message: { v: version, t: 'hr', b: m.b } };

		case 'rg':
		case 'rh':
		case 'ru':
		case 're':
		case 'rl':
			return { ok: true, message: { v: version, t: m.t as RunCommandType } };

		case 'bye':
			return { ok: true, message: { v: version, t: 'bye' } };
	}

	return { ok: false, reason: 'malformed' };
}

function isId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function isLabel(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_LABEL_LENGTH;
}

/** A name the sender has already cut to something a watch can show. */
function isName(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

/** A whole number a wrist is shown: never negative, never fractional, never absurd. */
function isFigure(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000_000;
}

/** A heart rate a living body could be at. Outside this it is the sensor talking to itself. */
function isBeat(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 25 && (value as number) <= 250;
}

function isTime(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** A count of things that exist, so one or more. */
function isCount(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 1000;
}

/** A zero based position, so zero or more. */
function isIndex(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1000;
}

/** One end as either side believes it, which is the only thing the two ever disagree about. */
export interface EndState {
	stageIndex: number;
	endNo: number;
	labels: (string | null)[];
	updatedAt: number;
	deviceId: string;
}

export function endKey(stageIndex: number, endNo: number): string {
	return `${stageIndex}:${endNo}`;
}

/** No arrow left in it, which is what an end becomes when the last one is taken back. */
export function isEmpty(labels: (string | null)[]): boolean {
	return labels.every((label) => label === null);
}

/**
 * Whether what just arrived should replace what is held. The decision is `resolve` from the sync
 * module, unchanged: the archer who typed last is the one who meant it, and a tie goes to the
 * greater device id so both sides reach the same answer rather than each keeping its own.
 */
export function keepIncoming(local: EndState | null, incoming: EndState): boolean {
	if (!local) return true;
	return resolve('round_end', asMergeable(local), asMergeable(incoming)) === 'remote';
}

/** `round_end` is not append only, so `createdAt` is never read and carries no meaning here. */
function asMergeable(state: EndState): Mergeable {
	return {
		id: endKey(state.stageIndex, state.endNo),
		createdAt: 0,
		updatedAt: state.updatedAt,
		deviceId: state.deviceId,
		deletedAt: null
	};
}

/**
 * What to add to a timestamp taken from `from`'s clock to read it on `into`'s. Last write wins is
 * meaningless if the two devices disagree about now, and a watch runs its own clock: Wear keeps it
 * close to the phone, but close is not equal and a few seconds either way decides who wins an edit.
 */
export function skew(into: number, from: number): number {
	return into - from;
}
