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
	withinRange,
	distribution,
	windBand,
	bandBy,
	roundKey,
	volumeSeries,
	pickGrain,
	shootsArrows,
	toVolume,
	volumeRoundKey,
	VOLUME_KINDS,
	type ActivityLike,
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
		// The first round is not one of them: it beat nothing, the same rule isPersonalBest applies.
		expect(points.map((p) => p.isBest)).toEqual([false, false, true]);
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

/**
 * The one list every arrow figure has to be read from. Three places used to count three different
 * populations of arrow, so an afternoon of tuning made the month disagree with the week.
 */
describe('toVolume', () => {
	const kinds = (extra: Partial<ActivityLike> = {}): ActivityLike[] => [
		{ ...activity({ id: 'round', arrowsShot: 72, totalScore: 600 }), kind: 'scoring', ...extra },
		{ ...activity({ id: 'match', arrowsShot: 12, totalScore: 0 }), kind: 'match', ...extra },
		{ ...activity({ id: 'tuning', arrowsShot: 18, totalScore: 0 }), kind: 'tuning', ...extra },
		{ ...activity({ id: 'free', arrowsShot: 40, totalScore: 0 }), kind: 'training', ...extra }
	];

	it('counts the arrows of every kind of activity', () => {
		expect(overview(toVolume(kinds())).arrows).toBe(142);
	});

	it('agrees with the plain sum the sessions list adds up', () => {
		const all = kinds();
		const pill = all.reduce((sum, a) => sum + a.arrowsShot, 0);
		expect(overview(toVolume(all)).arrows).toBe(pill);
	});

	it('leaves the scoring activity exactly as it was, round and all', () => {
		const [shotRound] = toVolume(kinds());
		expect(shotRound).toEqual({
			...activity({ id: 'round', arrowsShot: 72, totalScore: 600 }),
			kind: 'scoring'
		});
	});

	it('keeps what each activity was, so the round chip can name arrows that had no round', () => {
		expect(toVolume(kinds()).map((a) => volumeRoundKey(a))).toEqual([
			roundKey(activity({ id: 'round' })),
			'kind:match',
			'kind:tuning',
			'kind:training'
		]);
	});

	it('strips the round and the score off everything that was not a scored round', () => {
		for (const other of toVolume(kinds()).filter((a) => a.id !== 'round')) {
			expect(other.round).toBeNull();
			expect(other.roundDefinitionId).toBeNull();
			expect(other.totalScore).toBe(0);
			expect(other.count10s).toBe(0);
			expect(other.countX).toBe(0);
		}
	});

	it('carries no score for the arrows that were not scored, so an average can be asked of the rounds', () => {
		const rounds = toVolume(kinds()).filter((a) => a.round);
		expect(overview(rounds).averagePerArrow).toBeCloseTo(600 / 72);
		expect(overview(rounds).arrows).toBe(72);
	});

	it('drops an activity nothing was shot in, whatever its kind', () => {
		const empty = kinds().map((a) => ({ ...a, arrowsShot: 0 }));
		expect(toVolume(empty)).toEqual([]);
	});

	it('counts a match kept for somebody else out, since it carries no arrows of ours', () => {
		const all = kinds().map((a) => (a.kind === 'match' ? { ...a, arrowsShot: 0 } : a));
		expect(overview(toVolume(all)).arrows).toBe(130);
	});
});

describe('volumeRoundKey', () => {
	it('files a round under its shape, so the same shape is one option however it was picked', () => {
		const custom = buildCustomRound({ ends: 12, arrowsPerEnd: 6, faceSize: 122, distance: 70, unit: 'm' });
		expect(volumeRoundKey({ ...activity({ id: 'a' }), kind: 'scoring' })).toBe(
			volumeRoundKey({ ...activity({ id: 'b', round: custom, roundDefinitionId: null }), kind: 'scoring' })
		);
	});

	it('offers a key for every kind of arrow that had no round', () => {
		const keys = VOLUME_KINDS.map((kind) => volumeRoundKey({ ...activity({ id: kind }), kind }));
		expect(keys).toEqual([
			'kind:match',
			'kind:tuning',
			'kind:freeScore',
			'kind:drill',
			'kind:training'
		]);
	});

	it('reads an activity carrying no kind as a round, which is what a round only list holds', () => {
		expect(volumeRoundKey(activity({ id: 'a' }))).toBe(roundKey(activity({ id: 'a' })));
	});
});

/**
 * Strength work and running are activities of a session like anything else, and neither sends an
 * arrow anywhere. Every figure that counts arrows reads them through here, so this is where they
 * have to be kept out: a routine that recorded reps as arrows would corrupt the whole history.
 */
describe('activities that shoot nothing', () => {
	const strength = (extra: Partial<ActivityLike> = {}): ActivityLike => ({
		...activity({ id: 'strength', arrowsShot: 0, totalScore: 0, roundDefinitionId: null, round: null }),
		kind: 'strength',
		...extra
	});

	it('names the kinds that put arrows downrange', () => {
		expect(shootsArrows('scoring')).toBe(true);
		expect(shootsArrows('training')).toBe(true);
		expect(shootsArrows('strength')).toBe(false);
		expect(shootsArrows('running')).toBe(false);
	});

	it('treats a kind nobody thought about as shooting nothing', () => {
		expect(shootsArrows('whatever-comes-next')).toBe(false);
	});

	it('keeps them out of the volume even if something wrote arrows onto them', () => {
		const volume = toVolume([...kindsShooting(), strength({ arrowsShot: 30 })]);
		expect(volume.map((entry) => entry.id)).not.toContain('strength');
		expect(overview(volume).arrows).toBe(142);
	});

	it('keeps a figure they carry out of the scores', () => {
		// A run stores its distance somewhere, and whatever column it lands in is not a score.
		const volume = toVolume([strength({ kind: 'running', totalScore: 5000, arrowsShot: 0 })]);
		expect(volume).toEqual([]);
	});
});

/**
 * A drill puts arrows downrange and its total is not a score: it is what a rule happened to add up
 * to, over an arrow count the archer chose. Letting one into an average or a personal best would be
 * comparing an afternoon of pressure games against a scored round, so this is where it is stopped.
 */
describe('drills count as arrows and never as a score', () => {
	const drill = (extra: Partial<ActivityLike> = {}): ActivityLike => ({
		...activity({ id: 'drill', arrowsShot: 24, totalScore: 210, roundDefinitionId: null, round: null }),
		kind: 'drill',
		...extra
	});

	it('puts its arrows in the volume', () => {
		expect(toVolume([drill()]).map((entry) => entry.arrowsShot)).toEqual([24]);
	});

	it('strips the total it happened to add up to', () => {
		const [volume] = toVolume([drill({ count10s: 9, countX: 4 })]);
		expect(volume.totalScore).toBe(0);
		expect(volume.count10s).toBe(0);
		expect(volume.countX).toBe(0);
	});

	it('can never be a personal best, having no round to be best at', () => {
		expect(isPersonalBest(drill(), [drill({ id: 'older', totalScore: 100 })])).toBe(false);
	});

	it('is filed under what it was rather than under a round shape', () => {
		expect(volumeRoundKey(drill())).toBe('kind:drill');
	});
});

const kindsShooting = (): ActivityLike[] => [
	{ ...activity({ id: 'round', arrowsShot: 72, totalScore: 600 }), kind: 'scoring' },
	{ ...activity({ id: 'match', arrowsShot: 12, totalScore: 0 }), kind: 'match' },
	{ ...activity({ id: 'tuning', arrowsShot: 18, totalScore: 0 }), kind: 'tuning' },
	{ ...activity({ id: 'free', arrowsShot: 40, totalScore: 0 }), kind: 'training' }
];

describe('withinRange', () => {
	const on = (iso: string) => new Date(iso).getTime();

	it('reaches a whole month back from a day the month before does not have', () => {
		// From 31 March the month before ends on the 28th, not on the 3rd of March.
		const now = on('2026-03-31T12:00');
		expect(withinRange('month', on('2026-02-28T13:00'), now)).toBe(true);
		expect(withinRange('month', on('2026-03-02T12:00'), now)).toBe(true);
		expect(withinRange('month', on('2026-02-27T12:00'), now)).toBe(false);
	});

	it('reaches a whole year back from the 29th of February', () => {
		const now = on('2024-02-29T12:00');
		expect(withinRange('year', on('2023-03-01T12:00'), now)).toBe(true);
		expect(withinRange('year', on('2023-02-27T12:00'), now)).toBe(false);
	});
});

describe('bandBy with a given order', () => {
	it('puts a band the order does not name last', () => {
		const bands = bandBy(
			[
				activity({ id: 'a', totalScore: 100, arrowsShot: 10 }),
				activity({ id: 'b', totalScore: 100, arrowsShot: 10 }),
				activity({ id: 'c', totalScore: 100, arrowsShot: 10 })
			],
			(a) => ({ a: 'cold', b: 'mild', c: 'tropical' })[a.id] ?? null,
			['cold', 'cool', 'mild', 'hot']
		);
		expect(bands.map((band) => band.key)).toEqual(['cold', 'mild', 'tropical']);
	});
});
