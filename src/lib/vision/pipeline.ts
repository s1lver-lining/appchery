import { downscale } from './pixels';
import { alignFace, detectFaces, faceFromAnchors, pinFace, toFaceCoords } from './face';
import { refineFace, ringAgreement } from './refine';
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
	/**
	 * Places the first couple of seconds turned up, before anything can be believed. Shown so the archer
	 * is not looking at an empty overlay while the evidence gathers, and never scored.
	 */
	early: Impact[];
	/** Proposals this frame produced, before the tracker judged them. Diagnostic, not used for scoring. */
	detections: number;
	/** Those same proposals, so a harness can tell what was never seen from what was seen and dropped. */
	proposed: { x: number; y: number; face: number }[];
}

/**
 * A sharper look at the paper, cut from the source around the face and reduced less than the frame.
 *
 * The proposer reads pixels; the face detector reads shapes. Those want different amounts of picture,
 * and tying them to one reduction means paying the detector's price to get the proposer's resolution.
 * The face is found on the small frame as before, and the arrows are read off this: the cost of the
 * finer look is then the face's own area rather than the whole screen's, and the pixels have been
 * resampled once from the camera instead of twice.
 *
 * Nothing downstream changes, because `detectArrowsInStill` answers in face coordinates, which are
 * normalised to the face and so say the same thing whatever pixels they were read from.
 */
export interface Region {
	/** The pixels, cut around the face and reduced by `scale` from the source picture. */
	frame: Frame;
	/** Where the crop's top left corner sits in the source picture's own pixels. */
	x: number;
	y: number;
	/** How much the crop was reduced from the source picture. */
	scale: number;
}

export interface ScannerOptions {
	/** Detection runs on a smaller image: the work is per pixel and the video must not stall. */
	scale?: number;
	/** Frames between face detections. The boss does not move, so this need not run every frame. */
	faceEvery?: number;
	/** Detection passes the face must be in view for before any arrow is accepted. */
	framesToSettle?: number;
	/** Detection passes with no face before the arrows found so far are forgotten. */
	forgetAfter?: number;
	/** Which way is up in the picture, in radians, where something outside the picture can say. */
	up?: number | null;
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
	/**
	 * Run both detectors and pool what they propose. They fail on different arrows, so the union sees
	 * more than either, and the agreement across viewpoints is what keeps the extra noise out.
	 */
	combine?: boolean;
}

/**
 * The whole camera scoring loop, kept free of any DOM so it can run in a worker and be tested on
 * synthetic frames. Feed it frames; it tells you which arrows have appeared on the face.
 *
 * What this does not do: read a face it cannot see the gold of, separate two arrows touching each
 * other, or correct for a camera at a steep angle to the boss. Every result is a proposal the
 * archer confirms, never a score written on its own.
 */
/**
 * How much better the search's fit has to explain the picture before it replaces the one being
 * followed. Enough that two fits of the same boss do not trade places a few times a second, which is
 * what makes an overlay tremble; far below the gap between a fit that describes the face and one
 * that does not, which the annotated set puts at 0.91 against 0.49.
 *
 * Raised from 0.04 once the wobble could be measured. The fit's shape changes against its own
 * neighbouring frames were six times as likely on a frame that got a search as on one that was only
 * followed, which is a swap being taken that was not worth taking: the two fits describe the same
 * boss, and the search's is not better, it is merely different. At 0.10 those jumps fall by a third
 * and nothing else pays for it, which is the unusual case where a knob has a right answer rather than
 * a trade. Further, at 0.20, the jumps keep falling and the fit starts holding on to answers it should
 * have let go of: the ninetieth percentile of ring error goes from 4.7 to 7.1.
 */
const ADOPT_MARGIN = 0.10;

/** Arrows past the end's own count that may still be reported, for an end that holds more than it should. */
const EXTRA_ARROWS = 2;

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
	/** Which way is up in the picture, when anything outside the picture can say. */
	private up: number | null = null;
	/** Detection passes in a row that found no face, which is what tells a blink from a walk away. */
	private missed = 0;
	/** How many of those it takes before the arrows gathered so far are given up on. */
	private readonly forgetAfter: number;
	private readonly framesToSettle: number;
	private maxArrows: number;
	private model: ArrowModel | null;
	private readonly combine: boolean;
	private readonly crop: ScannerOptions['crop'];

	constructor(options: ScannerOptions = {}) {
		this.scale = options.scale ?? 4;
		this.faceEvery = options.faceEvery ?? 15;
		this.framesToSettle = options.framesToSettle ?? 8;
		/*
		 * Passes with no face at all before the whole sweep is given up on, which is about two and a half
		 * seconds. A duration, like the tracker's patience, and raised with the rate for the same reason:
		 * the length of time a boss may be out of view before the archer has plainly walked away from it
		 * is a fact about archers, and it did not change when the passes started coming twice as often.
		 *
		 * Left at what it was, a camera swung off the boss and back threw away everything the sweep had
		 * gathered after one and a quarter seconds. Nothing in the fourteen labelled recordings loses the
		 * face for that long, so this is reasoned rather than measured: what it is measured to do there
		 * is nothing at all.
		 */
		this.forgetAfter = options.forgetAfter ?? 16;
		this.up = options.up ?? null;
		this.maxArrows = options.maxArrows ?? 12;
		this.model = options.model ?? null;
		this.crop = options.crop ?? null;
		this.combine = options.combine ?? false;
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

	/** What the archer should see marked, which in the first seconds is more than has been believed. */
	get arrows(): Impact[] {
		return this.tracker.arrows;
	}

	/** What an accepted end would write down, as against what is being shown while it gathers. */
	get scored(): Impact[] {
		return this.tracker.scored;
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
		this.faces = this.faces.map((face) => refineFace(small, face, false, this.up));
		return this.faces;
	}

	/**
	 * Gives a fit taken on from the search the angular origin the followed one already had.
	 *
	 * Chained, not pinned. A search knows nothing of which way round the last fit was describing the
	 * face, and a face has no way round of its own, so a fresh answer has to be turned onto the old
	 * origin or every arrow already found jumps at that moment. Pinning it to gravity instead does that
	 * job too, and was tried: it measured worse, because a pass lands several times a second and each
	 * one then wrote gravity's own error into the coordinates afresh.
	 */
	private settle(previous: FaceLocation, face: FaceLocation): FaceLocation {
		return alignFace(previous, face);
	}

	/**
	 * The angular origin for a face with nothing behind it, which is the one place a pin is free.
	 *
	 * Everywhere else there is a previous frame to chain to, and chaining adds no noise. Here there is
	 * not: the face was just found, by a search that had no reason to prefer any of the ways round it
	 * could describe the boss. Left as the search happened to leave it, a sweep that loses its face and
	 * finds it again comes back in a different frame, and every arrow already gathered is somewhere
	 * else. Gravity is not steady enough to be believed frame by frame but it is easily steady enough
	 * to answer this once.
	 */
	private acquire(face: FaceLocation): FaceLocation {
		return this.up === null ? face : pinFace(face, this.up);
	}

	/**
	 * The same as `push`, for a frame the caller has already reduced to `scaleFactor`.
	 *
	 * A `region` is a sharper cut of the same moment, used for reading arrows and nothing else. Faces
	 * are still found on `small`: the search is the expensive half and a bigger picture does not help
	 * it, while the proposer is measuring the width of a shaft a few pixels across and every pixel it
	 * is given tells.
	 */
	pushReduced(small: Frame, region: Region | null = null): ScanResult {

		if (this.frames % this.faceEvery === 0 || this.faces.length === 0) {
			const candidates = detectFaces(small);
			// The rings are what separate a target face from anything else that happens to be yellow.
			const checks = candidates.map((face) => verifyRings(small, face));
			const verified = candidates.filter((_, i) => checks[i].ok);
			this.check = checks.find((c) => !c.ok) ?? checks[0] ?? null;

			if (verified.length > 0) {
				// Nearest first, so face 0 stays face 0 between detections and the tracker's indices hold.
				const fresh = this.faces.length > 0 ? matchOrder(this.faces, verified) : verified;

				/**
				 * A face already being followed keeps the geometry it has. The search and the follow are
				 * two estimates of the same thing and they never agree exactly, so adopting the search's
				 * answer every time made the overlay jump a few times a second: the tilt alone moved by
				 * thirty degrees at the worst twentieth, which on a face that is not quite round throws
				 * the whole ellipse. The followed fit is the better of the two anyway, being refined from
				 * the last frame rather than from a blob, so the search is left to do the one job the
				 * follow cannot: noticing a face that was not there before.
				 */
				const ordered = fresh.map((face, i) => {
					const followed = this.faces[i];
					if (!followed) return this.acquire(face);
					// A search knows nothing of which way round the last fit was describing the face, and a
					// face has no way round of its own, so a fresh answer is turned onto the old origin
					// before it is adopted. Otherwise every arrow already found jumps at that moment.
					const moved = Math.hypot(face.cx - followed.cx, face.cy - followed.cy);
					if (moved >= followed.semiMajor * 0.35) return this.settle(followed, face);

					/*
					 * Which of the two explains the picture in front of the camera now.
					 *
					 * The two were compared on the support they carried, and support is a number a fit is
					 * given on the frame it was made on. A fit made while half the boss was still below the
					 * top of the screen scores well on that half, keeps the number for as long as it is
					 * followed, and the search can never take it back: the archer raises the phone, the whole
					 * face comes into view, and the overlay stays sitting where the half face was. It came
					 * right only on walking in close enough for a fresh fit to beat a stale number outright.
					 *
					 * Scored on this frame, both of them, by the measure the refiner uses on its own steps.
					 * A fit that no longer describes what the camera sees loses to one that does, whatever
					 * either of them was worth when it was made.
					 */
					const holding = ringAgreement(small, followed);
					const offered = ringAgreement(small, face);
					return offered > holding + ADOPT_MARGIN ? this.settle(followed, face) : followed;
				});
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
				this.missed = 0;
			} else if (this.faces.length > 0 && this.recover(small)) {
				/**
				 * The search found nothing but the face being followed still checks out, so it is kept.
				 *
				 * The two do different jobs and fail at different things. The search starts from a gold blob
				 * and has to find it afresh in a frame that may be blurred by the archer's own stride, half
				 * shadowed, or momentarily crossed by a hand; the follow starts from last frame's answer and
				 * only has to move it a little. Throwing away a fit the rings still agree with because the
				 * blob finder had a bad frame is what put a fifth of a second hole in the middle of a sweep.
				 */
				this.settled += this.faceEvery;
				this.missed = 0;
			} else {
				this.faces = [];
				this.settled = 0;
				/**
				 * The arrows are not forgotten with the face, not at once. A boss that vanishes for a pass or
				 * two has almost always been crossed by something rather than left behind, and everything
				 * gathered over the sweep so far is a heavy price for a blink. What forgets them is the face
				 * staying gone, which is what walking to the next target looks like.
				 */
				this.missed += 1;
				if (this.missed >= this.forgetAfter) this.tracker.clear();
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
				early: this.tracker.early,
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

		const shapes = (!this.model || this.combine)
			? faces.flatMap((face, index) => {
					/*
					 * The finer cut where there is one and it holds this face, and the frame otherwise.
					 *
					 * Falling back rather than failing, because a region is an optimisation and not a
					 * promise: a face found near the edge of a sweep can sit outside a crop that was cut
					 * around where the face was a moment ago, and reading it from the small frame is a
					 * worse answer than reading it from the crop, but it is an answer.
					 */
					const local = region ? faceInRegion(face, this.scale, region) : null;
					const from = local ? region!.frame : small;
					return detectArrowsInStill(from, local ?? face, this.still).map((arrow) => ({
						x: arrow.x,
						y: arrow.y,
						area: arrow.area,
						face: index
					}));
				})
			: [];

		const learned = this.model
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
			: [];

		const detections = [...shapes, ...learned];

		// Capped as `setLimit` caps it, headroom included, so an end holding more than its count can
		// still report the extra. Set again here because the limit is what stops a misdetection flooding
		// the list, and it must hold whatever else has been asked of the tracker since.
		this.tracker.setLimit(this.maxArrows + EXTRA_ARROWS);
		const found = this.tracker.push(detections);
		return {
			face: faces[0],
			faces,
			check: this.check,
			steady,
			found,
			arrows: this.tracker.arrows,
			pending: this.tracker.pending,
			early: this.tracker.early,
			detections: detections.length,
			proposed: detections
		};
	}

	/**
	 * Tries to keep the face the search just failed to find, by fitting it again from where it was.
	 *
	 * Verified first as it stands, and if that fails, refitted properly rather than merely followed. A
	 * frame that defeats the search is usually one where the face moved further than a follow's small
	 * steps reach, such as the archer's stride, a stumble or a quick turn, and the fit is then trailing
	 * somewhere that no longer checks out. Starting a full descent from roughly the right place still
	 * finds it, where starting from a gold blob that the same frame has smeared does not.
	 */
	private recover(small: Frame): boolean {
		if (verifyRings(small, this.faces[0]).ok) return true;

		const refitted = this.faces.map((face) => refineFace(small, face));
		if (!refitted[0] || !verifyRings(small, refitted[0]).ok) return false;
		this.faces = refitted.map((face, i) => this.settle(this.faces[i], face));
		return true;
	}

	/**
	 * The end's remaining arrows, so detection stops rather than piling up proposals.
	 *
	 * Being told this is also what licenses the tracker to fill a short end with its best guesses, which
	 * is why it is passed on as a count and not only as a cap. The cap the scanner starts with is a
	 * safety limit, not a statement about the end, and must not be mistaken for one.
	 */
	/**
	 * Which way is up in the picture, in radians, from something that is not the picture.
	 *
	 * Null unless the phone has told us, which is the case on a laptop, on a recording made before the
	 * sensors were kept, and on a phone being swung about hard enough that the reading is the archer's
	 * stride rather than the earth. Null means the fit keeps the angle it already had, which drifts but
	 * never jumps.
	 */
	setUp(up: number | null) {
		this.up = up;
	}

	setLimit(limit: number) {
		this.maxArrows = Math.max(0, limit);
		/*
		 * The end expects this many arrows and the tracker may confirm a few beyond it.
		 *
		 * An end does not always hold the number the round says. One from the end before is still
		 * standing in the boss, or seven were shot, and stopping the tracker at the count meant the
		 * extra could not be reported however plainly it was there: the slots were full of the first
		 * six and nothing else was ever offered. The screen already draws whatever is past the count
		 * dimmed and says there are too many, so the archer is the one who decides what to do about it.
		 */
		this.tracker.setLimit(this.maxArrows + EXTRA_ARROWS);
		this.tracker.expect(this.maxArrows);
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
 * The same face, written in a region's pixels instead of the detection frame's.
 *
 * Only the four anchors need moving: they are what the fit is, and everything else about a
 * `FaceLocation` is derived from them. Null when the face does not sit inside the crop, which is the
 * caller's signal to read from the frame instead.
 */
function faceInRegion(face: FaceLocation, detectScale: number, region: Region): FaceLocation | null {
	const anchors = face.anchors.map(
		([x, y]) =>
			[(x * detectScale - region.x) / region.scale, (y * detectScale - region.y) / region.scale] as [
				number,
				number
			]
	);
	const moved = faceFromAnchors(anchors, face.support);
	if (!moved) return null;
	/*
	 * Room for the paper the proposer reads as well as for the face itself: it models the paper and
	 * follows shafts out past the printing, and a crop cut too tight turns that reach into an edge.
	 */
	const margin = moved.semiMajor * 1.3;
	if (
		moved.cx - margin < 0 ||
		moved.cy - margin < 0 ||
		moved.cx + margin > region.frame.width ||
		moved.cy + margin > region.frame.height
	) {
		return null;
	}
	// Carried over rather than decided again: a fit does not change its mind about the printed layout.
	moved.spot = face.spot;
	return moved;
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
