// Entry point for scripts/eval-proposer.mjs, which asks what the arrow proposer makes of one frame
// when it is handed the archer's own fit. Not imported by the app.
import { downscale } from './pixels';
export { downscale };
import { faceFromAnchors, scaleFace } from './face';
import { detectArrowsInStill, type StillOptions } from './still';
import { detectArrowsLearned, type ArrowModel } from './learned';
import type { Frame } from './types';

export interface Proposal {
	/** Where the shaft meets the paper, in face coordinates. */
	x: number;
	y: number;
	area: number;
	length: number;
	/** How sure the learned detector is, where it is the one answering. */
	confidence?: number;
}

/**
 * Runs the arrow proposer on one frame, against a face somebody else has already decided.
 *
 * Which is the whole point of it. Everything the detector reports is read through a fit, so a missed
 * arrow can always be the proposer failing or the fit being wrong, and measured through the tracker
 * the two are inseparable: a frame whose coordinates have quietly turned reports every arrow in the
 * wrong place and looks exactly like a proposer that cannot see them. Handed the archer's own fit for
 * that same frame, there is nothing left in the answer but the proposer.
 *
 * The anchors arrive in the original image's pixels, at the radius the fit's own frame uses, and are
 * reduced with the picture so that both describe the same thing at the same scale.
 */
export function propose(
	frame: Frame,
	anchors: [number, number][],
	scale: number,
	options: StillOptions = {},
	model: ArrowModel | null = null
): Proposal[] {
	const small = downscale(frame, scale);
	const full = faceFromAnchors(anchors, 1);
	if (!full) return [];
	const face = scaleFace(full, 1 / scale);
	if (model) {
		return detectArrowsLearned(small, face, model).map((arrow) => ({
			x: arrow.x,
			y: arrow.y,
			area: 0,
			length: 0,
			confidence: arrow.confidence
		}));
	}
	return detectArrowsInStill(small, face, options).map((arrow) => ({
		x: arrow.x,
		y: arrow.y,
		area: arrow.area,
		length: arrow.length
	}));
}
