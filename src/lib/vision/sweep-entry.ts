// Entry point for scripts/eval-arrows-video.mjs, which replays a recording and asks what it found.
// Not imported by the app.
import { Scanner } from './pipeline';
import { toFaceCoords, scaleFace } from './face';
import { upFromGravity } from './motion';
import type { Frame, FaceLocation, Impact } from './types';
export { DETECT_EVERY_MS } from './live';

export interface SweepResult {
	/** Arrows shown by the end of the recording, in the detector's own face coordinates. */
	arrows: Impact[];
	/** Of those, the ones that earned their place, which is what an accepted end writes down. */
	scored: Impact[];
	/** The fit on the frame the archer placed the labels against, for putting both in one frame. */
	at: FaceLocation | null;
	framesWithFace: number;
	passes: number;
	proposals: number;
	/** Every proposal of every pass, to separate what was never seen from what was seen and dropped. */
	everything: { x: number; y: number; pass: number }[];
	/**
	 * The pass at which the face first counted as found, so latency can be measured from that moment.
	 *
	 * Which is the moment the archer cares about. Time from the start of the recording mixes up how
	 * long the detector took with how long the archer spent walking towards the boss with the phone
	 * pointed at the grass, and those are not the same question at all.
	 */
	steadyFrom: number | null;
	/** What each detection pass cost, in milliseconds, which is what decides how often one can run. */
	costs: number[];
	/**
	 * Where the face was on every single frame, which is a different question from where it ends up.
	 *
	 * The still detector is measured on one frame at a time and is accurate to well under a ring. What
	 * the archer sees is not that: it is the followed face, carried from frame to frame between passes,
	 * and it can be precise on every frame it is asked about and still swim, turn, or come off the boss
	 * in between. An arrow read through a frame that has quietly turned is an arrow in the wrong place,
	 * so the thing to keep is the whole path rather than its last point.
	 */
	track: ({ frame: number } & ({ face: FaceLocation } | { face: null }))[];
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
	private firstSteady: number | null = null;
	private readonly costs: number[] = [];
	private readonly path: SweepResult['track'] = [];

	constructor(
		private readonly detectEveryMs: number,
		private readonly fps: number,
		/** The frame the labels were placed on, whose fit is needed to compare against them. */
		private readonly labelled: number,
		options: {
			sweep?: Record<string, number>;
			still?: Record<string, number>;
			arrows?: number;
			/** The learned detector's weights, when it is the one being measured. */
			model?: unknown;
			combine?: boolean;
			/**
			 * How the phone was held, as saved beside the recording.
			 *
			 * Left out, this measures a detector nobody runs. Gravity is the only thing that says which
			 * way up the boss is, and a fit with no such thing to hold on to keeps whatever angle it had
			 * last, which drifts; the app feeds it in, so a harness that does not is measuring the
			 * detector as it behaves on a laptop rather than on a phone.
			 */
			motion?: { at: number; gravity: { x: number; y: number; z: number } | null }[] | null;
		} = {}
	) {
		this.scanner = new Scanner({
			sweep: options.sweep,
			still: options.still,
			model: (options.model ?? null) as never,
			combine: options.combine
		});
		// The end's remaining arrows, exactly as the app sets it: only six are ever going to be offered.
		if (options.arrows) this.scanner.setLimit(options.arrows);
		this.motion = options.motion ?? null;
	}

	private readonly motion: { at: number; gravity: { x: number; y: number; z: number } | null }[] | null;
	private motionAt = 0;

	/** The sample taken nearest this moment of the recording, walked forward rather than searched. */
	private upAt(nowMs: number): number | null {
		if (!this.motion) return null;
		while (this.motionAt + 1 < this.motion.length && this.motion[this.motionAt + 1].at <= nowMs) {
			this.motionAt += 1;
		}
		return upFromGravity(this.motion[this.motionAt]?.gravity ?? null);
	}

	get scaleFactor(): number {
		return this.scanner.scaleFactor;
	}

	push(small: Frame) {
		const nowMs = (this.frames / this.fps) * 1000;
		this.scanner.setUp(this.upAt(nowMs));
		if (nowMs - this.last >= this.detectEveryMs) {
			this.last = nowMs;
			const started = performance.now();
			const result = this.scanner.pushReduced(small);
			this.costs.push(performance.now() - started);
			this.passes += 1;
			if (this.firstSteady === null && result.steady) this.firstSteady = this.passes;
			this.proposals += result.detections;
			for (const seen of result.proposed) {
				this.everything.push({ x: seen.x, y: seen.y, pass: this.passes });
			}
		} else {
			this.scanner.track(small);
		}

		const face = this.scanner.located;
		const factor = this.scanner.scaleFactor;
		this.path.push({ frame: this.frames, face: face ? scaleFace(face, factor) : null });
		if (face) this.withFace += 1;
		if (this.frames === this.labelled && face) this.at = scaleFace(face, factor);
		this.frames += 1;
	}

	result(): SweepResult {
		return {
			arrows: this.scanner.arrows,
			scored: this.scanner.scored,
			at: this.at,
			framesWithFace: this.withFace,
			passes: this.passes,
			proposals: this.proposals,
			everything: this.everything,
			steadyFrom: this.firstSteady,
			costs: this.costs,
			track: this.path
		};
	}
}

export { toFaceCoords };
