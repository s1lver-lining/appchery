import type { Zone } from '$lib/domain/rounds/types';
import { planEnd, zoneIndex, type PlannedShot } from './apply';
import {
	decode,
	encode,
	isEmpty,
	skew,
	PROTOCOL_VERSION,
	type EndState,
	type Wire
} from './protocol';

/**
 * One conversation with a watch, with no idea how the bytes travel. The transport underneath is Web
 * Bluetooth in a browser and a native central in the app, and neither belongs in the rules about
 * whose arrows survive, so both are reduced to `send` and a stream of arriving messages.
 */

/** Writing to the peer. Rejects when the link has gone, which is ordinary rather than exceptional. */
export interface Channel {
	send(bytes: Uint8Array): Promise<void>;
}

/** The record, as this session needs it. Injected so the session can be tested without a database. */
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

export type LinkEvent =
	| { kind: 'greeted'; peerDeviceId: string; offsetMs: number }
	/** An end arrived and changed the record, so whatever is on screen should look again. */
	| { kind: 'applied'; stageIndex: number; endNo: number }
	| { kind: 'refused'; stageIndex: number; endNo: number; reason: string }
	/** The peer speaks a protocol this build does not: the archer has to update one of the two. */
	| { kind: 'version-mismatch'; theirs: number; ours: number }
	| { kind: 'noise' }
	| { kind: 'farewell' };

export class WatchSession {
	private readonly zones: Map<string, Zone>;
	private peerDeviceId: string | null = null;
	/** Added to a watch timestamp to read it on this device's clock. */
	private peerOffset = 0;
	private greeted = false;

	constructor(
		private readonly round: Round,
		private readonly record: Record,
		private readonly channel: Channel,
		private readonly deviceId: string,
		private readonly notify: (event: LinkEvent) => void = () => {},
		private readonly now: () => number = Date.now
	) {
		this.zones = zoneIndex(round.zones);
	}

	get peer(): string | null {
		return this.peerDeviceId;
	}

	/** Said first, so the watch learns who it is talking to and how far apart the clocks are. */
	async open(): Promise<void> {
		await this.say({ v: PROTOCOL_VERSION, t: 'hello', d: this.deviceId, c: this.now() });
	}

	async close(): Promise<void> {
		// Best effort: a link already gone cannot be told it is being given up.
		await this.say({ v: PROTOCOL_VERSION, t: 'bye' }).catch(() => {});
	}

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
				case 'bye':
					this.notify({ kind: 'farewell' });
					return;
				// The phone never asks the watch for anything it has to answer, so an ack arriving here
				// is a watch being polite about a push rather than anything to act on.
				case 'ack':
				case 'round':
					return;
			}
		} catch {
			// A failed write leaves the record as it was, and the watch will assert the end again.
			this.notify({ kind: 'refused', stageIndex: -1, endNo: -1, reason: 'write-failed' });
		}
	}

	private async onHello(peerDeviceId: string, peerClock: number): Promise<void> {
		this.peerDeviceId = peerDeviceId;
		this.peerOffset = skew(this.now(), peerClock);
		this.greeted = true;
		this.notify({ kind: 'greeted', peerDeviceId, offsetMs: this.peerOffset });

		await this.say({
			v: PROTOCOL_VERSION,
			t: 'round',
			a: this.round.activityId,
			z: this.round.zones.map((zone) => [zone.label, zone.value] as [string, number]),
			s: this.round.stages.map((stage) => [stage.ends, stage.arrowsPerEnd] as [number, number])
		});
		await this.pushAll();
	}

	private async onEnd(
		stageIndex: number,
		endNo: number,
		labels: (string | null)[],
		at: number
	): Promise<void> {
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
		const arrowsPerEnd = this.round.stages[stageIndex]?.arrowsPerEnd;
		if (arrowsPerEnd === undefined) return;

		const local = await this.record.readEnd(stageIndex, endNo);
		const labels = local ? local.labels : new Array(arrowsPerEnd).fill(null);
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
		for (let stageIndex = 0; stageIndex < this.round.stages.length; stageIndex++) {
			const stage = this.round.stages[stageIndex];
			for (let endNo = 1; endNo <= stage.ends; endNo++) {
				const local = await this.record.readEnd(stageIndex, endNo);
				// An end never shot is not worth a message: the watch already shows it as empty.
				if (!local || isEmpty(local.labels)) continue;
				await this.pushEnd(stageIndex, endNo);
			}
		}
	}

	private async say(message: Wire): Promise<void> {
		await this.channel.send(encode(message));
	}
}
