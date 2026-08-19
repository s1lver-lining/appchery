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
	/** Passes before an end that is short of arrows starts offering its best guesses. */
	guessAfter?: number;
	/** Passes that must have proposed a place before it is worth offering as a guess. */
	guessVotes?: number;
}

export class SweepTracker {
	private candidates: SweepCandidate[] = [];
	private confirmed: SweepCandidate[] = [];
	/**
	 * Arrows the archer has already taken off the sheet. They are still standing in the boss and will
	 * go on being detected for the rest of the session, so their places are remembered and anything
	 * proposed there is ignored rather than offered again as a fresh arrow.
	 */
	private taken: Impact[] = [];
	private passes = 0;
	private limit = Number.POSITIVE_INFINITY;
	/**
	 * How many arrows the end is known to hold, as opposed to how many will be accepted at most.
	 *
	 * Not the same thing, and conflating them was a bug worth the telling. The scanner carries a safety
	 * cap so that a misdetecting frame cannot flood the sheet, and that cap is a number; asked whether
	 * the end was short of arrows, a tracker that only knew the cap answered yes on every sweep and
	 * filled the difference with guesses. An end is only short of arrows when somebody has actually
	 * said how many there are.
	 */
	private expected: number | null = null;

	private readonly minVotes: number;
	private readonly minAgreement: number;
	private readonly mergeDistance: number;
	private readonly patience: number;
	private readonly guessAfter: number;
	private readonly guessVotes: number;

	constructor(options: SweepOptions = {}) {
		/**
		 * Chosen against 84 impacts placed by hand across fourteen recordings. Asking for more agreement
		 * than this throws away arrows the detector did propose; asking for less lets noise take the
		 * end's last free slot, which costs a real arrow rather than merely adding a wrong one.
		 *
		 * More is asked than used to be, and most of it now costs nothing. While the face's idea of which
		 * way round it was drifted through a sweep, a real arrow's votes were spread over an arc of places
		 * rather than piling up on one, so a real arrow could barely clear a low bar and raising it threw
		 * out arrows rather than noise. With the frame held still the votes land together, and the bar can
		 * be set where it mostly stops the things that do not agree with themselves.
		 *
		 * Set where it is because a wrong mark and a missing one are not equally bad in practice. A wrong
		 * one has to be noticed and dropped, and one that is noticed late is a wrong score; a missing one
		 * is placed by hand, which is what the archer would have done for all six anyway. The cost of this
		 * setting is that nothing is confirmed for about a second and a half, which is what waiting for
		 * five genuinely different views of the boss takes.
		 */
		this.minVotes = options.minVotes ?? 5;
		this.minAgreement = options.minAgreement ?? 0.4;
		this.mergeDistance = options.mergeDistance ?? 0.035;
		this.patience = options.patience ?? 25;
		this.guessAfter = options.guessAfter ?? 8;
		/**
		 * Nearly the bar a confirmed arrow has to clear. Offering anything seen twice was tried and gave
		 * back four arrows for half a wrong mark an end; one short of the real bar gives back three for a
		 * tenth of one, because most of what is seen two or three times is seen from the one viewpoint
		 * that flattered it.
		 */
		this.guessVotes = options.guessVotes ?? this.minVotes - 1;
	}

	setLimit(limit: number) {
		this.limit = Math.max(0, limit);
	}

	/** Says how many arrows the end really holds, or that nobody knows. */
	expect(count: number | null) {
		this.expected = count === null ? null : Math.max(0, count);
	}

	/**
	 * What the archer is shown: the arrows that cleared the bar, and, when the end is known to hold more
	 * than that, the best places left over to make up the number.
	 *
	 * A guess is worth offering because of what it replaces. Nothing is not free: an arrow the detector
	 * missed is one the archer places by hand, so the choice is between a mark that may be wrong and no
	 * mark at all, and a wrong mark costs one tap to drop. Without a count to work to there is no such
	 * thing as a missing arrow, so this only ever offers guesses when it has been told how many to find.
	 */
	get arrows(): Impact[] {
		return [...this.confirmed, ...this.guesses()];
	}

	/**
	 * The best places left, once there has been time to look and the end is known to be short.
	 *
	 * Ordered by support, so what is offered is the strongest evidence that fell short rather than
	 * whatever happened to be lying about, and it has to have nearly the support a confirmed arrow
	 * needs. A place seen once or twice is what one flattering viewpoint gives, and the whole design
	 * rests on not believing that.
	 */
	private guesses(): Impact[] {
		const missing = (this.expected ?? 0) - this.confirmed.length;
		if (this.expected === null || missing <= 0 || this.passes < this.guessAfter) return [];
		return this.candidates
			.filter((c) => c.votes >= this.guessVotes)
			.sort((a, b) => b.votes - a.votes)
			.slice(0, missing)
			.map((c) => ({ ...c, unsure: true }));
	}

	/** Candidates with some support behind them, drawn faintly so the archer sees it working. */
	get pending(): Impact[] {
		return this.candidates.filter((c) => c.votes > 1);
	}

	/** Feeds one pass of proposals and returns whatever that pass was enough to confirm. */
	push(proposals: { x: number; y: number; area: number; face: number }[]): Impact[] {
		this.passes += 1;

		for (const proposal of proposals) {
			// Already scored: not a new arrow, and not evidence about anything either.
			if (this.nearest(this.taken, proposal)) continue;

			// Already offered and kept: not a new arrow.
			if (this.nearest(this.confirmed, proposal)) continue;

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
		this.confirmed = this.confirmed.filter((i) => i.x !== impact.x || i.y !== impact.y);
		this.candidates = this.candidates.filter((c) => c.x !== impact.x || c.y !== impact.y);
		this.taken.push(impact);
	}

	/**
	 * Called once the archer has taken the end. The arrows stay in the boss, so they are remembered as
	 * scored rather than forgotten, which is what stops the next end proposing them all over again.
	 */
	accept() {
		this.taken.push(...this.arrows);
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
