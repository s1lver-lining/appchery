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
		private readonly mergeDistance = 0.035,
		/**
		 * Detections in one frame above which the frame is treated as movement rather than shooting.
		 * Arrows arrive one at a time; a hand across the boss or a phone being gripped harder changes
		 * half the face at once, and on a hand held camera that is most of what there is to reject.
		 */
		private readonly burst = 3,
		/**
		 * Frames a newly confirmed arrow stays on probation, and how many of those it may go unseen for.
		 * A real arrow keeps differing from the background for seconds after it lands, until the running
		 * mean absorbs it. Something conjured by a jolt does not, so it is asked to prove itself.
		 */
		private readonly probation = 45,
		private readonly graceFrames = 12
	) {}

	/** Arrows still wanted. Promotion stops at this, so a misdetection cannot flood the proposals. */
	private limit = Number.POSITIVE_INFINITY;

	setLimit(limit: number) {
		this.limit = Math.max(0, limit);
	}

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
	push(detections: { x: number; y: number; area: number; face: number }[]): Impact[] {
		const matched = new Set<Impact>();

		/**
		 * A frame that lights up everywhere is the camera moving, not an end being shot. Evidence is
		 * rolled back rather than merely ignored, so a jolt cannot leave a candidate part way to being
		 * an arrow and have the next real frame push it over the line.
		 */
		if (detections.length > this.burst) {
			for (const candidate of this.candidates) candidate.seen -= 1;
			this.candidates = this.candidates.filter((c) => c.seen > 0);
			this.age(new Set());
			return [];
		}

		for (const detection of detections) {
			// An arrow already confirmed keeps producing a blob every frame: ignore those.
			const already = this.nearest(this.confirmed, detection);
			if (already) {
				matched.add(already);
				continue;
			}

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

		// Sorted by evidence so the best supported candidate takes the last free slot.
		const promoted = this.candidates
			.filter((c) => c.seen >= this.framesToConfirm)
			.sort((a, b) => b.seen - a.seen)
			.slice(0, Math.max(0, this.limit - this.confirmed.length));
		for (const arrow of promoted) {
			arrow.held = 0;
			arrow.missed = 0;
		}
		this.confirmed.push(...promoted);
		this.candidates = this.candidates.filter((c) => c.seen > 0 && !promoted.includes(c));
		this.age(matched);
		return promoted;
	}

	/**
	 * Ages the confirmed arrows and drops any that stopped showing up while still on probation.
	 *
	 * Without this a confirmed arrow was permanent, because a confirmed position is skipped on every
	 * later frame and so was never asked for evidence again. One bad moment therefore left a score on
	 * screen for the rest of the end, which is what made false positives feel stuck on a phone.
	 */
	private age(matched: Set<Impact>) {
		for (const arrow of this.confirmed) {
			arrow.held = (arrow.held ?? 0) + 1;
			arrow.missed = matched.has(arrow) ? 0 : (arrow.missed ?? 0) + 1;
		}
		this.confirmed = this.confirmed.filter(
			(arrow) => (arrow.held ?? 0) > this.probation || (arrow.missed ?? 0) <= this.graceFrames
		);
	}

	private nearest(list: Impact[], point: { x: number; y: number; face: number }): Impact | undefined {
		let best: Impact | undefined;
		let bestDistance = this.mergeDistance;
		for (const item of list) {
			// Coordinates only mean the same thing within one face, so a match must share it.
			if (item.face !== point.face) continue;
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
