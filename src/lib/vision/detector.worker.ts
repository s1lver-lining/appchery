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
import { Scanner, type Region } from './pipeline';
import type { ArrowModel } from './learned';
import type { Frame, Impact } from './types';

/**
 * What the page has told the detector about the session, kept apart from the scanner itself.
 *
 * The scanner is replaced outright when the model changes or the end is cleared, and a replacement
 * knows only its defaults. Everything the page said before that moment would go with the old one:
 * the end's arrow count, so a six arrow end silently went back to holding twelve, and which way up
 * the boss is, so the next face acquired was pinned to nothing. The page has no reason to know that
 * a new scanner was made and no way to notice, so the settings are held here and put back on.
 */
let limit: number | null = null;
let up: number | null = null;
let model: ArrowModel | null = null;

function fresh(): Scanner {
	const made = new Scanner({ model });
	if (limit !== null) made.setLimit(limit);
	made.setUp(up);
	return made;
}

let scanner = fresh();
/** Dropped frames are the point: a frame offered while the last one is still going is not queued. */
let busy = false;

interface FrameMessage {
	type: 'frame';
	width: number;
	height: number;
	data: ArrayBuffer;
	/**
	 * A sharper cut of the same moment, around the face, for reading arrows off.
	 *
	 * Cut by the page because only the page has the camera's own pixels: by the time a frame reaches
	 * here it has already been reduced, and a crop taken from it would be a magnified copy of the same
	 * information rather than more of it. Optional, so a caller that has not got one still works.
	 */
	region?: {
		width: number;
		height: number;
		data: ArrayBuffer;
		x: number;
		y: number;
		scale: number;
	};
}

type Message =
	| FrameMessage
	| { type: 'model'; model: ArrowModel | null }
	| { type: 'limit'; limit: number }
	| { type: 'up'; up: number | null }
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

function regionOf(message: FrameMessage): Region | null {
	const region = message.region;
	if (!region) return null;
	return {
		frame: {
			width: region.width,
			height: region.height,
			data: new Uint8ClampedArray(region.data)
		},
		x: region.x,
		y: region.y,
		scale: region.scale
	};
}

self.onmessage = (event: MessageEvent<Message>) => {
	const message = event.data;

	if (message.type === 'model') {
		model = message.model;
		scanner = fresh();
		return;
	}

	if (message.type === 'up') {
		up = message.up;
		scanner.setUp(up);
		return;
	}

	if (message.type === 'limit') {
		limit = message.limit;
		scanner.setLimit(limit);
		return;
	}

	if (message.type === 'clear') {
		scanner = fresh();
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
		const result = scanner.pushReduced(frameOf(message), regionOf(message));
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
