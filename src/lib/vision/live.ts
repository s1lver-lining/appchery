import { refineFace } from './refine';
import type { ArrowModel } from './learned';
import type { Frame, FaceLocation, Impact } from './types';

/**
 * The camera side of live scoring: what the page keeps on the render thread once detection has been
 * moved off it.
 *
 * The split follows what each job actually costs. Following a face that is already almost right is a
 * few hundred pixel reads, so it happens on every frame and the rings sit on the boss at the
 * display's own rate. Searching for faces and arrows costs far more and is worth doing a few times a
 * second, so it goes to the worker and the page never waits for it.
 *
 * What comes back is in face coordinates, and that is what makes the split safe: an arrow is at the
 * same place on the face however far the camera has moved since the frame it was found in, so a
 * result that arrives late is still drawn in the right place rather than in a stale one.
 */
export class LiveScanner {
	private readonly worker: Worker;
	private faces: FaceLocation[] = [];
	private offered = false;

	/** Arrows the detector has confirmed, in face coordinates. */
	arrows: Impact[] = [];
	pending = 0;
	steady = false;
	readonly scaleFactor = 4;

	constructor(private readonly onresult: () => void) {
		this.worker = new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
		this.worker.onmessage = (event) => {
			const result = event.data;
			if (result.type !== 'result') return;
			this.offered = false;
			this.arrows = result.arrows;
			this.pending = result.pending;
			this.steady = result.steady;
			/**
			 * Only taken when the page has nothing of its own, or when the count changed and a face has
			 * appeared or gone. Otherwise the geometry the page is following stays authoritative: a
			 * detection computed from an older frame lands somewhere slightly different, and adopting it
			 * every time is what made the rings jump every third of a second.
			 */
			if (this.faces.length !== result.faces.length) this.faces = result.faces;
			this.onresult();
		};
	}

	get located(): FaceLocation[] {
		return this.faces;
	}

	setModel(model: ArrowModel | null) {
		this.worker.postMessage({ type: 'model', model });
	}

	setLimit(limit: number) {
		this.worker.postMessage({ type: 'limit', limit });
	}

	/** Follows the faces already found. Cheap enough for every frame, which is the whole point. */
	follow(small: Frame): FaceLocation[] {
		if (this.faces.length > 0) this.faces = this.faces.map((face) => refineFace(small, face));
		return this.faces;
	}

	/**
	 * Offers a frame to the detector. Ignored while the last one is still being worked on, because a
	 * queue of frames only means answering questions about a boss the camera stopped pointing at.
	 */
	offer(small: Frame) {
		if (this.offered) return;
		this.offered = true;
		this.worker.postMessage(
			{ type: 'frame', width: small.width, height: small.height, data: small.data.buffer },
			[small.data.buffer]
		);
	}

	/** The end has been taken, so its arrows are remembered as scored rather than offered again. */
	accept() {
		this.arrows = [];
		this.worker.postMessage({ type: 'accept' });
	}

	reject(arrow: Impact) {
		this.arrows = this.arrows.filter((a) => a !== arrow);
		this.worker.postMessage({ type: 'reject', x: arrow.x, y: arrow.y, face: arrow.face });
	}

	stop() {
		this.worker.terminate();
	}
}
