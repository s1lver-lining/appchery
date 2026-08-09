import { describe, it, expect } from 'vitest';
import { summariseByRound, compareScores, overview, inRange, type ScoredActivity } from './stats';
import { getRound } from './rounds/seed';

const round = getRound('wa720-70m')!;

function activity(partial: Partial<ScoredActivity> & { id: string }): ScoredActivity {
	return {
		sessionId: 's',
		startedAt: 1,
		totalScore: 600,
		arrowsShot: 72,
		count10s: 20,
		countX: 5,
		roundDefinitionId: round.id,
		round,
		...partial
	};
}

describe('summariseByRound', () => {
	it('ignores activities that were never finished', () => {
		// An abandoned round scores lower for reasons that say nothing about how it was shot.
		const summaries = summariseByRound([
			activity({ id: 'a', totalScore: 600 }),
			activity({ id: 'b', totalScore: 120, arrowsShot: 12 })
		]);
		expect(summaries[0].history).toHaveLength(1);
		expect(summaries[0].best.totalScore).toBe(600);
	});

	it('groups by round so different rounds never compete for one best', () => {
		const other = getRound('wa-indoor-18m')!;
		const summaries = summariseByRound([
			activity({ id: 'a', totalScore: 600 }),
			activity({ id: 'b', totalScore: 540, roundDefinitionId: other.id, round: other })
		]);
		expect(summaries).toHaveLength(2);
	});

	it('groups custom rounds by shape, so the same round shot twice compares with itself', () => {
		const custom = { ...round, id: 'x', isBuiltin: false, name: 'Mine' };
		const summaries = summariseByRound([
			activity({ id: 'a', roundDefinitionId: null, round: custom, totalScore: 500 }),
			activity({
				id: 'b',
				roundDefinitionId: null,
				round: { ...custom, id: 'y' },
				totalScore: 520
			})
		]);
		expect(summaries).toHaveLength(1);
		expect(summaries[0].best.totalScore).toBe(520);
	});

	it('withholds a trend until there are enough rounds for one to mean anything', () => {
		const few = summariseByRound(
			[1, 2, 3].map((i) => activity({ id: `a${i}`, startedAt: i, totalScore: 500 + i }))
		);
		expect(few[0].trend).toBeNull();

		const many = summariseByRound(
			[1, 2, 3, 4, 5, 6].map((i) => activity({ id: `b${i}`, startedAt: i, totalScore: 500 + i * 10 }))
		);
		expect(many[0].trend).not.toBeNull();
		expect(many[0].trend!).toBeGreaterThan(0);
	});

	it('orders history oldest first so the trend line reads left to right', () => {
		const summaries = summariseByRound([
			activity({ id: 'a', startedAt: 300 }),
			activity({ id: 'b', startedAt: 100 }),
			activity({ id: 'c', startedAt: 200 })
		]);
		expect(summaries[0].history.map((a) => a.startedAt)).toEqual([100, 200, 300]);
	});
});

describe('overview', () => {
	it('counts every arrow shot, including those of an unfinished round', () => {
		const result = overview([
			activity({ id: 'a' }),
			activity({ id: 'b', arrowsShot: 12, totalScore: 100 })
		]);
		expect(result.arrows).toBe(84);
		expect(result.rounds).toBe(2);
		expect(result.completeRounds).toBe(1);
	});

	it('returns a contiguous run of months so quiet spells stay visible', () => {
		const result = overview([activity({ id: 'a', startedAt: Date.now() })], 6);
		expect(result.byMonth).toHaveLength(6);
		expect(result.byMonth[5].arrows).toBe(72);
		expect(result.byMonth[0].arrows).toBe(0);
	});

	it('is empty rather than dividing by zero when nothing was shot', () => {
		expect(overview([]).averagePerArrow).toBe(0);
		expect(overview([]).arrows).toBe(0);
	});
});

describe('inRange', () => {
	const now = new Date('2026-08-09T12:00').getTime();
	const ago = (days: number) => now - days * 86_400_000;

	it('keeps everything on the all time range', () => {
		expect(inRange([activity({ id: 'a', startedAt: ago(900) })], 'all', now)).toHaveLength(1);
	});

	it('windows on the last year and the last month, rolling from today', () => {
		const list = [
			activity({ id: 'a', startedAt: ago(10) }),
			activity({ id: 'b', startedAt: ago(100) }),
			activity({ id: 'c', startedAt: ago(400) })
		];
		expect(inRange(list, 'year', now).map((a) => a.id)).toEqual(['a', 'b']);
		expect(inRange(list, 'month', now).map((a) => a.id)).toEqual(['a']);
	});
});

describe('compareScores', () => {
	it('breaks a tied score on tens, then on Xs', () => {
		const base = activity({ id: 'a' });
		expect(compareScores(base, activity({ id: 'b', count10s: 19 }))).toBeGreaterThan(0);
		expect(compareScores(base, activity({ id: 'c', countX: 6 }))).toBeLessThan(0);
	});
});
