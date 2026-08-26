import { describe, expect, it } from 'vitest';
import { WA_10_RING } from '../rounds/seed';
import { newDrill } from './games';
import {
	acceptsArrows,
	callPool,
	drawCall,
	meetsRing,
	rankArrows,
	ringRank,
	secondsLeft,
	summarise
} from './engine';
import type { Drill, DrillGame, DrillShot } from './types';

/** Arrows as the engine reads them: the ring, and where it landed when that matters. */
function shots(labels: string[], plots: ([number, number] | null)[] = []): DrillShot[] {
	return labels.map((label, i) => ({
		ordinal: (i % 6) + 1,
		value: label === 'M' ? 0 : label === 'X' ? 10 : Number(label),
		zoneLabel: label,
		x: plots[i]?.[0] ?? null,
		y: plots[i]?.[1] ?? null
	}));
}

function drill(game: DrillGame, patch: Partial<Drill['config']> = {}): Drill {
	const made = newDrill(game);
	return { ...made, config: { ...made.config, ...patch } };
}

describe('ringRank', () => {
	it('orders rings from the outside in, so a threshold means "this ring or better"', () => {
		expect(ringRank(WA_10_RING, 'X')).toBeGreaterThan(ringRank(WA_10_RING, '10'));
		expect(ringRank(WA_10_RING, '10')).toBeGreaterThan(ringRank(WA_10_RING, '9'));
		expect(ringRank(WA_10_RING, 'M')).toBe(0);
	});

	it('counts a ring this score set has never heard of as a miss', () => {
		expect(ringRank(WA_10_RING, 'vital')).toBe(0);
		expect(meetsRing(WA_10_RING, 'vital', '9')).toBe(false);
	});

	it('tells the X from the 10 even though they score the same', () => {
		expect(meetsRing(WA_10_RING, '10', 'X')).toBe(false);
		expect(meetsRing(WA_10_RING, 'X', '10')).toBe(true);
	});
});

describe('successZone', () => {
	it('counts an arrow in the threshold ring or better as a success', () => {
		const outcome = summarise(drill('successZone', { thresholdLabel: '9', arrows: 6 }), shots(['9', '8', '10', 'X', 'M', '9']));
		expect(outcome.hits).toBe(4);
		expect(outcome.misses).toBe(2);
		expect(outcome.rate).toBeCloseTo(4 / 6);
	});

	it('keeps the score alongside the rate, because both are worth reading', () => {
		expect(summarise(drill('successZone'), shots(['9', '8'])).score).toBe(17);
	});

	it('is over once the arrows it asked for are in', () => {
		const set = drill('successZone', { arrows: 3, arrowsPerEnd: 3 });
		expect(summarise(set, shots(['9', '9'])).done).toBe(false);
		expect(summarise(set, shots(['9', '9', '9'])).done).toBe(true);
	});
});

describe('lives', () => {
	it('spends a life on every arrow outside the zone', () => {
		const set = drill('lives', { thresholdLabel: '8', lives: 3 });
		expect(summarise(set, shots(['8', '7', '9', 'M'])).livesLeft).toBe(1);
	});

	it('ends when the last life goes, and not before', () => {
		const set = drill('lives', { thresholdLabel: '8', lives: 2 });
		expect(summarise(set, shots(['M', '10'])).done).toBe(false);
		expect(summarise(set, shots(['M', '10', '7'])).done).toBe(true);
	});

	it('is not over before it has begun', () => {
		expect(summarise(drill('lives'), []).done).toBe(false);
	});
});

describe('streak', () => {
	it('keeps the longest unbroken run and the one being held now', () => {
		const outcome = summarise(drill('streak', { thresholdLabel: '9' }), shots(['9', '10', 'X', '7', '9', '9']));
		expect(outcome.bestStreak).toBe(3);
		expect(outcome.currentStreak).toBe(2);
	});

	it('runs until the archer stops it, having asked for no particular number of arrows', () => {
		expect(summarise(drill('streak'), shots(['9', '9', '9'])).done).toBe(false);
	});
});

describe('shrinkingZone', () => {
	const ladder = ['7', '8', '9'];

	it('opens the next ring once a step has been cleared', () => {
		const set = drill('shrinkingZone', { ladder, stepArrows: 2 });
		expect(summarise(set, shots(['7', '7'])).stepLabel).toBe('8');
		expect(summarise(set, shots(['7', '7', '8', '8'])).stepLabel).toBe('9');
	});

	it('wants the run unbroken, so a failure starts the step again', () => {
		const set = drill('shrinkingZone', { ladder, stepArrows: 3 });
		expect(summarise(set, shots(['7', '7', 'M', '7', '7'])).step).toBe(0);
	});

	it('never takes back a ring already won', () => {
		const set = drill('shrinkingZone', { ladder, stepArrows: 1 });
		expect(summarise(set, shots(['7', 'M', 'M'])).step).toBe(1);
	});

	it('is over when the innermost ring of the ladder has been cleared', () => {
		const set = drill('shrinkingZone', { ladder, stepArrows: 1 });
		expect(summarise(set, shots(['7', '8', '9'])).done).toBe(true);
	});
});

describe('calledShot', () => {
	it('wants the ring that was called, not merely a better one', () => {
		const set = drill('calledShot');
		const called: Drill = { ...set, state: { ...set.state, calls: ['7', '8', '9'] } };
		const outcome = summarise(called, shots(['7', '10', '9']));
		expect(outcome.hits).toBe(2);
	});

	it('shows the call standing for the arrow about to be shot', () => {
		const set = drill('calledShot');
		const called: Drill = { ...set, state: { ...set.state, calls: ['7', '8'] } };
		expect(summarise(called, shots(['7'])).called).toBe('8');
	});

	it('counts an arrow with no call behind it as a miss rather than inventing one', () => {
		expect(summarise(drill('calledShot'), shots(['10'])).hits).toBe(0);
	});

	it('draws only from the rings at or inside the threshold, and never an inner ring', () => {
		const pool = callPool(WA_10_RING, '8').map((zone) => zone.label);
		expect(pool).toEqual(['8', '9', '10']);
		expect(pool).not.toContain('X');
	});

	it('always draws something the pool holds', () => {
		const set = drill('calledShot', { thresholdLabel: '8' });
		expect(['8', '9', '10']).toContain(drawCall(WA_10_RING, set.config, () => 0.999999));
		expect(drawCall(WA_10_RING, set.config, () => 0)).toBe('8');
	});
});

describe('targetScore', () => {
	it('is over the moment the goal is reached, and reports the arrows it took', () => {
		const set = drill('targetScore', { goal: 30 });
		expect(summarise(set, shots(['10', '10'])).done).toBe(false);
		const finished = summarise(set, shots(['10', '10', '10']));
		expect(finished.done).toBe(true);
		expect(finished.arrows).toBe(3);
	});
});

describe('beatTheClock', () => {
	const started: Drill = (() => {
		const set = drill('beatTheClock', { seconds: 60 });
		return { ...set, state: { ...set.state, startedAt: 1_000_000 } };
	})();

	it('counts down from when it was started rather than ticking, so a slept phone catches up', () => {
		expect(secondsLeft(started, 1_000_000 + 20_000)).toBe(40);
		expect(secondsLeft(started, 1_000_000 + 90_000)).toBe(0);
	});

	it('has no clock at all until it is started', () => {
		expect(summarise(drill('beatTheClock'), []).secondsLeft).toBeNull();
		expect(summarise(drill('beatTheClock'), []).done).toBe(false);
	});

	it('is over when the clock runs out, whatever is on the sheet', () => {
		expect(summarise(started, shots(['10']), 1_000_000 + 61_000).done).toBe(true);
		expect(summarise(started, shots(['10']), 1_000_000 + 10_000).done).toBe(false);
	});
});

describe('arrowSorting', () => {
	it('measures each shaft against the others rather than against the middle of the target', () => {
		// Every arrow of the set high right, with number 3 sitting further out again: a sight problem
		// for the group, and a shaft problem only for the one that left it.
		const plots: [number, number][] = [
			[0.3, 0.3],
			[0.32, 0.28],
			[0.3, -0.3],
			[0.28, 0.32],
			[0.3, 0.3],
			[0.31, 0.29]
		];
		const ranked = rankArrows(shots(['9', '9', '9', '9', '9', '9'], plots));
		expect(ranked[0].ordinal).toBe(3);
		expect(ranked[0].offset).toBeGreaterThan(0.2);
	});

	it('says nothing about a shaft it has no plots for', () => {
		const ranked = rankArrows(shots(['9', '8']));
		expect(ranked.every((entry) => entry.offset === null)).toBe(true);
		expect(ranked.map((entry) => entry.mean)).toContain(8);
	});

	it('lets the score decide when the plots cannot: two shafts are only ever odd to each other', () => {
		// Each one's offset from the other is the same distance, so position says nothing here.
		const ranked = rankArrows(shots(['10', '5'], [[0.4, 0.4], [0, 0]]));
		expect(ranked.map((entry) => entry.ordinal)).toEqual([2, 1]);
	});
});

describe('blindBale', () => {
	it('counts the arrows it was told about, having no arrows of its own', () => {
		const set = drill('blindBale');
		const counted: Drill = { ...set, state: { ...set.state, blindArrows: 24 } };
		expect(summarise(counted, []).arrows).toBe(24);
	});

	it('never ends on its own: an archer shooting to feel stops when they have felt it', () => {
		const set = drill('blindBale');
		const counted: Drill = { ...set, state: { ...set.state, blindArrows: 500 } };
		expect(summarise(counted, []).done).toBe(false);
	});
});

describe('stopping by hand', () => {
	it('ends any drill, including the ones with no natural end', () => {
		const set = drill('streak');
		const stopped: Drill = { ...set, state: { ...set.state, endedAt: 1 } };
		expect(summarise(stopped, shots(['9'])).done).toBe(true);
		expect(acceptsArrows(stopped, shots(['9']))).toBe(false);
	});
});

describe('remaining', () => {
	it('counts arrows down only for the drills that asked for a number of them', () => {
		expect(summarise(drill('successZone', { arrows: 12 }), shots(['9', '9'])).remaining).toBe(10);
		expect(summarise(drill('streak'), shots(['9'])).remaining).toBeNull();
	});
});
