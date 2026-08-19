import { downscale } from './pixels';
import { detectFaces, toFaceCoords } from './face';
import { refineFace } from './refine';
import { verifyRings, type RingCheck } from './rings';
import { detectArrowsInStill, type StillOptions } from './still';
import { detectArrowsLearned, detectArrowsInCrop, type ArrowModel } from './learned';
import { SweepTracker, type SweepOptions } from './sweep';
import type { Frame, FaceLocation, Impact } from './types';

export interface ScanResult {
	face: FaceLocation | null;
	/** Every verified face, so a three spot is scored on all of them rather than only the biggest. */
	faces: FaceLocation[];
	/** Why a candidate face was rejected, so the UI can say what to point the camera at. */
	check: RingCheck | null;
	/** True once the face has been held in view long enough for its coordinates to be trusted. */
	steady: boolean;
	/** Arrows confirmed on this frame, in normalised face coordinates. */
	found: Impact[];
	/** Everything confirmed so far, for drawing the overlay. */
	arrows: Impact[];
	/** Detections still gathering evidence, drawn faintly so the archer sees it working. */
	pending: Impact[];
	/** Proposals this frame produced, before the tracker judged them. Diagnostic, not used for scoring. */
	detections: number;
	/** Those same proposals, so a harness can tell what was never seen from what was seen and dropped. */
	proposed: { x: number; y: number; face: number }[];
}

export interface ScannerOptions {
	/** Detection runs on a smaller image: the work is per pixel and the video must not stall. */
	scale?: number;
	/** Frames between face detections. The boss does not move, so this need not run every frame. */
	faceEvery?: number;
	/** Detection passes the face must be in view for before any arrow is accepted. */
	framesToSettle?: number;
	/** Thresholds for the shape detector, so the harness can sweep them without a code edit. */
	still?: StillOptions;
	/** How much agreement across viewpoints an arrow needs. */
	sweep?: SweepOptions;
	/** Arrows to report at most, which is the end's remaining arrows. */
	maxArrows?: number;
	/**
	 * The learned detector's weights. Given, arrows are proposed by the model instead of by the rules in
	 * `still.ts`. Everything downstream is unchanged: proposals still have to agree across viewpoints
	 * before they count, because a model is as capable of a confident mistake as a rule is.
	 */
	model?: ArrowModel | null;
	/**
	 * Supplies the learned detector with a rectified crop of a face, cut from the full resolution
	 * source. Optional, and worth providing: without it the model is fed the reduced frame that face
	 * detection runs on, which is blurrier than the crops it was trained on. A canvas does the cutting
	 * and the rotation on the GPU, so this costs the caller almost nothing.
	 */
	crop?: ((face: FaceLocation, size: number, span: number) => Frame | null) | null;
}

/**
 * The whole camera scoring loop, kept free of any DOM so it can run in a worker and be tested on
 * synthetic frames. Feed it frames; it tells you which arrows have appeared on the face.
 *
 * What this does not do: read a face it cannot see the gold of, separate two arrows touching each
 * other, or correct for a camera at a steep angle to the boss. Every result is a proposal the
 * archer confirms, never a score written on its own.
 */
export class Scanner {
	private readonly tracker: SweepTracker;
	private readonly scale: number;
	private readonly faceEvery: number;
	private readonly still: StillOptions;
	private frames = 0;
	private faces: FaceLocation[] = [];
	private check: RingCheck | null = null;
	/** Frames the face has been in view, which gates arrow detection. */
	private settled = 0;
	private readonly framesToSettle: number;
	private maxArrows: number;
	private model: ArrowModel | null;
	private readonly crop: ScannerOptions['crop'];

	constructor(options: ScannerOptions = {}) {
		this.scale = options.scale ?? 4;
		this.faceEvery = options.faceEvery ?? 15;
		this.framesToSettle = options.framesToSettle ?? 8;
		this.maxArrows = options.maxArrows ?? 12;
		this.model = options.model ?? null;
		this.crop = options.crop ?? null;
		this.still = options.still ?? {};
		this.tracker = new SweepTracker(options.sweep);
	}

	get located(): FaceLocation | null {
		return this.faces[0] ?? null;
	}

	get locatedAll(): FaceLocation[] {
		return this.faces;
	}

	/** Frames the face has held still, exposed so a replay can show why detection is or is not running. */
	get settleCount(): number {
		return this.settled;
	}

	get arrows(): Impact[] {
		return this.tracker.arrows;
	}

	get pending(): Impact[] {
		return this.tracker.pending;
	}

	/**
	 * Feeds a frame at its native size, reducing it here. Convenient, and what the tests use; a caller
	 * with a canvas to hand should reduce it there instead and use the reduced form below, because
	 * scaling an image is the one part of this the GPU does far better than a loop over pixels.
	 */
	push(frame: Frame): ScanResult {
		return this.pushReduced(downscale(frame, this.scale));
	}

	/**
	 * Follows the faces already found, without looking for new ones or for arrows.
	 *
	 * Detection is far too slow to run on every frame, but the overlay has to keep up with the camera
	 * or it visibly lags behind what the archer is pointing at. Fitting a face that is already almost
	 * right is cheap, a few hundred pixel reads, so the geometry can move every frame while the search
	 * for new faces and new arrows runs a few times a second.
	 */
	track(small: Frame): FaceLocation[] {
		if (this.faces.length === 0) return this.faces;

		// A carried camera is the normal case here, so movement is not a reason to distrust the face.
		// Followed rather than searched for again: this runs on every frame and the overlay waits on it.
		this.faces = this.faces.map((face) => refineFace(small, face, false));
		return this.faces;
	}

	/** The same as `push`, for a frame the caller has already reduced to `scaleFactor`. */
	pushReduced(small: Frame): ScanResult {

		if (this.frames % this.faceEvery === 0 || this.faces.length === 0) {
			const candidates = detectFaces(small);
			// The rings are what separate a target face from anything else that happens to be yellow.
			const checks = candidates.map((face) => verifyRings(small, face));
			const verified = candidates.filter((_, i) => checks[i].ok);
			this.check = checks.find((c) => !c.ok) ?? checks[0] ?? null;

			if (verified.length > 0) {
				// Nearest first, so face 0 stays face 0 between detections and the tracker's indices hold.
				const ordered = this.faces.length > 0 ? matchOrder(this.faces, verified) : verified;
				const moved = this.faces.length !== ordered.length || ordered.some((face, i) => {
					const previous = this.faces[i];
					return (
						Math.hypot(face.cx - previous.cx, face.cy - previous.cy) > previous.semiMajor * 0.05 ||
						Math.abs(face.semiMajor - previous.semiMajor) > previous.semiMajor * 0.08
					);
				});
				/**
				 * Counted from the face being in view, not from it holding still. The archer walks up to
				 * the boss and sweeps the camera over it, so a fit that moves is the normal case and
				 * demanding stillness meant arrows were looked for on about two frames in a hundred.
				 */
				this.settled += this.faceEvery;
				this.faces = ordered;
			} else {
				this.faces = [];
				this.settled = 0;
				this.tracker.clear();
			}
		} else if (this.faces.length > 0) {
			this.settled += 1;
		}
		this.frames += 1;

		const steady = this.faces.length > 0 && this.settled >= this.framesToSettle;

		if (!steady) {
			return {
				face: this.faces[0] ?? null,
				faces: this.faces,
				check: this.check,
				steady,
				found: [],
				arrows: this.tracker.arrows,
				pending: this.tracker.pending,
				detections: 0,
				proposed: []
			};
		}

		const faces = this.faces;
		/** Which face a point belongs to, or -1 when it is on none of them. */
		const owner = (cx: number, cy: number) => {
			for (let i = 0; i < faces.length; i++) {
				const point = toFaceCoords(faces[i], cx, cy);
				if (Math.hypot(point.x, point.y) <= 1.02) return i;
			}
			return -1;
		};

		const detections = this.model
			? faces.flatMap((face, index) => {
					const model = this.model as ArrowModel;
					const crop = this.crop?.(face, model.size, model.span) ?? null;
					const arrows = crop
						? detectArrowsInCrop(crop, face, model)
						: detectArrowsLearned(small, face, model);
					return arrows.map((arrow) => ({
						x: arrow.x,
						y: arrow.y,
						// No blob to measure, so confidence stands in where the UI wants a size.
						area: Math.round(arrow.confidence * 100),
						face: index
					}));
				})
			: faces.flatMap((face, index) =>
					detectArrowsInStill(small, face, this.still).map((arrow) => ({
						x: arrow.x,
						y: arrow.y,
						area: arrow.area,
						face: index
					}))
				);

		// Capped at what the end can still take, so a misdetection cannot flood the list.
		this.tracker.setLimit(this.maxArrows);
		const found = this.tracker.push(detections);
		return {
			face: faces[0],
			faces,
			check: this.check,
			steady,
			found,
			arrows: this.tracker.arrows,
			pending: this.tracker.pending,
			detections: detections.length,
			proposed: detections
		};
	}

	/** The end's remaining arrows, so detection stops rather than piling up proposals. */
	setLimit(limit: number) {
		this.maxArrows = Math.max(0, limit);
		this.tracker.setLimit(this.maxArrows);
	}

	/**
	 * Called once an end is taken off the sheet. The arrows stay standing in the boss, so they are
	 * remembered as already scored rather than forgotten: nothing here can tell an arrow of this end
	 * from one of the last by looking, and offering them again every end would be the whole sheet.
	 */
	accept() {
		this.tracker.accept();
	}

	reject(impact: Impact) {
		this.tracker.forget(impact);
	}

	get scaleFactor(): number {
		return this.scale;
	}
}

/**
 * Reorders newly detected faces to match the previous frame's, so a face keeps its index and the
 * arrows already tracked on it are not attributed to a different one.
 */
function matchOrder(previous: FaceLocation[], fresh: FaceLocation[]): FaceLocation[] {
	const taken = new Set<number>();
	const ordered: FaceLocation[] = [];

	for (const before of previous) {
		let best = -1;
		let bestDistance = before.semiMajor;
		fresh.forEach((face, i) => {
			if (taken.has(i)) return;
			const distance = Math.hypot(face.cx - before.cx, face.cy - before.cy);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = i;
			}
		});
		if (best >= 0) {
			taken.add(best);
			ordered.push(fresh[best]);
		}
	}

	fresh.forEach((face, i) => {
		if (!taken.has(i)) ordered.push(face);
	});
	return ordered;
}

export { detectFace, detectFaces, toFaceCoords } from './face';
export { toImageCoords } from './face';
export type { Frame, FaceLocation, Impact } from './types';
