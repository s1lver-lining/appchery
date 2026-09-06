// A recording played into the app's own live scoring path, for scripts/virtual-camera.mjs. Not
// imported by the app. Why it exists beside video-entry.ts: doc/live-scoring-split.md.
import { LiveScanner, DETECT_EVERY_MS } from './live';
import { regionBox } from './pipeline';
import { toImageCoords, scaleFace } from './face';
import { SteadyFace } from './steady';
import { upFromGravity } from './motion';
import { scoreAt, decimalScore } from '../domain/rounds/geometry';
import { WA_10_RING } from '../domain/rounds/seed';
import type { Frame, FaceLocation, Impact } from './types';
import type { FrameState } from './video-entry';

export { DETECT_EVERY_MS };
export { DRAWN_RINGS } from './video-entry';
export { upFromGravity };

/** What one frame looked like, plus what the split between page and worker cost on it. */
export interface SplitState extends FrameState {
	/** How far the rebase moved each arrow, in face radii. It should move nothing. */
	rebase: number[];
	/** The worst of those, so a recording can be summarised by one number a frame. */
	rebaseWorst: number;
	/** Detection passes that have come back at all. */
	passes: number;
	/** Proposals the last pass made, before the tracker judged any of them. */
	proposals: number;
}

/** How the phone was held, as saved beside the recording. Gravity says which way up the boss is. */
type MotionSample = { at: number; gravity: { x: number; y: number; z: number } | null };

export class VirtualCamera {
	private readonly scanner: LiveScanner;
	private readonly work = document.createElement('canvas');
	private readonly regionWork = document.createElement('canvas');
	private readonly steadying: SteadyFace[] = [];
	private lastDetection = -Infinity;
	private faces: FaceLocation[] = [];
	private pretty: boolean;
	private motion: MotionSample[] | null = null;
	private motionAt = 0;

	// The worker is built separately and passed in, because esbuild does not rewrite `new Worker(new URL())`.
	constructor(workerUrl: string, pretty = false) {
		this.pretty = pretty;
		this.scanner = new LiveScanner(
			() => {},
			() => new Worker(workerUrl, { type: 'module' })
		);
	}

	get scaleFactor(): number {
		return this.scanner.scaleFactor;
	}

	setLimit(limit: number) {
		this.scanner.setLimit(limit);
	}

	setSmoothing(on: boolean) {
		this.pretty = on;
	}

	setMotion(samples: MotionSample[] | null) {
		this.motion = samples;
		this.motionAt = 0;
	}

	stop() {
		this.scanner.stop();
	}

	/** The sample nearest this moment, walked forward rather than searched. */
	private upAt(nowMs: number): number | null {
		if (!this.motion) return null;
		while (this.motionAt + 1 < this.motion.length && this.motion[this.motionAt + 1].at <= nowMs) {
			this.motionAt += 1;
		}
		return upFromGravity(this.motion[this.motionAt]?.gravity ?? null);
	}

	private smoother(index: number): SteadyFace {
		return (this.steadying[index] ??= new SteadyFace());
	}

	/** As `AutoScore.reduce` does it. */
	private reduce(video: HTMLVideoElement): Frame | null {
		const scale = this.scanner.scaleFactor;
		const width = Math.floor(video.videoWidth / scale);
		const height = Math.floor(video.videoHeight / scale);
		if (width === 0 || height === 0) return null;
		this.work.width = width;
		this.work.height = height;
		const context = this.work.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(video, 0, 0, width, height);
		return { width, height, data: context.getImageData(0, 0, width, height).data };
	}

	/** As `AutoScore.cutRegion` does it. */
	private cutRegion(video: HTMLVideoElement) {
		const face = this.faces[0];
		if (!face) return null;
		const box = regionBox(face, this.scanner.scaleFactor, video.videoWidth, video.videoHeight);
		if (!box) return null;
		this.regionWork.width = box.width;
		this.regionWork.height = box.height;
		const context = this.regionWork.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(
			video,
			box.x,
			box.y,
			box.width * box.scale,
			box.height * box.scale,
			0,
			0,
			box.width,
			box.height
		);
		return {
			frame: {
				width: box.width,
				height: box.height,
				data: context.getImageData(0, 0, box.width, box.height).data
			},
			x: box.x,
			y: box.y,
			scale: box.scale
		};
	}

	// The same sequence as `AutoScore.tick`: the crop is framed on the fit this frame just made.
	tick(video: HTMLVideoElement, nowMs: number): SplitState | null {
		this.scanner.setUp(this.upAt(nowMs));

		const small = this.reduce(video);
		if (!small) return null;

		this.faces = this.scanner.follow(small);
		const shown = this.pretty ? this.faces.map((face, i) => this.smoother(i).show(face)) : this.faces;

		if (nowMs - this.lastDetection >= DETECT_EVERY_MS) {
			this.lastDetection = nowMs;
			const region = this.cutRegion(video);
			this.scanner.offer(small, region);
		}

		return this.state(shown);
	}

	private state(shown: FaceLocation[]): SplitState {
		const factor = this.scanner.scaleFactor;
		const faces = this.faces;
		const lags = shown.map((drawn, i) => {
			let worst = 0;
			for (let a = 0; a < drawn.anchors.length; a++) {
				const [x, y] = drawn.anchors[a];
				const [fx, fy] = faces[i].anchors[a];
				worst = Math.max(worst, Math.hypot(x - fx, y - fy));
			}
			return worst / Math.max(faces[i].semiMajor, 1);
		});

		const place = (impact: Impact) => {
			const face = faces[impact.face] ?? faces[0];
			if (!face) return { imageX: 0, imageY: 0 };
			const point = toImageCoords(face, impact.x, impact.y);
			return { imageX: point.x * factor, imageY: point.y * factor };
		};

		// Both coordinates are on the same face, so the distance is already in face radii.
		const rebase = this.scanner.arrows.map((arrow) =>
			arrow.source ? Math.hypot(arrow.x - arrow.source.x, arrow.y - arrow.source.y) : 0
		);

		return {
			faces: shown.map((face) => scaleFace(face, factor)),
			steady: this.scanner.steady,
			settled: 0,
			detections: this.scanner.readout.proposals,
			arrows: this.scanner.arrows.map((arrow) => ({
				x: arrow.x,
				y: arrow.y,
				...place(arrow),
				label: scoreAt(WA_10_RING, arrow.x, arrow.y).label,
				decimal: decimalScore(WA_10_RING, arrow.x, arrow.y)
			})),
			// Only the count crosses the worker boundary, so there is nothing to draw them from.
			pending: [],
			cost: this.scanner.readout.cost,
			detected: false,
			lag: Math.max(0, ...lags),
			rebase,
			rebaseWorst: Math.max(0, ...rebase),
			passes: this.scanner.readout.passes,
			proposals: this.scanner.readout.proposals
		};
	}
}
