import { downscale } from './pixels';
import { detectFaces, toFaceCoords } from './face';
import { verifyRings, type RingCheck } from './rings';
import { Background, findBlobs } from './impacts';
import { ImpactTracker } from './tracker';
import type { Frame, FaceLocation, Impact } from './types';

export interface ScanResult {
	face: FaceLocation | null;
	/** Every verified face, so a three spot is scored on all of them rather than only the biggest. */
	faces: FaceLocation[];
	/** Why a candidate face was rejected, so the UI can say what to point the camera at. */
	check: RingCheck | null;
	/** True once the face has held still long enough for its coordinates to be trusted. */
	steady: boolean;
	/** Arrows confirmed on this frame, in normalised face coordinates. */
	found: Impact[];
	/** Everything confirmed so far, for drawing the overlay. */
	arrows: Impact[];
	/** Detections still gathering evidence, drawn faintly so the archer sees it working. */
	pending: Impact[];
}

export interface ScannerOptions {
	/** Detection runs on a smaller image: the work is per pixel and the video must not stall. */
	scale?: number;
	/** Frames between face detections. The boss does not move, so this need not run every frame. */
	faceEvery?: number;
	framesToConfirm?: number;
	threshold?: number;
	/** Frames the face must hold still before any arrow is accepted. */
	framesToSettle?: number;
	/** Arrows to report at most, which is the end's remaining arrows. */
	maxArrows?: number;
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
	private readonly background = new Background();
	private readonly tracker: ImpactTracker;
	private readonly scale: number;
	private readonly faceEvery: number;
	private readonly threshold: number;
	private frames = 0;
	private faces: FaceLocation[] = [];
	private check: RingCheck | null = null;
	/** Frames the face has been in roughly the same place, which gates arrow detection. */
	private settled = 0;
	private readonly framesToSettle: number;
	private maxArrows: number;

	constructor(options: ScannerOptions = {}) {
		this.scale = options.scale ?? 4;
		this.faceEvery = options.faceEvery ?? 15;
		this.threshold = options.threshold ?? 28;
		this.framesToSettle = options.framesToSettle ?? 8;
		this.maxArrows = options.maxArrows ?? 12;
		this.tracker = new ImpactTracker(options.framesToConfirm ?? 4);
	}

	get located(): FaceLocation | null {
		return this.faces[0] ?? null;
	}

	get locatedAll(): FaceLocation[] {
		return this.faces;
	}

	push(frame: Frame): ScanResult {
		const small = downscale(frame, this.scale);

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
				this.settled = moved ? 0 : this.settled + this.faceEvery;
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
		const diff = this.background.update(small, true);

		if (!steady) {
			return {
				face: this.faces[0] ?? null,
				faces: this.faces,
				check: this.check,
				steady,
				found: [],
				arrows: this.tracker.arrows,
				pending: this.tracker.pending
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

		const blobs = findBlobs(diff, small.width, small.height, {
			threshold: this.threshold,
			// Anything off every face is a person, a stand, or the wind in the grass.
			accept: (cx, cy) => owner(cx, cy) >= 0
		});

		const detections = blobs.map((blob) => {
			const index = owner(blob.cx, blob.cy);
			const point = toFaceCoords(faces[index], blob.cx, blob.cy);
			return { x: point.x, y: point.y, area: blob.area, face: index };
		});

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
			pending: this.tracker.pending
		};
	}

	/** The end's remaining arrows, so detection stops rather than piling up proposals. */
	setLimit(limit: number) {
		this.maxArrows = Math.max(0, limit);
		this.tracker.setLimit(this.maxArrows);
	}

	/** Called once an end is taken off the sheet, so the arrows now in the boss become the new normal. */
	accept(frame: Frame) {
		this.background.reset(downscale(frame, this.scale));
		this.tracker.clear();
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
