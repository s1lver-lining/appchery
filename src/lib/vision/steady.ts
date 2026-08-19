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
 * archer sweeps the phone are worse than lines that tremble. So what is smoothed is not the position
 * but how far the position misses a prediction of it. Each point is carried forward by how fast it has
 * been travelling and only the difference from that is damped, which means a steady sweep is followed
 * with no lag at all while the wobble on top of it is averaged away. Damping the position itself
 * instead cost about a ring of lag at a walking pace, which is much more obvious than the tremble it
 * was there to remove.
 *
 * Nothing here touches the fit. Arrow positions, the ring check and everything reported are measured
 * from the face the detector actually found.
 */

/**
 * How much of each frame's reading to believe about where the lines are.
 *
 * Low, because a single frame's fit carries a frame's worth of noise and averaging many of them is
 * the whole point.
 */
const PLACE = 0.25;

/**
 * How much of each frame's reading to believe about which way the lines are travelling.
 *
 * Lower still. A speed read from two noisy positions is far noisier than either of them, and a
 * jittery speed is worse than no speed at all: it is added to every drawn point, so it would put back
 * as movement exactly what the smoothing took out.
 */
const DRIFT = 0.12;

/**
 * The furthest the drawn lines are ever allowed to be from the fit, in face radii.
 *
 * A leash rather than a stronger filter. Smoothing trades tremble against lag along one dial, and
 * anywhere on that dial the worst case is set by the hardest movement in the recording: settings quiet
 * enough to remove the tremble let the lines fall the better part of a ring behind on a fast sweep,
 * which is far more obvious than the tremble was. A limit on the distance leaves the smoothing free to
 * work wherever it is working and only intervenes where it was about to be seen. A tenth of a ring is
 * below what can be told apart on a phone screen.
 */
const LEASH = 0.02;

export class SteadyFace {
	private drawn: [number, number][] | null = null;
	/** How far each point has been travelling per frame, kept so the smoothing can keep up rather than
	 * follow along behind. */
	private drift: [number, number][] | null = null;

	/** The face to draw this frame, given the face that was fitted to it. */
	show(face: FaceLocation): FaceLocation {
		const drawn = this.drawn;
		const drift = this.drift;
		if (!drawn || !drift || drawn.length !== face.anchors.length) {
			this.drawn = face.anchors.map((point) => [point[0], point[1]] as [number, number]);
			this.drift = face.anchors.map(() => [0, 0] as [number, number]);
			return face;
		}

		const next = face.anchors.map(([x, y], i) => {
			// Where the point was expected to be, from where it was and how it was travelling. Smoothing
			// towards the reading from *here* rather than from where the point actually was is what makes
			// the difference: a sweep is a movement the filter has already accounted for, so it costs no
			// lag at all, and only what the sweep does not explain is damped.
			const expectedX = drawn[i][0] + drift[i][0];
			const expectedY = drawn[i][1] + drift[i][1];
			const nextX = expectedX + (x - expectedX) * PLACE;
			const nextY = expectedY + (y - expectedY) * PLACE;
			drift[i][0] += (nextX - drawn[i][0] - drift[i][0]) * DRIFT;
			drift[i][1] += (nextY - drawn[i][1] - drift[i][1]) * DRIFT;
			return [nextX, nextY] as [number, number];
		});

		const leash = LEASH * face.semiMajor;
		for (let i = 0; i < next.length; i++) {
			const [x, y] = face.anchors[i];
			const away = Math.hypot(next[i][0] - x, next[i][1] - y);
			if (away < 1e-6) continue;
			/**
			 * Squashed rather than cut off at the limit. A hard limit is a corner: a point sliding along it
			 * is smoothed one frame and yanked the next, and that yank is itself a wobble, which showed up
			 * as a worse tremble than doing nothing. This leaves everything well inside the leash exactly
			 * where the smoothing put it and only bends what is approaching it.
			 */
			const held = leash * Math.tanh(away / leash);
			const pull = held / away;
			// Pulled in along the line it strayed on, so being caught up with does not also move it sideways.
			next[i][0] = x + (next[i][0] - x) * pull;
			next[i][1] = y + (next[i][1] - y) * pull;
			drift[i][0] = next[i][0] - drawn[i][0];
			drift[i][1] = next[i][1] - drawn[i][1];
		}

		this.drawn = next;
		// A smoothed point can in principle describe no projection at all, in which case there is nothing
		// better to draw than the fit itself.
		return faceFromAnchors(next, face.support) ?? face;
	}

	/** Forgets where it was drawing, for when the face was lost and found again somewhere else. */
	reset() {
		this.drawn = null;
		this.drift = null;
	}
}
