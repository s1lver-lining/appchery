// Entry point for scripts/eval-arrows-video.mjs, which replays a recording and asks what it found.
// Not imported by the app.
import { Scanner } from './pipeline';
import { toFaceCoords } from './face';
import type { Frame, FaceLocation, Impact } from './types';

export interface SweepResult {
	/** Arrows confirmed by the end of the recording, in the detector's own face coordinates. */
	arrows: Impact[];
	/** The fit on the frame the archer placed the labels against, for putting both in one frame. */
	at: FaceLocation | null;
	framesWithFace: number;
	passes: number;
	proposals: number;
	/** Every proposal of every pass, to separate what was never seen from what was seen and dropped. */
	everything: { x: number; y: number; pass: number }[];
}

/**
 * Replays one recording through the live scanner and reports what it ended up with.
 *
 * The detector and the archer describe the same face in different coordinates: a target is
 * rotationally symmetric, so which way round either frame sits is arbitrary and they will not agree.
 * The fit on the labelled frame is what reconciles them, which is why it comes back too.
 */
export class Sweep {
	private readonly scanner: Scanner;
	private last = -Infinity;
	private frames = 0;
	private withFace = 0;
	private passes = 0;
	private proposals = 0;
	private everything: { x: number; y: number; pass: number }[] = [];
	private at: FaceLocation | null = null;

	constructor(
		private readonly detectEveryMs: number,
		private readonly fps: number,
		/** The frame the labels were placed on, whose fit is needed to compare against them. */
		private readonly labelled: number,
		options: {
			sweep?: Record<string, number>;
			still?: Record<string, number>;
			arrows?: number;
		} = {}
	) {
		this.scanner = new Scanner({ sweep: options.sweep, still: options.still });
		// The end's remaining arrows, exactly as the app sets it: only six are ever going to be offered.
		if (options.arrows) this.scanner.setLimit(options.arrows);
	}

	get scaleFactor(): number {
		return this.scanner.scaleFactor;
	}

	push(small: Frame) {
		const nowMs = (this.frames / this.fps) * 1000;
		if (nowMs - this.last >= this.detectEveryMs) {
			this.last = nowMs;
			const result = this.scanner.pushReduced(small);
			this.passes += 1;
			this.proposals += result.detections;
			for (const seen of result.proposed) {
				this.everything.push({ x: seen.x, y: seen.y, pass: this.passes });
			}
		} else {
			this.scanner.track(small);
		}

		const face = this.scanner.located;
		if (face) this.withFace += 1;
		if (this.frames === this.labelled && face) {
			const factor = this.scanner.scaleFactor;
			this.at = {
				...face,
				cx: face.cx * factor,
				cy: face.cy * factor,
				semiMajor: face.semiMajor * factor,
				semiMinor: face.semiMinor * factor
			};
		}
		this.frames += 1;
	}

	result(): SweepResult {
		return {
			arrows: this.scanner.arrows,
			at: this.at,
			framesWithFace: this.withFace,
			passes: this.passes,
			proposals: this.proposals,
			everything: this.everything
		};
	}
}

export { toFaceCoords };
