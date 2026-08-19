import { faceFromAnchors } from './face';
import type { FaceLocation } from './types';

/**
 * Smooths the four points a face is drawn from, for the overlay only.
 *
 * The fit is measured against the picture afresh every frame, so what it reports is the truth plus
 * whatever that frame's noise was worth. That last part is small — a fiftieth of a ring, well under a
 * pixel of the reduced frame it is fitted on — but it is different every frame and the eye is far
 * better at seeing a line move than at seeing where a line is. So the overlay shimmers while being,
 * on any single frame, as right as it can be.
 *
 * Averaging it away would cost the thing the overlay is for: lines that lag behind the boss as the
 * archer sweeps the phone are worse than lines that tremble. So the damping is chosen per frame from
 * how far the fit has actually moved. A move the size of the noise is mostly ignored; a move much
 * larger than the noise is a real one and is followed at once. A pan is followed with no lag worth
 * seeing, and a phone held still draws a still overlay.
 *
 * Nothing here touches the fit. Arrow positions, the ring check and everything reported are measured
 * from the face the detector actually found.
 */

/**
 * The speed, in face radii per frame, at which a movement stops looking like noise and starts looking
 * like the archer. Below it the lines are held nearly still; well above it they are followed outright.
 */
const REAL = 0.03;

/**
 * How quickly the estimate of that speed itself moves.
 *
 * The speed has to be smoothed before it is used, which is the part that is easy to leave out and
 * ruins the whole thing. Reading it fresh each frame makes the damping jump about frame by frame, and
 * a damping that jumps is itself a wobble: the lines were held still one frame and released the next,
 * which reads worse than never damping at all. Measured, that version made the tremble slightly worse
 * rather than twelve times better.
 */
const SPEED_SETTLES = 0.25;

/** Never damp entirely, or a fit that drifted slowly would never be caught up with. */
const LEAST = 0.05;

export class SteadyFace {
	private drawn: [number, number][] | null = null;
	private last: [number, number][] | null = null;
	/** How fast the fit has been moving lately, in pixels a frame, one estimate for the whole face. */
	private speed = 0;

	/** The face to draw this frame, given the face that was fitted to it. */
	show(face: FaceLocation): FaceLocation {
		const drawn = this.drawn;
		const last = this.last;
		this.last = face.anchors.map((point) => [point[0], point[1]] as [number, number]);
		if (!drawn || !last || drawn.length !== face.anchors.length) {
			this.drawn = face.anchors.map((point) => [point[0], point[1]] as [number, number]);
			return face;
		}

		/**
		 * How fast the fit itself is moving, which is not the same as how far it has got from the drawn
		 * lines. Damping by the latter is self defeating: the lag the damping creates is itself read as a
		 * movement worth following, so the filter chases its own tail and smooths almost nothing. What
		 * the fit did between two frames is untouched by any of that.
		 */
		const real = REAL * face.semiMajor;
		let moved = 0;
		for (let i = 0; i < face.anchors.length; i++) {
			moved = Math.max(moved, Math.hypot(face.anchors[i][0] - last[i][0], face.anchors[i][1] - last[i][1]));
		}
		this.speed += (moved - this.speed) * SPEED_SETTLES;

		// Rises from nothing to one as the speed grows past what noise accounts for, so a sweep and a
		// wobble are told apart by size rather than by a threshold that would itself flicker.
		const speed = this.speed;
		const follow = Math.max(LEAST, (speed * speed) / (speed * speed + real * real));

		const next = face.anchors.map(([x, y], i) => {
			return [
				drawn[i][0] + (x - drawn[i][0]) * follow,
				drawn[i][1] + (y - drawn[i][1]) * follow
			] as [number, number];
		});

		this.drawn = next;
		// A smoothed point can in principle describe no projection at all, in which case there is nothing
		// better to draw than the fit itself.
		return faceFromAnchors(next, face.support) ?? face;
	}

	/** Forgets where it was drawing, for when the face was lost and found again somewhere else. */
	reset() {
		this.drawn = null;
		this.last = null;
		this.speed = 0;
	}
}
