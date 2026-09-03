import { refineFace } from './refine';
import { toFaceCoords, toImageCoords } from './face';
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

/** A sharper cut of the face's neighbourhood, as the page hands it over. */
export interface LiveRegion {
	frame: Frame;
	x: number;
	y: number;
	scale: number;
}

/**
 * An arrow as this page holds it: in the page's own face coordinates, with the coordinates it was
 * found in kept beside it.
 *
 * Both are needed. The page draws in its own frame, but the tracker that has to be told about a
 * rejected arrow lives in the worker and knows only its own, and matching there is by proximity, so
 * an arrow handed back in the wrong frame retires whichever one happened to be nearest instead.
 */
export interface LiveImpact extends Impact {
	/** Where the worker put it, in the worker's face frame. Absent when no remapping was possible. */
	source?: { x: number; y: number };
}

export class LiveScanner {
	private readonly worker: Worker;
	private faces: FaceLocation[] = [];
	private offered = false;
	/** This page's fit as of the frame the worker is working on, so its answer can be read back. */
	private offeredFaces: FaceLocation[] | null = null;

	/**
	 * Arrows the detector has confirmed, in the coordinates of the face this page is following.
	 *
	 * Not the coordinates they came back in. The worker fits the face for itself, from the frames it
	 * was offered, and this page fits it again on every frame; both are chains, and `refineFace` says
	 * what a chain does over a sweep, which is walk its angular origin by tens of degrees. Two chains
	 * fed different frames walk apart, and an arrow drawn in one and read in the other creeps round the
	 * gold until it is on nothing at all. So each result is turned into this page's frame as it lands,
	 * through the picture, which is the one thing the two fits agree about.
	 */
	arrows: LiveImpact[] = [];
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
			this.pending = result.pending;
			this.steady = result.steady;
			/**
			 * Taken when a face has appeared or gone, and when this page's own fit has plainly lost the
			 * boss. Otherwise the geometry the page is following stays authoritative: a detection computed
			 * from an older frame lands somewhere slightly different, and adopting it every time is what
			 * made the rings jump every third of a second.
			 */
			if (this.faces.length !== result.faces.length || this.lost(result.faces)) {
				this.faces = result.faces;
				/*
				 * Taking the worker's fit makes it this page's fit, so there is nothing left to convert
				 * and the fit this frame was offered under is no longer what anything is drawn in.
				 * Cleared here rather than after, or the arrows would be rebased into the frame that was
				 * just given up and drawn against rings that have moved.
				 */
				this.offeredFaces = null;
			}
			// After the adoption above, so a result that brought a new face is read in that face's frame.
			this.arrows = this.rebase(result.arrows, result.faces);
			this.offeredFaces = null;
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

	/**
	 * Turns arrows from the worker's fit into the page's, through the picture the two share.
	 *
	 * A face coordinate only means anything alongside the fit it was written in. Sending it out through
	 * the worker's fit gives a pixel of the frame, and reading that pixel back through the page's fit
	 * gives the same physical place written the page's way. It is exact for the frame the result was
	 * computed on; what it does not cover is the camera's movement since that frame, which is one
	 * detection interval rather than the whole sweep, and which the follow then carries correctly.
	 *
	 * Done afresh on every result rather than accumulated, so nothing here can drift: the tracker sends
	 * its whole list each time and each list is converted once, from the fit it was actually made in.
	 */
	/**
	 * Whether this page's fit has wandered far enough from the worker's to be called lost.
	 *
	 * The page only ever follows. It never searches for the face again, never checks the rings against
	 * it and never refits from a blob, so its fit is one long chain with nothing to correct it, and a
	 * stride or a hand across the lens can walk it off the boss for the rest of the end. The worker does
	 * all three of those things several times a second, so where the two disagree by more than a fit
	 * ever should, the worker is the one to believe.
	 *
	 * Far enough that ordinary disagreement never reaches it. The two are a chain and a search of the
	 * same boss and they part company by a couple of percent of a radius in the ordinary way; a fifth of
	 * a radius is not drift, it is one of them being somewhere else.
	 */
	private lost(theirs: FaceLocation[]): boolean {
		return this.faces.some((ours, i) => {
			const other = theirs[i];
			if (!other) return false;
			const radius = Math.max(1, (ours.semiMajor + ours.semiMinor) / 2);
			return Math.hypot(ours.cx - other.cx, ours.cy - other.cy) / radius > 0.2;
		});
	}

	private rebase(arrows: Impact[], from: FaceLocation[]): LiveImpact[] {
		/*
		 * Read through the fit this page held when the frame was handed over, not the one it holds now.
		 *
		 * The conversion goes out of the worker's fit into the picture and back into this one, and a
		 * pixel only means the same thing in both if both describe the same frame. The worker's describes
		 * the frame it was given; ours has moved on by however long the pass took, and the boss has moved
		 * in the picture with it. Kept at the moment of offering, the two agree about the frame again and
		 * the conversion is what it claims to be: a change of coordinates, not a guess about motion.
		 */
		const mine = this.offeredFaces ?? this.faces;
		return arrows.map((arrow) => {
			const theirs = from[arrow.face];
			const ours = mine[arrow.face];
			// Nothing to convert between, so it is left as it came: wrong is possible, invented is not.
			if (!theirs || !ours || theirs === ours) return arrow;
			const pixel = toImageCoords(theirs, arrow.x, arrow.y);
			const here = toFaceCoords(ours, pixel.x, pixel.y);
			return { ...arrow, x: here.x, y: here.y, source: { x: arrow.x, y: arrow.y } };
		});
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
	 *
	 * The region, where the page cut one, is the sharper look the arrows are read from. Both buffers
	 * are handed over rather than copied, so neither may be touched after this returns.
	 */
	offer(small: Frame, region: LiveRegion | null = null) {
		if (this.offered) return;
		this.offered = true;
		// The fit this frame was seen through, kept for the answer that will come back about it.
		this.offeredFaces = this.faces;
		const message: Record<string, unknown> = {
			type: 'frame',
			width: small.width,
			height: small.height,
			data: small.data.buffer as ArrayBuffer
		};
		const moved: ArrayBuffer[] = [small.data.buffer as ArrayBuffer];
		if (region) {
			message.region = {
				width: region.frame.width,
				height: region.frame.height,
				data: region.frame.data.buffer as ArrayBuffer,
				x: region.x,
				y: region.y,
				scale: region.scale
			};
			moved.push(region.frame.data.buffer as ArrayBuffer);
		}
		this.worker.postMessage(message, moved);
	}

	/** The end has been taken, so its arrows are remembered as scored rather than offered again. */
	accept() {
		this.arrows = [];
		this.worker.postMessage({ type: 'accept' });
	}

	reject(arrow: LiveImpact) {
		this.arrows = this.arrows.filter((a) => a !== arrow);
		// In the frame the tracker holds it in, not the one it was drawn in. See `rebase`.
		const where = arrow.source ?? arrow;
		this.worker.postMessage({ type: 'reject', x: where.x, y: where.y, face: arrow.face });
	}

	stop() {
		this.worker.terminate();
	}
}
