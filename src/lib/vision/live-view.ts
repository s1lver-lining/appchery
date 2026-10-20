import { regionBox, toImageCoords, type FaceLocation, type Impact } from './pipeline';
import { DETECT_EVERY_MS, type LiveRegion, type LiveScanner } from './live';
import { SteadyFace } from './steady';
import type { Frame } from './types';

/** Rings 9 and 10 of ten equal rings, which is the gold's share of the face radius. */
const GOLD_SHARE = 0.2;

/** The camera page's work on each frame, shared with the labelling player so it shows the phone's own overlay. */
export class LiveView {
	private readonly work = document.createElement('canvas');
	private readonly regionWork = document.createElement('canvas');
	private readonly steadying: SteadyFace[] = [];
	private lastDetection = 0;

	constructor(readonly scanner: LiveScanner) {}

	/** One frame: the face followed here, a pass handed to the worker when one is due. */
	frame(video: HTMLVideoElement, now: number, smooth: boolean): { faces: FaceLocation[]; shown: FaceLocation[] } | null {
		const small = this.reduce(video);
		if (!small) return null;
		const faces = this.scanner.follow(small);
		// Smoothed for the rings alone: the arrows go through the fit itself, because a mark is an answer.
		const shown = smooth ? faces.map((face, i) => this.smoother(i).show(face)) : faces;
		if (now - this.lastDetection >= DETECT_EVERY_MS) {
			this.lastDetection = now;
			// Cut before the offer and after the follow: it is framed on the fit this frame just made.
			const region = this.cutRegion(video, faces[0]);
			// Offered last, because both buffers are given away rather than copied.
			this.scanner.offer(small, region);
		}
		return { faces, shown };
	}

	/** One smoother per face, made on demand, so a three spot's three faces are steadied separately. */
	private smoother(index: number): SteadyFace {
		return (this.steadying[index] ??= new SteadyFace());
	}

	/** The frame reduced for detection, scaled by the canvas rather than by a loop over every pixel. */
	private reduce(video: HTMLVideoElement): Frame | null {
		const scale = this.scanner.scaleFactor;
		const width = Math.floor(video.videoWidth / scale);
		const height = Math.floor(video.videoHeight / scale);
		if (width === 0 || height === 0) return null;
		this.work.width = width;
		this.work.height = height;
		const context = this.work.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		// Drawing straight to the smaller canvas hands the scaling to the GPU, which is most of the win.
		context.drawImage(video, 0, 0, width, height);
		return { width, height, data: context.getImageData(0, 0, width, height).data };
	}

	/** The paper around the face, cut from the video rather than the reduced frame so it holds more detail. */
	private cutRegion(video: HTMLVideoElement, face: FaceLocation | undefined): LiveRegion | null {
		if (!face) return null;
		const box = regionBox(face, this.scanner.scaleFactor, video.videoWidth, video.videoHeight);
		if (!box) return null;
		this.regionWork.width = box.width;
		this.regionWork.height = box.height;
		const context = this.regionWork.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(video, box.x, box.y, box.width * box.scale, box.height * box.scale, 0, 0, box.width, box.height);
		return {
			frame: { width: box.width, height: box.height, data: context.getImageData(0, 0, box.width, box.height).data },
			x: box.x,
			y: box.y,
			scale: box.scale
		};
	}

	/** The overlay. The first `kept` arrows are drawn as taken, and `label` writes a score beside each when given. */
	draw(
		canvas: HTMLCanvasElement,
		located: FaceLocation[],
		fitted: FaceLocation[],
		arrows: Impact[],
		width: number,
		height: number,
		kept: number,
		label: ((arrow: Impact) => string) | null
	) {
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return;

		const scale = this.scanner.scaleFactor;
		context.lineWidth = Math.max(2, width / 300);

		// Every face is outlined, so a three spot shows all three being watched.
		for (const face of located) {
			// Through the face's own projection: the ellipse that matches the gold does not match the edge.
			const ring = (share: number) => {
				context.beginPath();
				for (let i = 0; i <= 128; i++) {
					const angle = (i / 128) * Math.PI * 2;
					const point = toImageCoords(face, Math.cos(angle) * share, Math.sin(angle) * share);
					const x = point.x * scale;
					const y = point.y * scale;
					i === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
				}
				context.closePath();
				context.stroke();
			};

			context.strokeStyle = 'rgba(255,255,255,0.85)';
			ring(1);
			// The gold sitting on the real gold is how the archer tells at a glance that the fit is right.
			context.strokeStyle = 'rgba(247,224,60,0.95)';
			ring(GOLD_SHARE);
		}

		arrows.forEach((arrow, index) => {
			// The fit, not the smoothed line, which lags it by up to a tenth of a ring.
			const face = fitted[arrow.face] ?? located[arrow.face];
			if (!face) return;
			const point = toImageCoords(face, arrow.x, arrow.y);
			context.strokeStyle = index < kept ? '#3ddc84' : 'rgba(255,255,255,0.4)';
			// Dashed for one offered to make the end's number up, so the archer knows which to look at twice.
			context.setLineDash(arrow.unsure ? [width / 120, width / 120] : []);
			context.beginPath();
			context.arc(point.x * scale, point.y * scale, width / 60, 0, Math.PI * 2);
			context.stroke();
			context.setLineDash([]);

			if (!label) return;
			// Saved, because the line width and the font here are not the ones the rings are drawn with.
			context.save();
			const text = label(arrow);
			context.font = `600 ${Math.max(11, width / 40)}px system-ui, sans-serif`;
			context.textAlign = 'center';
			context.textBaseline = 'bottom';
			context.lineWidth = Math.max(2, width / 300);
			context.strokeStyle = 'rgba(0,0,0,0.75)';
			context.strokeText(text, point.x * scale, point.y * scale - width / 45);
			context.fillStyle = '#ffffff';
			context.fillText(text, point.x * scale, point.y * scale - width / 45);
			context.restore();
		});
	}
}
