// Entry point for scripts/eval-arrows-video.mjs, which replays a recording and asks what it found.
// Not imported by the app.
import { Scanner, type Region } from './pipeline';
import { toFaceCoords, scaleFace } from './face';
import { upFromGravity } from './motion';
import { luma } from './pixels';
import { ringAgreement } from './refine';
import { SteadyFace } from './steady';
import type { Frame, FaceLocation, Impact } from './types';
export { DETECT_EVERY_MS } from './live';

export interface SweepResult {
	/** Arrows shown by the end of the recording, in the detector's own face coordinates. */
	arrows: Impact[];
	/** Of those, the ones that earned their place, which is what an accepted end writes down. */
	scored: Impact[];
	/**
	 * Every mark that was on the screen at the end of any pass, with the pass it was showing in.
	 *
	 * What the archer sees is not the end state. A mark that appears for half a second in the grass and
	 * goes away again is not in the final tally at all, and it is exactly what somebody watching the
	 * overlay complains about; counted only at the end, the detector looks tidier than it looks to the
	 * person holding the phone.
	 */
	shownEver: { x: number; y: number; pass: number; unsure: boolean }[];
	/** The fit on the frame the archer placed the labels against, for putting both in one frame. */
	at: FaceLocation | null;
	framesWithFace: number;
	passes: number;
	/** Passes the clock called for and the detector was too busy to take, which is what cost buys. */
	dropped: number;
	proposals: number;
	/** Every proposal of every pass, to separate what was never seen from what was seen and dropped. */
	everything: { x: number; y: number; pass: number; area: number; face: number; from: string }[];
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
	 * How sharp the paper looked on each pass, so a harness can ask whether some frames are worth more.
	 *
	 * A sweep is made by a walking archer, so the frames it offers are not equally good: some are taken
	 * mid stride and smeared, and a shaft two pixels wide does not survive that. The tracker spends its
	 * passes on a clock and has no idea which frames it is spending them on.
	 */
	sharpness: number[];
	/**
	 * Where the face was on every single frame, which is a different question from where it ends up.
	 *
	 * The still detector is measured on one frame at a time and is accurate to well under a ring. What
	 * the archer sees is not that: it is the followed face, carried from frame to frame between passes,
	 * and it can be precise on every frame it is asked about and still swim, turn, or come off the boss
	 * in between. An arrow read through a frame that has quietly turned is an arrow in the wrong place,
	 * so the thing to keep is the whole path rather than its last point.
	 */
	track: {
		frame: number;
		face: FaceLocation | null;
		/** The same face after the overlay's own smoother, which is what the archer actually sees. */
		shown: FaceLocation | null;
		/** Whether this frame got a full search, or was only followed from the frame before it. */
		pass: boolean;
		/** How well the fit's rings match the colours under them, which is the check it was let in on. */
		rings: number;
	}[];
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
	private everything: { x: number; y: number; pass: number; area: number; face: number; from: string }[] = [];
	private at: FaceLocation | null = null;
	private firstSteady: number | null = null;
	private readonly costs: number[] = [];
	private readonly sharp: number[] = [];
	private readonly everShown: SweepResult['shownEver'] = [];
	/** The overlay's own smoother, so the harness can see the lines the archer sees. */
	private smoother: SteadyFace | null = null;
	private readonly path: SweepResult['track'] = [];

	constructor(
		private readonly detectEveryMs: number,
		private readonly fps: number,
		/** The frame the labels were placed on, whose fit is needed to compare against them. */
		private readonly labelled: number,
		options: {
			sweep?: Record<string, number>;
			still?: Record<string, number>;
			/**
			 * How much the caller reduced the frames it is about to push, so the fit can be put back.
			 *
			 * Has to be told rather than assumed. Everything this reports is read against labels placed
			 * on the full sized picture, and the way back is the scanner's own factor; left at its
			 * default while a harness fed frames reduced by some other amount, the fit came back a
			 * third too large and every arrow was compared against a place it was never at. That does
			 * not look like a bad measurement, it looks like a detector that has stopped working.
			 */
			scale?: number;
			/**
			 * What one pass costs on the device being measured, as a multiple of what it costs here.
			 *
			 * A pass is offered on a clock and dropped when the detector is still working, so what a
			 * detector costs decides how many looks a sweep gets. This runs on a developer's machine and
			 * the archer's phone is several times slower, so measuring the drops at the speed of the
			 * machine doing the measuring says a setting is affordable that on a phone is not. One means
			 * this machine; three or four is the honest range for a phone against a laptop, and the
			 * number wants measuring on a real device rather than guessing.
			 */
			slower?: number;
			arrows?: number;
			/** The learned detector's weights, when it is the one being measured. */
			model?: unknown;
			combine?: boolean;
			/** Which written proposer reads the paper, so a harness can compare them end to end. */
			proposer?: 'shape' | 'impacts' | 'both';
			impacts?: Record<string, number>;
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
			scale: options.scale,
			sweep: options.sweep,
			still: options.still,
			model: (options.model ?? null) as never,
			combine: options.combine,
			proposer: options.proposer,
			impacts: options.impacts
		});
		// The end's remaining arrows, exactly as the app sets it: only six are ever going to be offered.
		if (options.arrows) this.scanner.setLimit(options.arrows);
		this.motion = options.motion ?? null;
		this.slower = Math.max(0, options.slower ?? 1);
	}

	/** How much slower than this machine the device being modelled is. */
	private readonly slower: number;
	/**
	 * The moment in the recording the detector is busy until, so a slow pass costs passes and not frames.
	 *
	 * The app runs detection in a worker and throws away any frame offered while the last one is still
	 * going; without that here, every setting gets every pass it asks for however long it takes, and an
	 * expensive detector is measured as though it were free. That is not a small distortion: it is the
	 * whole argument for one setting over another when the settings differ in cost.
	 */
	private busyUntil = -Infinity;
	/** The last moment of the recording fed in, so the passes the clock called for can be counted. */
	private lastNowMs = 0;

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

	/** Every face as of the last frame fed in, so a harness can model what the page would adopt. */
	locatedAll() {
		return this.scanner.locatedAll;
	}

	/** Which way is up as of the last frame, so a harness following a second fit can agree with this one. */
	upNow(): number | null {
		return this.upAt(this.lastNowMs);
	}

	/** Passes taken so far, so a harness can tell a frame that got one from a frame that did not. */
	passesTaken(): number {
		return this.passes;
	}

	/** The face as of the last frame fed in, so a harness can cut the same crop the camera page cuts. */
	get located(): FaceLocation | null {
		return this.scanner.located;
	}

	/**
	 * A region may be given as a function, and then it is only asked for on the passes that are taken.
	 *
	 * Which is what the camera page does: it cuts the crop just before it offers a frame, not on every
	 * frame it draws. A harness cutting one for every frame pays for forty crops to use one, and the cost
	 * lands outside what a pass is timed at, so it does not even show up as the thing it is.
	 */
	push(small: Frame, region: Region | null | (() => Region | null) = null) {
		const nowMs = (this.frames / this.fps) * 1000;
		this.lastNowMs = nowMs;
		this.scanner.setUp(this.upAt(nowMs));
		// Whether this frame got a full search or only a follow, so the two can be told apart after.
		let pass = false;
		if (nowMs - this.last >= this.detectEveryMs && nowMs >= this.busyUntil) {
			pass = true;
			this.last = nowMs;
			const started = performance.now();
			const result = this.scanner.pushReduced(small, typeof region === 'function' ? region() : region);
			const cost = performance.now() - started;
			this.costs.push(cost);
			// In the recording's own time, so the next pass is owed from when this one would have ended.
			this.busyUntil = nowMs + cost * this.slower;
			this.passes += 1;
			this.sharp.push(sharpnessOf(small, this.scanner.located));
			for (const mark of this.scanner.arrows) {
				this.everShown.push({ x: mark.x, y: mark.y, pass: this.passes, unsure: Boolean(mark.unsure) });
			}
			if (this.firstSteady === null && result.steady) this.firstSteady = this.passes;
			this.proposals += result.detections;
			this.recent = result.proposed.map((seen) => ({ x: seen.x, y: seen.y }));
			for (const seen of result.proposed) {
				this.everything.push({ x: seen.x, y: seen.y, pass: this.passes, area: seen.area ?? 0, face: seen.face, from: seen.from ?? 'shape' });
			}
		} else {
			this.scanner.track(small);
		}

		const face = this.scanner.located;
		const factor = this.scanner.scaleFactor;
		/*
		 * What the archer would actually see, which is not what was fitted.
		 *
		 * The camera page draws through a smoother and has done all along, so measuring the raw fit
		 * measures something nobody looks at. Kept beside it rather than instead of it: the raw fit is
		 * what every coordinate is read through, and the smoothed one is only ever drawn.
		 */
		const drawn = face ? (this.smoother ??= new SteadyFace()).show(face) : null;
		this.path.push({
			frame: this.frames,
			face: face ? scaleFace(face, factor) : null,
			shown: drawn ? scaleFace(drawn, factor) : null,
			pass,
			rings: face ? ringAgreement(small, face) : 0
		});
		if (face) this.withFace += 1;
		if (this.frames === this.labelled && face) this.at = scaleFace(face, factor);
		this.frames += 1;
	}

	/** What is on the screen right now, for a harness watching a sweep pass by pass. */
	scannerArrows(): Impact[] {
		return this.scanner.arrows;
	}

	/** What the last pass proposed, before the tracker judged any of it. */
	lastProposals(): { x: number; y: number }[] {
		return this.recent;
	}

	private recent: { x: number; y: number }[] = [];

	result(): SweepResult {
		return {
			arrows: this.scanner.arrows,
			scored: this.scanner.scored,
			shownEver: this.everShown,
			at: this.at,
			framesWithFace: this.withFace,
			passes: this.passes,
			/*
			 * Counted from the clock rather than tallied frame by frame. A frame arriving while the
			 * detector is busy is not a dropped pass, and counting it as one said two thirds of the
			 * passes were being lost where the truth was a fifth: at sixty frames a second there are
			 * several frames inside every pass, and every one of them looked like a fresh refusal.
			 */
			dropped: Math.max(0, Math.floor(this.lastNowMs / this.detectEveryMs) - this.passes),
			proposals: this.proposals,
			everything: this.everything,
			steadyFrom: this.firstSteady,
			costs: this.costs,
			sharpness: this.sharp,
			track: this.path
		};
	}
}

/**
 * How much fine detail the paper is showing, as the mean absolute Laplacian over the face.
 *
 * A blurred frame has the same rings in the same places and none of the small structure, and a shaft is
 * nothing but small structure. Read over the face alone, because the grass and the fence behind it move
 * differently from the boss and would answer a question nobody asked.
 */
function sharpnessOf(frame: Frame, face: FaceLocation | null): number {
	if (!face) return 0;
	const radius = (face.semiMajor + face.semiMinor) / 2;
	const left = Math.max(1, Math.floor(face.cx - radius));
	const right = Math.min(frame.width - 2, Math.ceil(face.cx + radius));
	const top = Math.max(1, Math.floor(face.cy - radius));
	const bottom = Math.min(frame.height - 2, Math.ceil(face.cy + radius));
	let sum = 0;
	let n = 0;
	for (let y = top; y <= bottom; y++) {
		for (let x = left; x <= right; x++) {
			if (Math.hypot(x - face.cx, y - face.cy) > radius) continue;
			const at = (y * frame.width + x) * 4;
			const up = ((y - 1) * frame.width + x) * 4;
			const down = ((y + 1) * frame.width + x) * 4;
			const middle = luma(frame.data[at], frame.data[at + 1], frame.data[at + 2]);
			sum += Math.abs(
				luma(frame.data[at - 4], frame.data[at - 3], frame.data[at - 2]) +
					luma(frame.data[at + 4], frame.data[at + 5], frame.data[at + 6]) +
					luma(frame.data[up], frame.data[up + 1], frame.data[up + 2]) +
					luma(frame.data[down], frame.data[down + 1], frame.data[down + 2]) -
					4 * middle
			);
			n += 1;
		}
	}
	return n === 0 ? 0 : sum / n;
}

export { toFaceCoords };
export { regionBox, REGION_SCALE } from './pipeline';
export { toImageCoords } from './face';
// So a harness can model the camera page's own side of the split, which follows without searching.
export { refineFace } from './refine';
export { upFromGravity } from './motion';
// So a harness can ask what ring a mark would be scored in, which is the question the archer asks.
export { scoreAt } from '../domain/rounds/geometry';
export { WA_10_RING } from '../domain/rounds/seed';
// So a harness can reduce one decoded frame to two scales: the search's and the proposer's.
export { downscale } from './pixels';
