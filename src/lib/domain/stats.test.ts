import { describe, it, expect } from 'vitest';
import {
	summariseByRound,
	isPersonalBest,
	scoreByEndPosition,
	scoreByArrowNumber,
	compareScores,
	overview,
	inRange,
	dailyVolume,
	consistency,
	progression,
	distribution,
	windBand,
	bandBy,
	roundKey,
	volumeSeries,
	pickGrain,
	type ScoredActivity
} from './stats';
import { getRound } from './rounds/seed';
import { buildCustomRound } from './rounds/custom';

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

describe('scoreByArrowNumber', () => {
	const shot = (ordinal: number, value: number) => ({ ordinal, value });

	it('averages every arrow called in the same position', () => {
		const series = scoreByArrowNumber([
			shot(1, 10),
			shot(2, 8),
			shot(3, 6),
			shot(1, 8),
			shot(2, 8),
			shot(3, 4)
		]);
		expect(series).toEqual([
			{ ordinal: 1, mean: 9, arrows: 2 },
			{ ordinal: 2, mean: 8, arrows: 2 },
			{ ordinal: 3, mean: 5, arrows: 2 }
		]);
	});

	it('reads a half shot end without inventing the arrows it is missing', () => {
		expect(scoreByArrowNumber([shot(1, 9), shot(2, 7), shot(1, 7)])).toEqual([
			{ ordinal: 1, mean: 8, arrows: 2 },
			{ ordinal: 2, mean: 7, arrows: 1 }
		]);
	});

	it('has nothing to say about an end nobody has shot', () => {
		expect(scoreByArrowNumber([])).toEqual([]);
	});
});

describe('scoreByEndPosition', () => {
	const end = (activityId: string, stageIndex: number, endNo: number, subtotal: number) => ({
		activityId,
		stageIndex,
		endNo,
		subtotal,
		arrows: 6
	});

	it('averages each position per arrow across every round shot', () => {
		const series = scoreByEndPosition([
			end('a', 0, 1, 54),
			end('a', 0, 2, 48),
			end('b', 0, 1, 48),
			end('b', 0, 2, 42)
		]);
		expect(series).toEqual([
			{ position: 1, perArrow: 8.5, ends: 2 },
			{ position: 2, perArrow: 7.5, ends: 2 }
		]);
	});

	it('counts straight through the stages, since a drop off does not stop at a stage line', () => {
		const series = scoreByEndPosition([end('a', 1, 1, 30), end('a', 0, 1, 60), end('a', 0, 2, 48)]);
		expect(series.map((point) => point.perArrow)).toEqual([10, 8, 5]);
	});

	it('ignores an end nothing was entered in, which would read as a zero score', () => {
		const series = scoreByEndPosition([end('a', 0, 1, 54), { ...end('a', 0, 2, 0), arrows: 0 }]);
		expect(series).toHaveLength(1);
	});
});

describe('isPersonalBest', () => {
	const history = [
		activity({ id: 'a', startedAt: 1, totalScore: 600 }),
		activity({ id: 'b', startedAt: 2, totalScore: 640 })
	];

	it('holds a round above every earlier one of its kind', () => {
		const best = activity({ id: 'c', startedAt: 3, totalScore: 650 });
		expect(isPersonalBest(best, [...history, best])).toBe(true);
	});

	it('rejects a round that only beats the most recent one', () => {
		const middling = activity({ id: 'c', startedAt: 3, totalScore: 620 });
		expect(isPersonalBest(middling, [...history, middling])).toBe(false);
	});

	it('rejects the first round of its kind, which improved on nothing', () => {
		const first = activity({ id: 'a', totalScore: 700 });
		expect(isPersonalBest(first, [first])).toBe(false);
	});

	it('ignores rounds of another kind and rounds shot after it', () => {
		const other = getRound('wa-indoor-18m')!;
		const best = activity({ id: 'c', startedAt: 3, totalScore: 610 });
		const later = activity({ id: 'd', startedAt: 9, totalScore: 700 });
		const elsewhere = activity({
			id: 'e',
			totalScore: 900,
			arrowsShot: 60,
			roundDefinitionId: other.id,
			round: other
		});
		expect(isPersonalBest(best, [...history, best, later, elsewhere])).toBe(false);
		expect(
			isPersonalBest(activity({ id: 'c', startedAt: 3, totalScore: 660 }), [
				...history,
				later,
				elsewhere
			])
		).toBe(true);
	});

	it('compares a custom round against others of the same shape', () => {
		// A round built by hand has no id, so 6x6 at 18m is measured against every other 6x6 at 18m.
		const shape = buildCustomRound({
			ends: 6,
			arrowsPerEnd: 6,
			faceSize: 40,
			distance: 18,
			unit: 'm',
			name: ''
		});
		const custom = (id: string, startedAt: number, totalScore: number) =>
			activity({
				id,
				startedAt,
				totalScore,
				arrowsShot: 36,
				roundDefinitionId: null,
				round: shape
			});
		const earlier = custom('a', 1, 300);
		const best = custom('b', 2, 320);
		expect(isPersonalBest(best, [earlier, best])).toBe(true);
		expect(isPersonalBest(custom('c', 3, 310), [earlier, best])).toBe(false);
	});

	it('rejects an unfinished round, whatever it scored', () => {
		const half = activity({
			id: 'c',
			startedAt: 3,
			totalScore: 700,
			arrowsShot: 36
		});
		expect(isPersonalBest(half, [...history, half])).toBe(false);
	});
});

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
			activity({
				id: 'b',
				totalScore: 540,
				roundDefinitionId: other.id,
				round: other
			})
		]);
		expect(summaries).toHaveLength(2);
	});

	it('groups custom rounds by shape, so the same round shot twice compares with itself', () => {
		const custom = { ...round, id: 'x', isBuiltin: false, name: 'Mine' };
		const summaries = summariseByRound([
			activity({
				id: 'a',
				roundDefinitionId: null,
				round: custom,
				totalScore: 500
			}),
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
			[1, 2, 3, 4, 5, 6].map((i) =>
				activity({ id: `b${i}`, startedAt: i, totalScore: 500 + i * 10 })
			)
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

describe('dailyVolume', () => {
	const now = new Date('2026-08-09T12:00').getTime();
	const ago = (days: number) => now - days * 86_400_000;

	it('returns one contiguous bar per day, oldest first', () => {
		const series = dailyVolume([activity({ id: 'a', startedAt: ago(2) })], 7, now);
		expect(series).toHaveLength(7);
		expect(series[4].arrows).toBe(72);
		expect(series[6].arrows).toBe(0);
		expect(series[6].at).toBeGreaterThan(series[0].at);
	});

	it('adds up several rounds shot on the same day', () => {
		const series = dailyVolume(
			[
				activity({ id: 'a', startedAt: ago(1), arrowsShot: 36 }),
				activity({ id: 'b', startedAt: ago(1) - 3600_000, arrowsShot: 36 })
			],
			5,
			now
		);
		expect(series[3].arrows).toBe(72);
	});
});

describe('consistency', () => {
	it('says nothing until there are enough rounds to spread', () => {
		expect(consistency([activity({ id: 'a' }), activity({ id: 'b' })])).toBeNull();
	});

	it('is zero for a shooter who repeats the same score', () => {
		const history = ['a', 'b', 'c'].map((id) => activity({ id }));
		expect(consistency(history)).toBeCloseTo(0);
	});

	it('grows with the spread of the score per arrow', () => {
		const steady = ['a', 'b', 'c'].map((id) => activity({ id, totalScore: 600 }));
		const erratic = [
			activity({ id: 'a', totalScore: 500 }),
			activity({ id: 'b', totalScore: 600 }),
			activity({ id: 'c', totalScore: 700 })
		];
		expect(consistency(erratic)).toBeGreaterThan(consistency(steady)!);
	});
});

describe('progression', () => {
	it('marks a score only when it beats every one before it', () => {
		const points = progression([
			activity({ id: 'a', startedAt: 1, totalScore: 500 }),
			activity({ id: 'b', startedAt: 2, totalScore: 480 }),
			activity({ id: 'c', startedAt: 3, totalScore: 520 })
		]);
		expect(points.map((p) => p.isBest)).toEqual([true, false, true]);
	});

	it('averages over the window that ends at each round', () => {
		const points = progression(
			[
				activity({ id: 'a', totalScore: 400 }),
				activity({ id: 'b', totalScore: 600 }),
				activity({ id: 'c', totalScore: 500 })
			],
			2
		);
		expect(points.map((p) => p.rolling)).toEqual([400, 500, 550]);
	});
});

describe('distribution', () => {
	it('keeps an X apart from the ten it ties with', () => {
		const counts = distribution([
			{ value: 10, zoneLabel: 'X' },
			{ value: 10, zoneLabel: '10' },
			{ value: 9, zoneLabel: '9' },
			{ value: 10, zoneLabel: 'X' }
		]);
		expect(counts.map((c) => [c.label, c.count])).toEqual([
			['X', 2],
			['10', 1],
			['9', 1]
		]);
	});
});

describe('windBand', () => {
	it('reads the bands at their edges', () => {
		expect(windBand(0)).toBe('calm');
		expect(windBand(4.9)).toBe('calm');
		expect(windBand(5)).toBe('light');
		expect(windBand(15)).toBe('moderate');
		expect(windBand(40)).toBe('strong');
	});
});

describe('bandBy', () => {
	it('compares bands on the score per arrow, not on the total', () => {
		const bands = bandBy(
			[
				activity({ id: 'a', totalScore: 600, arrowsShot: 72 }),
				activity({ id: 'b', totalScore: 270, arrowsShot: 36 }),
				activity({ id: 'c', totalScore: 500, arrowsShot: 72 })
			],
			(a) => (a.id === 'c' ? 'windy' : 'calm')
		);
		expect(bands.find((b) => b.key === 'calm')?.perArrow).toBeCloseTo(870 / 108);
		expect(bands.find((b) => b.key === 'windy')?.perArrow).toBeCloseTo(500 / 72);
	});

	it('drops what it cannot place', () => {
		const bands = bandBy([activity({ id: 'a' })], () => null);
		expect(bands).toEqual([]);
	});
});

describe('roundKey', () => {
	it('groups a hand built round with the standard one it copies', () => {
		const built = buildCustomRound({
			name: 'My practice',
			distance: 70,
			unit: 'm',
			faceSize: 122,
			ends: 12,
			arrowsPerEnd: 6
		});
		expect(roundKey(activity({ id: 'a', round: built, roundDefinitionId: null }))).toBe(
			roundKey(activity({ id: 'b' }))
		);
	});

	it('separates two rounds that differ only in distance', () => {
		const near = buildCustomRound({
			distance: 50,
			unit: 'm',
			faceSize: 122,
			ends: 12,
			arrowsPerEnd: 6
		});
		expect(roundKey(activity({ id: 'a', round: near }))).not.toBe(roundKey(activity({ id: 'b' })));
	});
});

describe('summariseByRound', () => {
	it('names a standard shape after the round the rules define, whatever it was called', () => {
		const built = buildCustomRound({
			name: 'Sunday 70',
			distance: 70,
			unit: 'm',
			faceSize: 122,
			ends: 12,
			arrowsPerEnd: 6
		});
		const [summary] = summariseByRound([
			activity({ id: 'a', round: built, roundDefinitionId: null })
		]);
		expect(summary.name).toBe('WA 720 (70m)');
		expect(summary.known).toBe(true);
	});

	it('leaves the distance out of the name when the course is judged by eye', () => {
		const unmarked = {
			...buildCustomRound({ distance: 0, unit: 'm', faceSize: 60, ends: 4, arrowsPerEnd: 3 }),
			stages: [{ distance: null, faceSize: 60, ends: 4, arrowsPerEnd: 3 }]
		};
		const [summary] = summariseByRound([
			activity({ id: 'a', round: unmarked, roundDefinitionId: null, arrowsShot: 12 })
		]);
		expect(summary.name).toBe('60cm · 12');
	});

	it('describes a practice shape by what it is made of, and marks it unknown', () => {
		const odd = buildCustomRound({
			distance: 32,
			unit: 'm',
			faceSize: 80,
			ends: 5,
			arrowsPerEnd: 3
		});
		const [summary] = summariseByRound([
			activity({
				id: 'a',
				round: odd,
				roundDefinitionId: null,
				arrowsShot: 15
			})
		]);
		expect(summary.name).toBe('32m · 80cm · 15');
		expect(summary.known).toBe(false);
	});
});

describe('volumeSeries', () => {
	const day = 86_400_000;
	const monday = new Date(2025, 2, 3).getTime();

	it('fills every bucket between the two ends, so time off reads as a gap', () => {
		const series = volumeSeries(
			[activity({ id: 'a', startedAt: monday, arrowsShot: 72 })],
			monday,
			monday + 3 * day,
			'day',
			() => 'practice'
		);
		expect(series.map((b) => b.arrows)).toEqual([72, 0, 0, 0]);
		expect(series[1].perArrow).toBeNull();
	});

	it('splits each bucket by the key the bars are coloured on', () => {
		const [bucket] = volumeSeries(
			[
				activity({
					id: 'a',
					startedAt: monday,
					arrowsShot: 72,
					totalScore: 600
				}),
				activity({
					id: 'b',
					startedAt: monday + day,
					arrowsShot: 36,
					totalScore: 300
				})
			],
			monday,
			monday + 2 * day,
			'week',
			(a) => (a.id === 'a' ? 'practice' : 'competition')
		);
		expect(bucket.byKey).toEqual({
			practice: { arrows: 72, rounds: 1 },
			competition: { arrows: 36, rounds: 1 }
		});
		expect(bucket.rounds).toBe(2);
		expect(bucket.perArrow).toBeCloseTo(900 / 108);
	});

	it('counts arrows from rounds that were never finished, because they were still loosed', () => {
		const [bucket] = volumeSeries(
			[
				activity({
					id: 'a',
					startedAt: monday,
					arrowsShot: 12,
					totalScore: 100
				})
			],
			monday,
			monday,
			'day',
			() => 'practice'
		);
		expect(bucket.arrows).toBe(12);
	});
});

describe('pickGrain', () => {
	const day = 86_400_000;
	it('keeps the bars finger wide however long the window is', () => {
		expect(pickGrain(0, 30 * day)).toBe('day');
		expect(pickGrain(0, 200 * day)).toBe('week');
		expect(pickGrain(0, 900 * day)).toBe('month');
	});
});
