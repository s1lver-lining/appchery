import { downscale } from './pixels';
import { detectFace, toFaceCoords } from './face';
import { Background, findBlobs } from './impacts';
import { ImpactTracker } from './tracker';
import type { Frame, FaceLocation, Impact } from './types';

export interface ScanResult {
	face: FaceLocation | null;
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
	private face: FaceLocation | null = null;

	constructor(options: ScannerOptions = {}) {
		this.scale = options.scale ?? 4;
		this.faceEvery = options.faceEvery ?? 15;
		this.threshold = options.threshold ?? 28;
		this.tracker = new ImpactTracker(options.framesToConfirm ?? 4);
	}

	get located(): FaceLocation | null {
		return this.face;
	}

	push(frame: Frame): ScanResult {
		const small = downscale(frame, this.scale);

		if (this.frames % this.faceEvery === 0 || !this.face) {
			const found = detectFace(small);
			if (found) this.face = found;
		}
		this.frames += 1;

		const diff = this.background.update(small);
		if (!this.face) {
			return { face: null, found: [], arrows: this.tracker.arrows, pending: this.tracker.pending };
		}

		const face = this.face;
		const blobs = findBlobs(diff, small.width, small.height, {
			threshold: this.threshold,
			// Anything outside the face is a person, a stand, or the wind in the grass.
			accept: (cx, cy) => {
				const point = toFaceCoords(face, cx, cy);
				return Math.hypot(point.x, point.y) <= 1.05;
			}
		});

		const detections = blobs.map((blob) => {
			const point = toFaceCoords(face, blob.cx, blob.cy);
			return { x: point.x, y: point.y, area: blob.area };
		});

		const found = this.tracker.push(detections);
		return { face, found, arrows: this.tracker.arrows, pending: this.tracker.pending };
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

export { detectFace, toFaceCoords } from './face';
export { toImageCoords } from './face';
export type { Frame, FaceLocation, Impact } from './types';
