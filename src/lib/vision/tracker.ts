import type { Impact } from './types';

/**
 * Turns per frame detections into arrows. A single frame is never trusted: a passing shadow, a
 * camera nudge or a hand in the way all produce a blob once. An arrow, having landed, stays exactly
 * where it is, so agreement across consecutive frames is what separates the two.
 */
export class ImpactTracker {
	/** Candidates still gathering evidence, in normalised face coordinates. */
	private candidates: Impact[] = [];
	/** Impacts already promoted, so the same arrow is not reported twice. */
	private confirmed: Impact[] = [];

	constructor(
		/** Frames a candidate must persist for before it counts. */
		private readonly framesToConfirm = 4,
		/** Two detections closer than this, in face radii, are the same arrow. */
		private readonly mergeDistance = 0.035
	) {}

	get arrows(): Impact[] {
		return this.confirmed;
	}

	get pending(): Impact[] {
		return this.candidates.filter((c) => c.seen > 1);
	}

	/**
	 * Feeds one frame's detections in and returns any newly confirmed arrows. Candidates not seen in
	 * a frame decay rather than vanish, so one dropped detection does not restart the count.
	 */
	push(detections: { x: number; y: number; area: number }[]): Impact[] {
		const matched = new Set<Impact>();

		for (const detection of detections) {
			// An arrow already confirmed keeps producing a blob every frame: ignore those.
			if (this.nearest(this.confirmed, detection)) continue;

			const candidate = this.nearest(this.candidates, detection);
			if (candidate) {
				candidate.seen += 1;
				candidate.area = detection.area;
				// Averaged towards the new reading, which settles the position as evidence accumulates.
				candidate.x += (detection.x - candidate.x) / candidate.seen;
				candidate.y += (detection.y - candidate.y) / candidate.seen;
				matched.add(candidate);
			} else {
				const fresh = { ...detection, seen: 1 };
				this.candidates.push(fresh);
				matched.add(fresh);
			}
		}

		for (const candidate of this.candidates) {
			if (!matched.has(candidate)) candidate.seen -= 1;
		}

		const promoted = this.candidates.filter((c) => c.seen >= this.framesToConfirm);
		this.confirmed.push(...promoted);
		this.candidates = this.candidates.filter((c) => c.seen > 0 && !promoted.includes(c));
		return promoted;
	}

	private nearest(list: Impact[], point: { x: number; y: number }): Impact | undefined {
		let best: Impact | undefined;
		let bestDistance = this.mergeDistance;
		for (const item of list) {
			const distance = Math.hypot(item.x - point.x, item.y - point.y);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = item;
			}
		}
		return best;
	}

	/** Drops an arrow the archer rejected, so it is not immediately re-detected as confirmed. */
	forget(impact: Impact) {
		this.confirmed = this.confirmed.filter((i) => i !== impact);
	}

	clear() {
		this.candidates = [];
		this.confirmed = [];
	}
}
