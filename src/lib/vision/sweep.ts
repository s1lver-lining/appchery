import type { Impact } from './types';

/**
 * Turns what the detector proposes on many frames into the arrows that are really in the boss.
 *
 * The archer walks up to the target and sweeps the camera over it, so the same arrows are seen from
 * a few dozen viewpoints in a couple of seconds. That is the signal this leans on. A shaft is a real
 * object standing in the paper: it looks like an arrow from every angle, and because the face gives a
 * rectified frame, it reports the *same face coordinate* from every angle. An old hole, a pencil mark
 * or a crease can look like a shaft from one particular viewpoint, but it does not keep agreeing with
 * itself as the camera moves, and a shadow moves when the camera does.
 *
 * So evidence is gathered per place on the face rather than per frame, and what promotes a candidate
 * is agreement across viewpoints, not persistence across consecutive frames. That distinction is the
 * whole point: consecutive frames of a carried camera are nearly the same picture, so agreeing with
 * the previous frame proves very little, while agreeing with a frame taken from two steps to the left
 * proves a great deal.
 */
export interface SweepCandidate extends Impact {
	/** Passes this place has been proposed in. */
	votes: number;
	/** The pass it was first proposed in, which is what its agreement is measured against. */
	first: number;
	/** The most recent pass that proposed it, so one that stops being seen can be dropped. */
	last: number;
}

export interface SweepOptions {
	/** Passes a candidate must be proposed in before it can count at all. */
	minVotes?: number;
	/** Share of the passes since it appeared that must have proposed it. */
	minAgreement?: number;
	/** Two proposals closer than this, in face radii, are the same arrow. */
	mergeDistance?: number;
	/** Passes a candidate may go unproposed before it is forgotten. */
	patience?: number;
}

export class SweepTracker {
	private candidates: SweepCandidate[] = [];
	private confirmed: Impact[] = [];
	/**
	 * Arrows the archer has already taken off the sheet. They are still standing in the boss and will
	 * go on being detected for the rest of the session, so their places are remembered and anything
	 * proposed there is ignored rather than offered again as a fresh arrow.
	 */
	private taken: Impact[] = [];
	private passes = 0;
	private limit = Number.POSITIVE_INFINITY;

	private readonly minVotes: number;
	private readonly minAgreement: number;
	private readonly mergeDistance: number;
	private readonly patience: number;

	constructor(options: SweepOptions = {}) {
		/**
		 * Chosen against 84 impacts placed by hand across fourteen recordings. Asking for more agreement
		 * than this throws away arrows the detector did propose; asking for less lets noise take the
		 * end's last free slot, which costs a real arrow rather than merely adding a wrong one.
		 *
		 * More is asked than used to be, and it now costs nothing. While the face's idea of which way
		 * round it was drifted through a sweep, a real arrow's votes were spread over an arc of places
		 * rather than piling up on one, so a real arrow could barely clear a low bar and raising it threw
		 * out arrows rather than noise. With the frame held still the votes land together, and the bar
		 * can be set where it only stops the things that do not agree with themselves.
		 */
		this.minVotes = options.minVotes ?? 4;
		this.minAgreement = options.minAgreement ?? 0.3;
		this.mergeDistance = options.mergeDistance ?? 0.035;
		this.patience = options.patience ?? 25;
	}

	setLimit(limit: number) {
		this.limit = Math.max(0, limit);
	}

	get arrows(): Impact[] {
		return this.confirmed;
	}

	/** Candidates with some support behind them, drawn faintly so the archer sees it working. */
	get pending(): Impact[] {
		return this.candidates.filter((c) => c.votes > 1);
	}

	/** Feeds one pass of proposals and returns whatever that pass was enough to confirm. */
	push(proposals: { x: number; y: number; area: number; face: number }[]): Impact[] {
		this.passes += 1;

		for (const proposal of proposals) {
			// Already scored, or already offered and kept: either way not a new arrow.
			if (this.nearest(this.taken, proposal) || this.nearest(this.confirmed, proposal)) continue;

			const candidate = this.nearest(this.candidates, proposal) as SweepCandidate | undefined;
			if (candidate) {
				candidate.votes += 1;
				candidate.last = this.passes;
				candidate.area = proposal.area;
				// Averaged towards each new reading, so the estimate settles rather than trusting the last.
				candidate.x += (proposal.x - candidate.x) / candidate.votes;
				candidate.y += (proposal.y - candidate.y) / candidate.votes;
			} else {
				this.candidates.push({
					...proposal,
					seen: 1,
					votes: 1,
					first: this.passes,
					last: this.passes
				});
			}
		}

		// A place nothing has proposed for a long while was a trick of one viewpoint, not an arrow.
		this.candidates = this.candidates.filter((c) => this.passes - c.last <= this.patience);

		const ready = this.candidates
			.filter((c) => c.votes >= this.minVotes && this.agreement(c) >= this.minAgreement)
			// Best supported first, so the strongest evidence takes the last free slot in the end.
			.sort((a, b) => b.votes - a.votes)
			.slice(0, Math.max(0, this.limit - this.confirmed.length));

		this.confirmed.push(...ready);
		this.candidates = this.candidates.filter((c) => !ready.includes(c));
		return ready;
	}

	/** Share of the passes since it first appeared that have proposed this place again. */
	private agreement(candidate: SweepCandidate): number {
		const chances = this.passes - candidate.first + 1;
		return chances <= 0 ? 0 : candidate.votes / chances;
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

	/** Drops one the archer rejected, so it is not offered again. */
	forget(impact: Impact) {
		this.confirmed = this.confirmed.filter((i) => i !== impact);
		this.taken.push(impact);
	}

	/**
	 * Called once the archer has taken the end. The arrows stay in the boss, so they are remembered as
	 * scored rather than forgotten, which is what stops the next end proposing them all over again.
	 */
	accept() {
		this.taken.push(...this.confirmed);
		this.confirmed = [];
		this.candidates = [];
	}

	clear() {
		this.candidates = [];
		this.confirmed = [];
		this.taken = [];
		this.passes = 0;
	}
}
