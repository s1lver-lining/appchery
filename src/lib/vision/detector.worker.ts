/**
 * Runs the detector off the render thread.
 *
 * Detection and the camera preview have nothing to say to each other and must not share a thread.
 * Inline, a detection that takes 600ms is 600ms in which the video does not repaint, which is what
 * made the learned detector arrive at one frame every two seconds: not because the pass was worth
 * that much time, but because everything else waited for it.
 *
 * Here the pass takes as long as it takes. The page hands over a frame when it has one and forgets
 * about it; whatever comes back is in face coordinates, which stay true however much the camera has
 * moved since, so the overlay projects them through the geometry it is following right now.
 */
import { Scanner } from './pipeline';
import type { ArrowModel } from './learned';
import type { Frame, Impact } from './types';

let scanner = new Scanner();
/** Dropped frames are the point: a frame offered while the last one is still going is not queued. */
let busy = false;

interface FrameMessage {
	type: 'frame';
	width: number;
	height: number;
	data: ArrayBuffer;
}

type Message =
	| FrameMessage
	| { type: 'model'; model: ArrowModel | null }
	| { type: 'limit'; limit: number }
	| { type: 'reject'; x: number; y: number; face: number }
	| { type: 'accept' }
	| { type: 'clear' };

function frameOf(message: FrameMessage): Frame {
	return {
		width: message.width,
		height: message.height,
		data: new Uint8ClampedArray(message.data)
	};
}

self.onmessage = (event: MessageEvent<Message>) => {
	const message = event.data;

	if (message.type === 'model') {
		scanner = new Scanner({ model: message.model });
		return;
	}

	if (message.type === 'limit') {
		scanner.setLimit(message.limit);
		return;
	}

	if (message.type === 'clear') {
		scanner = new Scanner();
		return;
	}

	if (message.type === 'reject') {
		scanner.reject({ x: message.x, y: message.y, face: message.face } as Impact);
		return;
	}

	if (message.type === 'accept') {
		scanner.accept();
		return;
	}

	if (busy) return;
	busy = true;
	try {
		const started = performance.now();
		const result = scanner.pushReduced(frameOf(message));
		self.postMessage({
			type: 'result',
			faces: result.faces,
			steady: result.steady,
			arrows: result.arrows,
			pending: result.pending.length,
			/*
			 * What the pass saw, for the readout the archer can turn on in the corner of the camera.
			 * Counted here because this is the only place that knows: by the time the page has the
			 * arrows, everything the tracker rejected and the time it took are gone.
			 */
			proposals: result.detections,
			early: result.early.length,
			cost: performance.now() - started
		});
	} finally {
		busy = false;
	}
};

export {};
