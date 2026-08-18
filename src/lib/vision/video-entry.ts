// Entry point for scripts/arrow_detector.sh when it is given a video. Bundled and run inside a
// browser, because decoding frames and drawing the overlay are the browser's job. Not imported by
// the app.
//
// This drives the real `Scanner` the same way `AutoScore.svelte` does, at the same detection rate,
// so what the overlay shows is what an archer would have seen through the phone.
import { Scanner } from './pipeline';
import { toImageCoords } from './face';
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

	constructor(
		private readonly detectEveryMs: number,
		model: unknown | null,
		private readonly cropper: ((face: FaceLocation, size: number, span: number) => Frame | null) | null
	) {
		this.scanner = new Scanner({
			model: (model ?? null) as never,
			crop: cropper ?? null
		});
	}

	setLimit(limit: number) {
		this.scanner.setLimit(limit);
	}

	get scaleFactor(): number {
		return this.scanner.scaleFactor;
	}

	/** Feeds one already reduced frame, at the timestamp it would have arrived at in a live session. */
	push(small: Frame, nowMs: number): FrameState {
		const started = performance.now();

		if (nowMs - this.last >= this.detectEveryMs) {
			this.last = nowMs;
			const result = this.scanner.pushReduced(small);
			return this.state(result.faces, result.steady, result.detections, result.arrows, result.pending, started, true);
		}

		const faces = this.scanner.track(small);
		return this.state(faces, false, 0, this.scanner.arrows, this.scanner.pending, started, false);
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
			faces: faces.map((face) => ({
				...face,
				cx: face.cx * factor,
				cy: face.cy * factor,
				semiMajor: face.semiMajor * factor,
				semiMinor: face.semiMinor * factor
			})),
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
