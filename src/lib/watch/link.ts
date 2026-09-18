import type { Zone } from '$lib/domain/rounds/types';
import { planEnd, zoneIndex, type PlannedShot } from './apply';
import {
	decode,
	encode,
	endKey,
	isEmpty,
	skew,
	PROTOCOL_VERSION,
	type EndState,
	type Screen,
	type Wire
} from './protocol';

/**
 * One conversation with a watch, with no idea how the bytes travel. The transport underneath is Web
 * Bluetooth in a browser and a native central in the app, and neither belongs in the rules about
 * whose arrows survive, so both are reduced to `send` and a stream of arriving messages.
 *
 * The link is not believed until the watch has answered. A GATT connection being up is no evidence
 * that anybody is listening on it: re-registering the service gives it new handles, so a phone still
 * holding the old ones subscribes to nothing and is told nothing about it. Updating the watch app
 * does exactly that to a phone already connected. See doc/llm-memory/watch-link.md.
 */

/** Writing to the peer. Rejects when the link has gone, which is ordinary rather than exceptional. */
export interface Channel {
	send(bytes: Uint8Array): Promise<void>;
}

/** The record, as this link needs it. Injected so the rules can be tested without a database. */
export interface Record {
	readEnd(stageIndex: number, endNo: number): Promise<EndState | null>;
	writeEnd(stageIndex: number, endNo: number, shots: PlannedShot[]): Promise<void>;
	removeEnd(stageIndex: number, endNo: number): Promise<void>;
}

export interface Round {
	activityId: string;
	zones: Zone[];
	/** Ends and arrows per end, per stage, in order. */
	stages: { ends: number; arrowsPerEnd: number }[];
}

/** One activity as the wrist shows it. The watch refers to it by position, never by id. */
export interface ActivityLine {
	kind: string;
	label: string;
	scorable: boolean;
}

export type LinkEvent =
	| { kind: 'greeted'; peerDeviceId: string; offsetMs: number }
	/** The watch never answered, so the link is up and useless, and has to be made again. */
	| { kind: 'stale' }
	/** An end arrived and changed the record, so whatever is on screen should look again. */
	| { kind: 'applied'; stageIndex: number; endNo: number }
	| { kind: 'refused'; stageIndex: number; endNo: number; reason: string }
	/** The watch asking for an activity by position. Only the phone can actually open one. */
	| { kind: 'open'; index: number }
	/** The watch asking to come back out. Only the phone knows what is behind where it is. */
	| { kind: 'back' }
	/** The session's training arrows as a total, read on this device's clock. */
	| { kind: 'arrows'; total: number; at: number }
	/** The peer speaks a protocol this build does not: the archer has to update one of the two. */
	| { kind: 'version-mismatch'; theirs: number; ours: number }
	| { kind: 'noise' }
	| { kind: 'farewell' };

/** How long the watch has to answer a hello before the link is called dead. */
export const LIVENESS_MS = 2500;

export class WatchLink {
	private round: Round | null = null;
	private zones: Map<string, Zone> = new Map();
	private record: Record | null = null;

	/**
	 * Ends the watch has been told hold arrows. An end undone on the phone has to be sent as empty
	 * or the wrist goes on showing what was there: `pushAll` would otherwise skip it for being
	 * empty, which is right for a watch that has never heard of it and wrong for one that has.
	 */
	private sentEnds = new Set<string>();

	private peerDeviceId: string | null = null;
	/** Added to a watch timestamp to read it on this device's clock. */
	private peerOffset = 0;
	private answered = false;
	/** A hello is out and has not been answered yet, which is what the liveness timer is watching. */
	private awaiting = false;
	private screen: Screen = 'idle';
	/**
	 * The session as last described. Held because a watch that restarts has forgotten it and cannot
	 * say so: its counter would sit at nothing while the phone believed it had been told.
	 */
	private session: { label: string; activities: ActivityLine[]; arrows: number } | null = null;

	constructor(
		private readonly channel: Channel,
		private readonly deviceId: string,
		private readonly notify: (event: LinkEvent) => void = () => {},
		private readonly now: () => number = Date.now,
		private readonly timer: (run: () => void, ms: number) => void = setTimeout
	) {}

	get peer(): string | null {
		return this.peerDeviceId;
	}

	/** Whether the watch has actually answered, as opposed to the transport claiming a connection. */
	get live(): boolean {
		return this.answered;
	}

	/**
	 * Says hello and waits to be answered. A link nobody is listening on accepts every write and
	 * delivers none of them, so silence for `LIVENESS_MS` is reported rather than trusted.
	 */
	async open(): Promise<void> {
		this.answered = false;
		await this.ping();
	}

	/**
	 * Asks again whether anybody is there. Worth repeating rather than asking once: restarting the
	 * watch app re-registers the service, and the phone goes on holding handles that lead nowhere
	 * while every write it makes appears to succeed.
	 */
	async ping(): Promise<void> {
		this.awaiting = true;
		await this.say({ v: PROTOCOL_VERSION, t: 'hello', d: this.deviceId, c: this.now() });
		this.timer(() => {
			if (!this.awaiting) return;
			this.awaiting = false;
			this.answered = false;
			this.notify({ kind: 'stale' });
		}, LIVENESS_MS);
	}

	async close(): Promise<void> {
		// Best effort: a link already gone cannot be told it is being given up.
		await this.say({ v: PROTOCOL_VERSION, t: 'bye' }).catch(() => {});
	}

	// -------- what the watch is shown

	/** The scoring context. Sending the round is what tells the watch to draw the right keypad. */
	async setRound(round: Round, record: Record): Promise<void> {
		// Whatever the watch was told about belonged to whatever it was showing before.
		if (this.round?.activityId !== round.activityId) this.sentEnds.clear();
		this.round = round;
		this.record = record;
		this.zones = zoneIndex(round.zones);
		await this.showScreen('score');
		await this.sendRound();
		await this.pushAll();
	}

	/** Out of the activity: the watch is left with no round to write an arrow onto. */
	clearRound(): void {
		this.round = null;
		this.record = null;
		this.zones = new Map();
		// A watch told about another round has not been told about this one's ends.
		this.sentEnds.clear();
	}

	async showSession(label: string, activities: ActivityLine[], arrows: number): Promise<void> {
		this.session = { label, activities, arrows };
		await this.showScreen('session');
		await this.sendSession(label, activities, arrows);
	}

	private async sendSession(
		label: string,
		activities: ActivityLine[],
		arrows: number
	): Promise<void> {
		await this.say({
			v: PROTOCOL_VERSION,
			t: 'session',
			l: cut(label),
			c: activities.length,
			a: Math.max(0, Math.round(arrows))
		});
		// One activity per message: four uuids in one comes to about 307 bytes against a budget of 180.
		for (let index = 0; index < activities.length; index++) {
			const line = activities[index];
			await this.say({
				v: PROTOCOL_VERSION,
				t: 'activity',
				i: index,
				k: cut(line.kind),
				l: cut(line.label),
				s: line.scorable ? 1 : 0
			});
		}
	}

	async showIdle(): Promise<void> {
		this.session = null;
		await this.showScreen('idle');
	}

	/** The session's training arrows, on the watch's clock so the two compare the same now. */
	async pushArrows(total: number, updatedAt: number): Promise<void> {
		await this.say({
			v: PROTOCOL_VERSION,
			t: 'arrows',
			n: Math.max(0, Math.round(total)),
			at: updatedAt - this.peerOffset
		});
	}

	private async showScreen(next: Screen): Promise<void> {
		this.screen = next;
		await this.say({ v: PROTOCOL_VERSION, t: 'screen', s: next });
	}

	private async sendRound(): Promise<void> {
		if (!this.round) return;
		await this.say({
			v: PROTOCOL_VERSION,
			t: 'round',
			a: this.round.activityId,
			// In the order given, which is the order the keys are drawn in: see `mirror.ts`, where the
			// app's own definition of keypad order is used rather than a second one invented here.
			z: this.round.zones.map((zone) => [zone.label, zone.value] as [string, number]),
			s: this.round.stages.map((stage) => [stage.ends, stage.arrowsPerEnd] as [number, number])
		});
	}

	// -------- what the watch says

	/**
	 * Everything the peer sends, including whatever a half written packet decodes to. This never
	 * throws: it is called from a notification handler with nobody waiting on a promise.
	 */
	async receive(bytes: Uint8Array | ArrayBuffer | DataView): Promise<void> {
		const decoded = decode(bytes);
		if (!decoded.ok) {
			if (decoded.reason === 'unsupported-version') {
				this.notify({ kind: 'version-mismatch', theirs: decoded.version, ours: PROTOCOL_VERSION });
			} else {
				this.notify({ kind: 'noise' });
			}
			return;
		}

		const message = decoded.message;
		try {
			switch (message.t) {
				case 'hello':
					await this.onHello(message.d, message.c);
					return;
				case 'end':
					await this.onEnd(message.s, message.n, message.l, message.at);
					return;
				case 'open':
					this.notify({ kind: 'open', index: message.i });
					return;
				case 'back':
					this.notify({ kind: 'back' });
					return;
				case 'arrows':
					// Read on this device's clock, or last write wins compares two different nows.
					this.notify({ kind: 'arrows', total: message.n, at: message.at + this.peerOffset });
					return;
				case 'bye':
					this.answered = false;
					this.notify({ kind: 'farewell' });
					return;
				// Nothing the phone has to act on: it is the one that sends these.
				case 'ack':
				case 'round':
				case 'screen':
				case 'session':
				case 'activity':
					return;
			}
		} catch {
			// A failed write leaves the record as it was, and the watch will assert the end again.
			this.notify({ kind: 'refused', stageIndex: -1, endNo: -1, reason: 'write-failed' });
		}
	}

	private async onHello(peerDeviceId: string, peerClock: number): Promise<void> {
		/**
		 * Only a watch that was not answering a moment ago needs telling everything again. A link
		 * already known to be alive is merely being checked on, and re-sending the session and every
		 * end each time would put a round's worth of messages on the air every few seconds.
		 */
		const recovered = !this.answered;
		this.peerDeviceId = peerDeviceId;
		this.peerOffset = skew(this.now(), peerClock);
		this.awaiting = false;
		this.answered = true;
		this.notify({ kind: 'greeted', peerDeviceId, offsetMs: this.peerOffset });
		if (!recovered) return;

		// A watch that has just restarted knows none of this, and cannot say so: told again anyway.
		await this.showScreen(this.screen);
		if (this.session) {
			const { label, activities, arrows } = this.session;
			await this.sendSession(label, activities, arrows);
		}
		if (this.round) {
			await this.sendRound();
			await this.pushAll();
		}
	}

	private async onEnd(
		stageIndex: number,
		endNo: number,
		labels: (string | null)[],
		at: number
	): Promise<void> {
		if (!this.round || !this.record) {
			// An arrow with no round open has nowhere to go, and inventing somewhere would be worse.
			this.notify({ kind: 'refused', stageIndex, endNo, reason: 'no-round' });
			return;
		}

		const arrowsPerEnd = this.round.stages[stageIndex]?.arrowsPerEnd;
		// A stage the round does not have is a watch out of step, so it is told the round again.
		if (arrowsPerEnd === undefined) {
			this.notify({ kind: 'refused', stageIndex, endNo, reason: 'no-such-stage' });
			return;
		}

		const incoming: EndState = {
			stageIndex,
			endNo,
			labels,
			// Read on this device's clock, or last write wins compares two different nows.
			updatedAt: at + this.peerOffset,
			deviceId: this.peerDeviceId ?? 'watch'
		};

		const local = await this.record.readEnd(stageIndex, endNo);
		const plan = planEnd(local, incoming, this.zones, arrowsPerEnd);

		if (plan.kind === 'reject') {
			this.notify({ kind: 'refused', stageIndex, endNo, reason: plan.reason });
			/**
			 * A watch told no has to be told what is true instead, or the two sit disagreeing: a stale
			 * assertion means the phone holds the better copy, so that copy goes back.
			 */
			if (plan.reason === 'older') await this.pushEnd(stageIndex, endNo);
			return;
		}

		if (plan.kind === 'delete') await this.record.removeEnd(stageIndex, endNo);
		else await this.record.writeEnd(stageIndex, endNo, plan.shots);

		this.notify({ kind: 'applied', stageIndex, endNo });
		// Acked on the watch's own clock, because that is the timestamp it is holding in its queue.
		await this.say({ v: PROTOCOL_VERSION, t: 'ack', s: stageIndex, n: endNo, at });
	}

	/**
	 * The phone's copy of one end, sent to the watch. This is what makes an edit made on the phone
	 * show up on the wrist, and what settles a disagreement the watch lost.
	 */
	async pushEnd(stageIndex: number, endNo: number): Promise<void> {
		if (!this.round || !this.record) return;
		const arrowsPerEnd = this.round.stages[stageIndex]?.arrowsPerEnd;
		if (arrowsPerEnd === undefined) return;

		const local = await this.record.readEnd(stageIndex, endNo);
		const labels = local ? local.labels : new Array(arrowsPerEnd).fill(null);
		const key = endKey(stageIndex, endNo);
		if (isEmpty(labels)) this.sentEnds.delete(key);
		else this.sentEnds.add(key);
		await this.say({
			v: PROTOCOL_VERSION,
			t: 'end',
			s: stageIndex,
			n: endNo,
			l: labels,
			// On the watch's clock, so the two compare the same now when it decides whether to adopt.
			at: (local?.updatedAt ?? this.now()) - this.peerOffset
		});
	}

	/** Every end the record holds, so a watch joining mid round shows the real card. */
	async pushAll(): Promise<void> {
		if (!this.round || !this.record) return;
		for (let stageIndex = 0; stageIndex < this.round.stages.length; stageIndex++) {
			const stage = this.round.stages[stageIndex];
			for (let endNo = 1; endNo <= stage.ends; endNo++) {
				const local = await this.record.readEnd(stageIndex, endNo);
				const empty = !local || isEmpty(local.labels);
				// An end never shot is not worth a message: the watch already shows it as empty. One
				// the watch was told about and that is empty now is the opposite — it is an undo, and
				// saying nothing leaves the arrows on the wrist that the phone has just taken away.
				if (empty && !this.sentEnds.has(endKey(stageIndex, endNo))) continue;
				await this.pushEnd(stageIndex, endNo);
			}
		}
	}

	private async say(message: Wire): Promise<void> {
		await this.channel.send(encode(message));
	}
}

/** Names travel cut, because the watch cannot show more and the budget cannot afford more. */
function cut(text: string): string {
	return text.length > 40 ? text.slice(0, 40) : text;
}
