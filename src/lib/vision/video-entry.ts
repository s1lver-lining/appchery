// Entry point for scripts/arrow_detector.sh when it is given a video. Bundled and run inside a
// browser, because decoding frames and drawing the overlay are the browser's job. Not imported by
// the app.
//
// This drives the real `Scanner` the same way `AutoScore.svelte` does, at the same detection rate,
// so what the overlay shows is what an archer would have seen through the phone.
import { Scanner } from './pipeline';
import { detectFaces, toImageCoords, scaleFace } from './face';
import { refineFace } from './refine';
import { verifyRings } from './rings';
import { scoreAt, decimalScore } from '../domain/rounds/geometry';
import { WA_10_RING } from '../domain/rounds/seed';
import type { Frame, FaceLocation, Impact } from './types';

export interface FrameState {
	faces: FaceLocation[];
	steady: boolean;
	settled: number;
	detections: number;
	arrows: { x: number; y: number; imageX: number; imageY: number; label: string; decimal: number | null }[];
	pending: { imageX: number; imageY: number; seen: number }[];
	/** Milliseconds the detection pass took, which is the number that decides whether it can run live. */
	cost: number;
	/** True on frames where the full search ran, rather than the cheap follow between detections. */
	detected: boolean;
}

/**
 * One replay of one video. Holds the scanner across frames, because every signal the live path uses
 * (the background reference, the settle counter, the tracker's evidence) is built up over time and a
 * frame considered on its own carries none of it.
 */
export class Replay {
	private readonly scanner: Scanner;
	private last = -Infinity;

	/** The frame the crop is cut from, kept only for the length of one push. */
	private full: Frame | null = null;

	constructor(detectEveryMs: number, model: unknown | null) {
		this.detectEveryMs = detectEveryMs;
		this.scanner = new Scanner({
			model: (model ?? null) as never,
			crop: model ? (face, size, span) => this.cut(face, size, span) : null
		});
	}

	private readonly detectEveryMs: number;
	/** Video time the detector is busy until, so a slow pass costs passes rather than frames. */
	private busyUntil = -Infinity;
	/**
	 * Whether the face was trusted when the detector last said. Only a detection pass knows, and
	 * reporting it as untrusted on every frame in between made the overlay blink between its two
	 * colours at the detection rate, which reads as the fit flickering when nothing has moved at all.
	 */
	private trusted = false;
	private skipped = 0;

	/**
	 * The rectified square the learned detector is fed, cut from the full frame rather than the
	 * reduced one the face was found on. Nearest neighbour, because that is how the training crops
	 * were sampled: shown a cleaner picture than it learnt on, the model has no way to know.
	 */
	private cut(face: FaceLocation, size: number, span: number): Frame | null {
		const frame = this.full;
		if (!frame) return null;
		const factor = this.scanner.scaleFactor;
		const cos = Math.cos(face.rotation);
		const sin = Math.sin(face.rotation);
		const data = new Uint8ClampedArray(size * size * 4);

		for (let j = 0; j < size; j++) {
			for (let i = 0; i < size; i++) {
				const fx = ((i + 0.5) / size) * 2 * span - span;
				const fy = ((j + 0.5) / size) * 2 * span - span;
				const px = fx * face.semiMajor * factor;
				const py = fy * face.semiMinor * factor;
				const x = Math.round(face.cx * factor + px * cos - py * sin);
				const y = Math.round(face.cy * factor + px * sin + py * cos);
				const at = (j * size + i) * 4;
				data[at + 3] = 255;
				if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
				const p = (y * frame.width + x) * 4;
				data[at] = frame.data[p];
				data[at + 1] = frame.data[p + 1];
				data[at + 2] = frame.data[p + 2];
			}
		}
		return { width: size, height: size, data };
	}

	setLimit(limit: number) {
		this.scanner.setLimit(limit);
	}

	get scaleFactor(): number {
		return this.scanner.scaleFactor;
	}

	/**
	 * Feeds one frame, at the timestamp it would have arrived at in a live session, along with the
	 * reduced copy detection runs on. The full frame is only ever read to cut a crop from.
	 */
	push(full: Frame, small: Frame, nowMs: number): FrameState {
		this.full = full;
		const started = performance.now();

		/**
		 * Detection is offered on a clock and dropped when the detector is still working, which is what
		 * the app does: the pass runs in a worker and a frame offered while it is busy is thrown away
		 * rather than queued. Modelling that is the difference between measuring the detector and
		 * measuring the archer's experience of it. A pass costing more than the interval does not slow
		 * the video down, it simply happens less often, and a replay that instead ran every pass
		 * whatever it cost reported a frame rate no phone would ever show.
		 */
		if (nowMs - this.last >= this.detectEveryMs && nowMs >= this.busyUntil) {
			this.last = nowMs;
			const before = performance.now();
			const result = this.scanner.pushReduced(small);
			this.busyUntil = nowMs + (performance.now() - before);
			this.trusted = result.steady;
			return this.state(result.faces, result.steady, result.detections, result.arrows, result.pending, started, true);
		}
		if (nowMs - this.last >= this.detectEveryMs) this.skipped += 1;

		const faces = this.scanner.track(small);
		return this.state(faces, this.trusted, 0, this.scanner.arrows, this.scanner.pending, started, false);
	}

	/** Passes the detector was too busy to take, which is what a slow detector actually costs. */
	get dropped(): number {
		return this.skipped;
	}

	private state(
		faces: FaceLocation[],
		steady: boolean,
		detections: number,
		arrows: Impact[],
		pending: Impact[],
		started: number,
		detected: boolean
	): FrameState {
		const factor = this.scanner.scaleFactor;
		const place = (impact: Impact) => {
			const face = faces[impact.face] ?? faces[0];
			if (!face) return { imageX: 0, imageY: 0 };
			const point = toImageCoords(face, impact.x, impact.y);
			return { imageX: point.x * factor, imageY: point.y * factor };
		};

		return {
			// Reported in the video's own pixels, so the caller draws without knowing the detection scale.
			faces: faces.map((face) => (scaleFace(face, factor))),
			steady,
			settled: this.scanner.settleCount,
			detections,
			arrows: arrows.map((arrow) => ({
				x: arrow.x,
				y: arrow.y,
				...place(arrow),
				label: scoreAt(WA_10_RING, arrow.x, arrow.y).label,
				decimal: decimalScore(WA_10_RING, arrow.x, arrow.y)
			})),
			pending: pending.map((candidate) => ({ ...place(candidate), seen: candidate.seen })),
			cost: performance.now() - started,
			detected
		};
	}
}

/**
 * Follows the face through a recording, for the labelling tool rather than for scoring.
 *
 * Arrows do not move once they are in the boss, and the face fit gives a frame in which they do not
 * move either: an impact clicked once sits at the same face coordinate in every later frame, whatever
 * the camera did in between. So one click labels a whole video, and this is what turns the click into
 * a position on each frame.
 */
export class FaceTrack {
	private faces: FaceLocation[] = [];

	/** The face on this frame, refit from the last one where possible and searched for when not. */
	push(small: Frame): FaceLocation | null {
		if (this.faces.length > 0) {
			const followed = this.faces.map((face) => refineFace(small, face));
			// A fit that has fallen off the target is worse than no fit, so it is dropped and searched again.
			if (followed[0] && verifyRings(small, followed[0]).ok) {
				this.faces = followed;
				return followed[0];
			}
		}

		const found = detectFaces(small).filter((face) => verifyRings(small, face).ok);
		this.faces = found;
		return found[0] ?? null;
	}
}

export { toFaceCoords as toFace } from './face';
