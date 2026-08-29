import { refineFace } from './refine';
import type { ArrowModel } from './learned';
import type { Frame, FaceLocation, Impact } from './types';

/**
 * The camera side of live scoring: what the page keeps on the render thread once detection has been
 * moved off it.
 *
 * The split follows what each job actually costs. Following a face that is already almost right is a
 * few hundred pixel reads, so it happens on every frame and the rings sit on the boss at the
 * display's own rate. Searching for faces and arrows costs far more and is worth doing a few times a
 * second, so it goes to the worker and the page never waits for it.
 *
 * What comes back is in face coordinates, and that is what makes the split safe: an arrow is at the
 * same place on the face however far the camera has moved since the frame it was found in, so a
 * result that arrives late is still drawn in the right place rather than in a stale one.
 */
/**
 * How often a detection pass is offered, in milliseconds.
 *
 * Lives here rather than beside the camera because the replay in `video-entry.ts` drives the same
 * scanner and has to offer passes just as often. Held apart, the two drifted: the app was offering
 * one every 150ms while the replay the detector is measured with still offered one every 300, so a
 * recording replayed as a slower detector than the one it was recorded through, and the vote a
 * candidate needs had already been raised to suit the faster rate.
 */
export const DETECT_EVERY_MS = 150;

/** What one detection pass saw, which is what the optional readout shows. */
export interface DetectorReadout {
	/** Places the pass put forward, before the tracker judged any of them. */
	proposals: number;
	/** Places with some evidence behind them but not yet enough to be called an arrow. */
	early: number;
	/** Milliseconds the pass took, which is what decides how often one can be offered. */
	cost: number;
	/** Passes that have come back at all, so a detector that never answers is visibly different. */
	passes: number;
}

export class LiveScanner {
	private readonly worker: Worker;
	private faces: FaceLocation[] = [];
	private offered = false;

	/** Arrows the detector has confirmed, in face coordinates. */
	arrows: Impact[] = [];
	pending = 0;
	steady = false;
	readonly scaleFactor = 4;

	/**
	 * What the last pass saw, for the readout in the corner of the camera view.
	 *
	 * Kept because zero arrows on the screen says nothing on its own: it means the same whether the
	 * face was never found, or was found and never trusted, or was trusted and nothing was proposed,
	 * or plenty was proposed and none of it agreed for long enough. Those are four different faults
	 * with four different things to do about them, and the archer standing at the boss is the only
	 * person who can tell which one is happening.
	 */
	readout: DetectorReadout = { proposals: 0, early: 0, cost: 0, passes: 0 };

	constructor(private readonly onresult: () => void) {
		this.worker = new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
		this.worker.onmessage = (event) => {
			const result = event.data;
			if (result.type !== 'result') return;
			this.offered = false;
			this.arrows = result.arrows;
			this.pending = result.pending;
			this.steady = result.steady;
			/**
			 * Only taken when the page has nothing of its own, or when the count changed and a face has
			 * appeared or gone. Otherwise the geometry the page is following stays authoritative: a
			 * detection computed from an older frame lands somewhere slightly different, and adopting it
			 * every time is what made the rings jump every third of a second.
			 */
			if (this.faces.length !== result.faces.length) this.faces = result.faces;
			this.readout = {
				proposals: result.proposals ?? 0,
				early: result.early ?? 0,
				cost: result.cost ?? 0,
				passes: this.readout.passes + 1
			};
			this.onresult();
		};
	}

	get located(): FaceLocation[] {
		return this.faces;
	}

	setModel(model: ArrowModel | null) {
		this.worker.postMessage({ type: 'model', model });
	}

	setLimit(limit: number) {
		this.worker.postMessage({ type: 'limit', limit });
	}

	/**
	 * Tells the detector which way is up, so the face's angular origin is pinned rather than drifting.
	 *
	 * Sent only when it has actually changed by enough to matter, because this crosses to the worker
	 * and the sensor answers faster than the camera does. Half a degree is far below anything an arrow's
	 * place can show and well above the jitter of a hand held phone.
	 */
	setUp(up: number | null) {
		// Kept here as well, because the page follows the face itself between detection passes and the
		// two must agree about which way round the face is or the overlay and the arrows part company.
		this.followUp = up;
		if (up === null ? this.up === null : this.up !== null && Math.abs(up - this.up) < 0.01) return;
		this.up = up;
		this.worker.postMessage({ type: 'up', up });
	}

	/** Last direction sent to the worker, so an unchanged reading costs nothing. */
	private up: number | null = null;
	private followUp: number | null = null;

	/** Follows the faces already found. Cheap enough for every frame, which is the whole point. */
	follow(small: Frame): FaceLocation[] {
		// The cheap follow, not the search: this runs on every frame and the overlay waits on it.
		if (this.faces.length > 0)
			this.faces = this.faces.map((face) => refineFace(small, face, false, this.followUp));
		return this.faces;
	}

	/**
	 * Offers a frame to the detector. Ignored while the last one is still being worked on, because a
	 * queue of frames only means answering questions about a boss the camera stopped pointing at.
	 */
	offer(small: Frame) {
		if (this.offered) return;
		this.offered = true;
		this.worker.postMessage(
			{ type: 'frame', width: small.width, height: small.height, data: small.data.buffer },
			[small.data.buffer]
		);
	}

	/** The end has been taken, so its arrows are remembered as scored rather than offered again. */
	accept() {
		this.arrows = [];
		this.worker.postMessage({ type: 'accept' });
	}

	reject(arrow: Impact) {
		this.arrows = this.arrows.filter((a) => a !== arrow);
		this.worker.postMessage({ type: 'reject', x: arrow.x, y: arrow.y, face: arrow.face });
	}

	stop() {
		this.worker.terminate();
	}
}
