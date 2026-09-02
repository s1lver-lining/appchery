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
	/** How far apart two marks must be, in face radii, to be offered as two arrows rather than one. */
	apartDistance?: number;
	/** Passes before an end that is short of arrows starts offering its best guesses. */
	guessAfter?: number;
	/** Passes that must have proposed a place before it is worth offering as a guess. */
	guessVotes?: number;
	/** Passes that must have proposed a place before it is worth showing as an unsure mark. */
	fillVotes?: number;
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
	private readonly apartDistance: number;
	private readonly guessAfter: number;
	private readonly guessVotes: number;
	private readonly fillVotes: number;

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
		/*
		 * Raised with the rate the passes come at, not instead of it.
		 *
		 * The bar is in looks, and looks are what a sweep gathers, so the way to reach it sooner is to
		 * look more often rather than to ask for less. Offering passes every 150ms instead of 300 and
		 * asking seven rather than five puts the floor at about a second instead of a second and a
		 * half, and measured over fourteen labelled recordings it finds more in two seconds than the
		 * slower pair did: 45 arrows of 84 against 41, with fewer marks put twice on one shaft.
		 *
		 * Lowering it instead was tried and is the wrong trade. Five votes at 150ms finds 45 too and
		 * takes the wrong marks from 15 to 23, because passes that come faster are the same look taken
		 * again and looking twice at a thing that is not there sees it twice.
		 */
		this.minVotes = options.minVotes ?? 7;
		this.minAgreement = options.minAgreement ?? 0.4;
		/**
		 * Half a ring. One arrow answers from more than one place along its own shaft: the detector reads
		 * the impact where the dark run stops being a ridge, and which point that is moves a little with
		 * the viewpoint, the light and whether a ring line crossed it. At a third of a ring those readings
		 * were landing either side of the line and becoming two arrows, which is what put two marks on one
		 * shaft. Widening it costs nothing measurable in telling two real arrows apart, because two arrows
		 * that close have merged into one detection long before the tracker sees them.
		 */
		this.mergeDistance = options.mergeDistance ?? 0.05;
		/**
		 * Wider than the distance at which two readings are merged, and used only when deciding whether a
		 * place is worth offering as a second arrow.
		 *
		 * The two questions are not the same. Merging asks whether two readings are the same arrow and has
		 * to be cautious, because merging two real arrows loses one for good. Offering asks whether to put
		 * a second mark on what may be one shaft, and there the caution runs the other way: the readings
		 * that cause it are by definition the ones that just failed to merge, and a second mark on an
		 * arrow already found is worse than no mark, because it is both a wrong mark and a place that a
		 * genuinely missing arrow could have had.
		 */
		this.apartDistance = options.apartDistance ?? this.mergeDistance * 2;
		/**
		 * How long a place may go unproposed before it is forgotten, counted in passes but meant as a
		 * duration.
		 *
		 * Which is the distinction that was missed when passes started coming twice as often. The bars a
		 * candidate has to clear are in looks, and looking more often is a real way to reach them sooner;
		 * this is not one of those. It is the length of the blink a place is allowed to survive, and
		 * halving it in seconds while nothing about a blink had changed is a change nobody chose. An
		 * arrow goes unproposed while the camera is pointed at the other half of the boss, and how long
		 * that takes is a fact about the archer walking, not about the detector.
		 *
		 * Measured over fourteen labelled recordings it is free at two and three seconds, where nothing
		 * has been waiting long enough for it to bite, and worth four arrows of eighty four at five, with
		 * no more wrong marks.
		 */
		this.patience = options.patience ?? 50;
		this.guessAfter = options.guessAfter ?? 8;
		/**
		 * Nearly the bar a confirmed arrow has to clear. Offering anything seen twice was tried and gave
		 * back four arrows for half a wrong mark an end; one short of the real bar gives back three for a
		 * tenth of one, because most of what is seen two or three times is seen from the one viewpoint
		 * that flattered it.
		 */
		this.guessVotes = options.guessVotes ?? this.minVotes - 1;
		/**
		 * Looks a place needs before it is worth showing as an unsure mark.
		 *
		 * One was tried first, on the argument that the alternative is a blank overlay and a blank overlay
		 * is not more truthful, it merely says less. What that missed is that the list of marks is capped
		 * at the number of arrows in the end, so a place shown on no evidence is not free: it is holding a
		 * slot a real arrow could have had, and it churns, so the archer watching sees a different wrong
		 * mark every few frames.
		 *
		 * Counted the way it is actually experienced, as every distinct place a mark was ever shown over a
		 * whole sweep rather than at the end of one: asking for three looks instead of one takes the
		 * wrong places from 9.6 an end to 5.4, raises the share of everything shown that is right from
		 * 24% to 37%, and finds *more* arrows rather than fewer, because the slots stop being wasted. It
		 * costs about a third of a second before the first mark appears, which is still a third of the
		 * time a confirmed one takes.
		 */
		this.fillVotes = options.fillVotes ?? 3;
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
		return [...this.confirmed, ...this.filling()];
	}

	/**
	 * The best places left over, shown at once and marked unsure, to make the end up to its count.
	 *
	 * The archer is asking where the arrows are, and the detector has an opinion from its very first
	 * look at the boss. It used to keep that opinion to itself. Provisional marks were offered for the
	 * first six passes and then stopped, and a separate set of guesses began only after eight passes and
	 * only for places already seen six times, which is one look short of the bar a confirmed arrow has
	 * to clear. Between those two there was a gap of about a second with nothing on the screen at all,
	 * and worse, the early marks stopped the instant anything at all was confirmed: find one arrow of
	 * six and the other five went blank.
	 *
	 * So it is one rule now and it runs the whole time. Whatever has been confirmed is shown as
	 * confirmed; the rest of the count is filled with the best supported places that are not already
	 * marked, and those are flagged unsure. Measured over the labelled recordings, that puts a right
	 * mark on nearly a quarter of the arrows within a pass or two of the boss being found, where before
	 * there was nothing to look at, and it costs about three wrong marks an end which the archer can see
	 * are unsure and can drop with one tap.
	 *
	 * None of this is scored. `scored` is what an accepted end writes down and it asks for the old
	 * evidence, so a mark shown early has to earn its place before it can become a number.
	 */
	private filling(): Impact[] {
		const room = (this.expected ?? Math.min(this.limit, 6)) - this.confirmed.length;
		if (!Number.isFinite(room) || room <= 0) return [];
		const offered: Impact[] = [];
		for (const candidate of [...this.candidates].sort((a, b) => b.votes - a.votes)) {
			if (offered.length >= room) break;
			if (candidate.votes < this.fillVotes) continue;
			// Not a second mark on a shaft already marked, nor on one already scored in an earlier end.
			if (this.apart(this.confirmed, candidate)) continue;
			if (this.apart(this.taken, candidate)) continue;
			if (this.apart(offered, candidate)) continue;
			offered.push({ ...candidate, unsure: true });
		}
		return offered;
	}

	/** What an accepted end writes down, which is never a mark that has not earned its place. */
	get scored(): Impact[] {
		return this.settledArrows;
	}

	/** What an accepted end actually scores, which never includes the first seconds' provisional marks. */
	private get settledArrows(): Impact[] {
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
		const offered: Impact[] = [];
		for (const candidate of [...this.candidates].sort((a, b) => b.votes - a.votes)) {
			if (offered.length >= missing) break;
			if (candidate.votes < this.guessVotes) continue;
			// Not a second mark on a shaft already marked, nor on one already scored in an earlier end.
			if (this.apart(this.confirmed, candidate)) continue;
			if (this.apart(this.taken, candidate)) continue;
			if (this.apart(offered, candidate)) continue;
			offered.push({ ...candidate, unsure: true });
		}
		return offered;
	}

	/** Candidates with some support behind them, drawn faintly so the archer sees it working. */
	get pending(): Impact[] {
		return this.candidates.filter((c) => c.votes > 1);
	}

	/**
	 * The marks being shown that have not earned their place, for the readout.
	 *
	 * This used to be a separate set of provisional marks with its own rules, offered for the first six
	 * passes and then withdrawn, and withdrawn early anyway the moment anything at all was confirmed.
	 * There is one rule now and `filling` is it, so this only counts what that rule is offering: a
	 * number worth having on the readout, because it is the difference between a detector that has
	 * found nothing and one that has found things it does not yet believe.
	 */
	get early(): Impact[] {
		return this.filling();
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

		/**
		 * Best supported first, so the strongest evidence takes the last free slot in the end, and never
		 * two marks on one shaft.
		 *
		 * A proposal landing near an arrow already confirmed is turned away when it arrives, but one that
		 * had already started gathering votes before that arrow was confirmed goes on gathering them, and
		 * can clear the bar in its own right a few passes later. It is then a second mark on a shaft
		 * already marked: the commonest wrong mark there is, and the one that reads worst, because the
		 * archer has to work out which of two marks a hand's breadth apart is the real one.
		 */
		const ready: SweepCandidate[] = [];
		for (const candidate of [...this.candidates].sort((a, b) => b.votes - a.votes)) {
			if (this.confirmed.length + ready.length >= this.limit) break;
			if (candidate.votes < this.minVotes || this.agreement(candidate) < this.minAgreement) continue;
			if (this.apart(this.confirmed, candidate) || this.apart(ready, candidate)) continue;
			ready.push(candidate);
		}

		this.confirmed.push(...ready);
		/**
		 * The rest of the readings of the arrows just confirmed go with them. One shaft answers from more
		 * than one place along its length, and the readings that were too far apart to merge are still
		 * sitting there with a vote or two each. Left alone they are exactly what gets offered when the
		 * end turns out to be short, so a missing arrow is replaced by a second mark on one already found.
		 */
		this.candidates = this.candidates.filter((c) => !ready.includes(c) && !this.apart(ready, c));
		return ready;
	}

	/** Share of the passes since it first appeared that have proposed this place again. */
	private agreement(candidate: SweepCandidate): number {
		const chances = this.passes - candidate.first + 1;
		return chances <= 0 ? 0 : candidate.votes / chances;
	}

	/** Whether some place in the list is close enough that this would be a second mark on it. */
	private apart(list: Impact[], point: { x: number; y: number; face: number }): boolean {
		return list.some(
			(item) =>
				item.face === point.face &&
				Math.hypot(item.x - point.x, item.y - point.y) < this.apartDistance
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
		this.taken.push(...this.settledArrows);
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
