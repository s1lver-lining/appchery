import { describe, it, expect } from 'vitest';
import {
	evaluateBadges,
	sortBadges,
	BADGES,
	type BadgeActivity,
	type BadgeEnd,
	type BadgeInput
} from './badges';
import { getRound } from './rounds/seed';
import { buildCustomRound } from './rounds/custom';

const wa720 = getRound('wa720-70m')!;
const indoor = getRound('wa-indoor-300-18m')!;

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** A Monday, so a week offset lands where startOfWeek puts it. */
const MONDAY = new Date(2024, 0, 1, 12).getTime();

function activity(partial: Partial<BadgeActivity> & { id: string }): BadgeActivity {
	return {
		sessionId: 's',
		startedAt: MONDAY,
		totalScore: 600,
		arrowsShot: 72,
		count10s: 20,
		countX: 0,
		roundDefinitionId: wa720.id,
		round: wa720,
		kind: 'scoring',
		sessionKind: 'practice',
		bowType: 'recurve',
		windKmh: null,
		temperatureC: null,
		location: null,
		ends: [],
		...partial
	};
}

/** An end, with only the part of it a given rule looks at filled in. */
function end(partial: Partial<BadgeEnd> = {}): BadgeEnd {
	return { stageIndex: 0, arrows: 0, subtotal: 0, golds: 0, lowest: null, plots: [], ...partial };
}

function input(activities: BadgeActivity[], extra: Partial<BadgeInput> = {}): BadgeInput {
	return { activities, sightMarks: [], weekArrowGoal: 0, ...extra };
}

function badge(activities: BadgeActivity[], key: string, extra: Partial<BadgeInput> = {}) {
	return evaluateBadges(input(activities, extra)).find((b) => b.definition.key === key)!;
}

describe('the catalogue', () => {
	it('has no repeated key, because a key is what a stored badge is found by', () => {
		expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
	});

	it('awards nothing to an archer who has shot nothing', () => {
		expect(evaluateBadges(input([])).every((b) => b.earnedAt === null)).toBe(true);
	});
});

describe('volume', () => {
	const rounds = Array.from({ length: 20 }, (_, i) =>
		activity({ id: `a${i}`, startedAt: MONDAY + i * DAY, arrowsShot: 72 })
	);

	it('is dated by the round that carried the total over the line', () => {
		// Fourteen rounds of 72 reach 1008, the fifteenth is not needed.
		expect(badge(rounds, 'thousandArrows').earnedAt).toBe(MONDAY + 13 * DAY);
	});

	it('counts arrows towards the next one while it is out of reach', () => {
		expect(badge(rounds, 'fiveThousandArrows')).toMatchObject({
			earnedAt: null,
			progress: { current: 1440, target: 5000 }
		});
	});

	it('counts arrows from rounds left unfinished, which were still loosed', () => {
		const half = activity({ id: 'h', arrowsShot: 36, totalScore: 300 });
		expect(badge([half], 'thousandArrows').progress?.current).toBe(36);
	});
});

describe('habit', () => {
	it('counts distinct days rather than rounds', () => {
		const twice = [
			activity({ id: 'a', startedAt: MONDAY }),
			activity({ id: 'b', startedAt: MONDAY + 3600_000 })
		];
		expect(badge(twice, 'sevenDays').progress?.current).toBe(1);
	});

	it('needs eight weeks in a row before it calls an archer faithful', () => {
		const weekly = (count: number) =>
			Array.from({ length: count }, (_, i) => activity({ id: `w${i}`, startedAt: MONDAY + i * WEEK }));
		expect(badge(weekly(7), 'everyWeek').earnedAt).toBeNull();
		expect(badge(weekly(8), 'everyWeek').earnedAt).toBe(MONDAY + 7 * WEEK);
	});

	it('breaks the streak on a week nobody shot in', () => {
		const skipped = [0, 1, 2, 3, 5, 6, 7, 8].map((i) =>
			activity({ id: `w${i}`, startedAt: MONDAY + i * WEEK })
		);
		expect(badge(skipped, 'everyWeek').earnedAt).toBeNull();
	});

	it('stays out of reach while no plan asks for anything', () => {
		const weekly = Array.from({ length: 4 }, (_, i) =>
			activity({ id: `w${i}`, startedAt: MONDAY + i * WEEK })
		);
		expect(badge(weekly, 'onPlan').earnedAt).toBeNull();
		expect(badge(weekly, 'onPlan', { weekArrowGoal: 72 }).earnedAt).toBe(MONDAY + 3 * WEEK);
		expect(badge(weekly, 'onPlan', { weekArrowGoal: 100 }).earnedAt).toBeNull();
	});
});

describe('records', () => {
	it('waits for records in three different rounds', () => {
		const custom = buildCustomRound({ distance: 25, unit: 'm', faceSize: 60, ends: 6, arrowsPerEnd: 6 });
		const history = [
			activity({ id: 'a', startedAt: MONDAY, totalScore: 500 }),
			activity({ id: 'b', startedAt: MONDAY + DAY, totalScore: 600 }),
			activity({ id: 'c', startedAt: MONDAY + 2 * DAY, roundDefinitionId: indoor.id, round: indoor, arrowsShot: 30, totalScore: 200 }),
			activity({ id: 'd', startedAt: MONDAY + 3 * DAY, roundDefinitionId: indoor.id, round: indoor, arrowsShot: 30, totalScore: 250 })
		];
		expect(badge(history, 'threeRecords').earnedAt).toBeNull();
		expect(badge(history, 'threeRecords').progress?.current).toBe(2);

		const third = [
			activity({ id: 'e', startedAt: MONDAY + 4 * DAY, roundDefinitionId: null, round: custom, arrowsShot: 36, totalScore: 300 }),
			activity({ id: 'f', startedAt: MONDAY + 5 * DAY, roundDefinitionId: null, round: custom, arrowsShot: 36, totalScore: 320 })
		];
		expect(badge([...history, ...third], 'threeRecords').earnedAt).toBe(MONDAY + 5 * DAY);
	});
});

describe('accuracy', () => {
	it('wants the X at 70m, not any X', () => {
		const inside = activity({ id: 'a', roundDefinitionId: indoor.id, round: indoor, countX: 3 });
		expect(badge([inside], 'firstXAt70').earnedAt).toBeNull();
		const outside = activity({ id: 'b', startedAt: MONDAY + DAY, countX: 1 });
		expect(badge([inside, outside], 'firstXAt70').earnedAt).toBe(MONDAY + DAY);
	});

	it('wants a full end of thirty indoors', () => {
		const near = activity({ id: 'a', roundDefinitionId: indoor.id, round: indoor, ends: [end({ arrows: 3, subtotal: 29, golds: 3 })] });
		expect(badge([near], 'thirtyAt18').earnedAt).toBeNull();
		const perfect = activity({ id: 'b', startedAt: MONDAY + DAY, roundDefinitionId: indoor.id, round: indoor, ends: [end({ arrows: 3, subtotal: 30, golds: 3 })] });
		expect(badge([near, perfect], 'thirtyAt18').earnedAt).toBe(MONDAY + DAY);
	});

	it('asks a golden end for six arrows, all of them gold', () => {
		const short = activity({ id: 'a', ends: [end({ arrows: 3, subtotal: 30, golds: 3 })] });
		expect(badge([short], 'goldenEnd').earnedAt).toBeNull();
		const nearly = activity({ id: 'b', ends: [end({ arrows: 6, subtotal: 55, golds: 5 })] });
		expect(badge([nearly], 'goldenEnd').earnedAt).toBeNull();
		const golden = activity({ id: 'c', startedAt: MONDAY + DAY, ends: [end({ arrows: 6, subtotal: 57, golds: 6 })] });
		expect(badge([golden], 'goldenEnd').earnedAt).toBe(MONDAY + DAY);
	});
});

describe('milestones', () => {
	it('counts a qualification as a competition', () => {
		const qualification = activity({ id: 'a', sessionKind: 'qualification' });
		expect(badge([qualification], 'firstCompetition').earnedAt).toBe(MONDAY);
	});

	it('ignores a competition round that was abandoned half way', () => {
		const half = activity({ id: 'a', sessionKind: 'competition', arrowsShot: 36 });
		expect(badge([half], 'firstCompetition').earnedAt).toBeNull();
	});

	it('needs two bow types, and an outing with no bow proves neither', () => {
		const unknown = activity({ id: 'a', bowType: null });
		const recurve = activity({ id: 'b', startedAt: MONDAY + DAY, bowType: 'recurve' });
		expect(badge([unknown, recurve], 'twoBowTypes').earnedAt).toBeNull();
		const barebow = activity({ id: 'c', startedAt: MONDAY + 2 * DAY, bowType: 'barebow' });
		expect(badge([unknown, recurve, barebow], 'twoBowTypes').earnedAt).toBe(MONDAY + 2 * DAY);
	});

	it('measures a distance in metres however the round quotes it', () => {
		// Ninety yards is 82m, so it clears the seventy badge and falls short of the ninety.
		const yards = buildCustomRound({ distance: 90, unit: 'yd', faceSize: 122, ends: 6, arrowsPerEnd: 6 });
		const shot = activity({ id: 'a', roundDefinitionId: null, round: yards, arrowsShot: 36 });
		expect(badge([shot], 'seventyMetres').earnedAt).toBe(MONDAY);
		expect(badge([shot], 'ninetyMetres').earnedAt).toBeNull();
	});

	it('is earned on the fifth mark of one bow, not the fifth overall', () => {
		const spread = ['a', 'a', 'a', 'a', 'b'].map((bowId, i) => ({ bowId, createdAt: MONDAY + i * DAY }));
		expect(badge([], 'fiveSightMarks', { sightMarks: spread }).earnedAt).toBeNull();
		expect(badge([], 'fiveSightMarks', { sightMarks: [...spread, { bowId: 'a', createdAt: MONDAY + 9 * DAY }] }).earnedAt).toBe(MONDAY + 9 * DAY);
	});

	it('reserves the storm for a wind that deserves the name', () => {
		const breeze = activity({ id: 'a', windKmh: 12 });
		expect(badge([breeze], 'stormArcher').earnedAt).toBeNull();
		const gale = activity({ id: 'b', startedAt: MONDAY + DAY, windKmh: 34 });
		expect(badge([gale], 'stormArcher').earnedAt).toBe(MONDAY + DAY);
	});
});

describe('progression arrows', () => {
	const shape = (value: number, faceSize: number) =>
		buildCustomRound({ distance: value, unit: 'm', faceSize, ends: 6, arrowsPerEnd: 6 });

	const arrow = (partial: Partial<BadgeActivity>) =>
		activity({ id: 'a', roundDefinitionId: null, round: shape(10, 80), arrowsShot: 36, totalScore: 280, ...partial });

	it('is earned on the score the rulebook asks for, and not a point under', () => {
		expect(badge([arrow({})], 'fftaWhite').earnedAt).toBe(MONDAY);
		expect(badge([arrow({ totalScore: 279 })], 'fftaWhite').earnedAt).toBeNull();
	});

	it('takes any bow for the first five', () => {
		expect(badge([arrow({ bowType: 'longbow' })], 'fftaWhite').earnedAt).toBe(MONDAY);
	});

	it('holds the metal arrows to the bow they were written for', () => {
		const at70 = { round: shape(70, 122), roundDefinitionId: null };
		expect(badge([arrow({ ...at70, bowType: 'compound' })], 'fftaGoldRecurve').earnedAt).toBeNull();
		expect(badge([arrow({ ...at70, bowType: 'recurve' })], 'fftaGoldRecurve').earnedAt).toBe(MONDAY);
		expect(badge([arrow({ ...at70, bowType: null })], 'fftaGoldRecurve').earnedAt).toBeNull();
	});

	it('asks compound archers for the higher score', () => {
		const at50 = { round: shape(50, 80), roundDefinitionId: null, bowType: 'compound' };
		expect(badge([arrow({ ...at50, totalScore: 310 })], 'fftaSilverCompound').earnedAt).toBe(MONDAY);
		expect(badge([arrow({ ...at50, totalScore: 310 })], 'fftaGoldCompound').earnedAt).toBeNull();
		expect(badge([arrow({ ...at50, totalScore: 330 })], 'fftaGoldCompound').earnedAt).toBe(MONDAY);
	});

	it('refuses a round of the wrong shape however good the score', () => {
		// A WA 720 at 70m is 72 arrows: a fine score, but not the thirty six the arrow is shot over.
		expect(badge([activity({ id: 'a', totalScore: 700 })], 'fftaGoldRecurve').earnedAt).toBeNull();
		expect(badge([arrow({ round: shape(10, 122) })], 'fftaWhite').earnedAt).toBeNull();
	});
});

describe('sorting', () => {
	it('puts the newest win first and the nearest miss ahead of the rest', () => {
		const sorted = sortBadges([
			{ definition: BADGES[0], earnedAt: null, progress: { current: 1, target: 100 } },
			{ definition: BADGES[1], earnedAt: 10, progress: null },
			{ definition: BADGES[2], earnedAt: null, progress: { current: 90, target: 100 } },
			{ definition: BADGES[3], earnedAt: 20, progress: null }
		]);
		expect(sorted.map((b) => b.earnedAt ?? b.progress!.current)).toEqual([20, 10, 90, 1]);
	});
});

describe('one long outing', () => {
	/** Three activities of one session, which is how a long day is actually recorded. */
	const outing = (arrows: number[]) =>
		arrows.map((count, i) =>
			activity({ id: `a${i}`, sessionId: 'long', startedAt: MONDAY + i * 3600_000, arrowsShot: count })
		);

	it('adds up everything shot in the session, not one activity of it', () => {
		expect(badge(outing([72, 72, 72]), 'halfMarathon').earnedAt).toBe(MONDAY + 2 * 3600_000);
		expect(badge(outing([72, 72]), 'halfMarathon').earnedAt).toBeNull();
	});

	it('counts untargeted practice, which was still arrows down the range', () => {
		const warmUp = activity({ id: 'w', sessionId: 'long', kind: 'training', arrowsShot: 90, totalScore: 0 });
		const rounds = outing([72, 72]).map((a) => ({ ...a, startedAt: a.startedAt + DAY / 24 }));
		expect(badge([warmUp, ...rounds], 'halfMarathon').earnedAt).not.toBeNull();
	});

	it('never adds two outings together', () => {
		const twice = [
			activity({ id: 'a', sessionId: 'one', arrowsShot: 300 }),
			activity({ id: 'b', sessionId: 'two', startedAt: MONDAY + DAY, arrowsShot: 300 })
		];
		expect(badge(twice, 'marathon')).toMatchObject({ earnedAt: null, progress: { current: 300 } });
	});
});

describe('streaks of days and months', () => {
	it('wants three days back to back, not any three days', () => {
		const spread = [0, 2, 4].map((i) => activity({ id: `a${i}`, startedAt: MONDAY + i * DAY }));
		expect(badge(spread, 'threeDaysRunning').earnedAt).toBeNull();
		const running = [0, 1, 2].map((i) => activity({ id: `b${i}`, startedAt: MONDAY + i * DAY }));
		expect(badge(running, 'threeDaysRunning').earnedAt).toBe(new Date(2024, 0, 3).getTime());
	});

	it('wants a full year of months with no gap', () => {
		const months = (count: number) =>
			Array.from({ length: count }, (_, i) =>
				activity({ id: `m${i}`, startedAt: new Date(2024, i, 10).getTime() })
			);
		expect(badge(months(11), 'fourSeasons').earnedAt).toBeNull();
		expect(badge(months(12), 'fourSeasons').earnedAt).toBe(new Date(2024, 11, 1).getTime());

		const gap = months(13).filter((_, i) => i !== 4);
		expect(badge(gap, 'fourSeasons').earnedAt).toBeNull();
	});
});

describe('a handful of arrows', () => {
	/** Six arrows on a circle of radius `r`, in normalised face coordinates. */
	const ring = (r: number) =>
		Array.from({ length: 6 }, (_, i) => ({
			x: r * Math.cos((i * Math.PI) / 3),
			y: r * Math.sin((i * Math.PI) / 3)
		}));

	it('measures the group in centimetres on the face it was shot at', () => {
		// A 0.1 radius group spans 0.2 of the face: 24cm on a 122, 8cm on a 40.
		const outdoor = activity({ id: 'a', ends: [end({ arrows: 6, plots: ring(0.1) })] });
		expect(badge([outdoor], 'handfulOfArrows').earnedAt).toBeNull();

		const inside = activity({
			id: 'b',
			startedAt: MONDAY + DAY,
			roundDefinitionId: indoor.id,
			round: indoor,
			ends: [end({ arrows: 6, plots: ring(0.1) })]
		});
		expect(badge([inside], 'handfulOfArrows').earnedAt).toBe(MONDAY + DAY);
	});

	it('ignores an end where too few arrows were plotted to be a group', () => {
		const five = activity({ id: 'a', roundDefinitionId: indoor.id, round: indoor, ends: [end({ arrows: 6, plots: ring(0.05).slice(0, 5) })] });
		expect(badge([five], 'handfulOfArrows').earnedAt).toBeNull();
	});
});

describe('I see red', () => {
	const ends = (lowest: number[]) => lowest.map((value) => end({ arrows: 3, lowest: value }));

	it('is beaten by a single arrow outside the red', () => {
		const round = { roundDefinitionId: indoor.id, round: indoor, arrowsShot: 30, totalScore: 280 };
		const slip = activity({ id: 'a', ...round, ends: ends([9, 8, 6, 9, 9, 9, 9, 9, 9, 9]) });
		expect(badge([slip], 'iSeeRed').earnedAt).toBeNull();
		const clean = activity({ id: 'b', startedAt: MONDAY + DAY, ...round, ends: ends([9, 8, 7, 9, 9, 9, 9, 9, 9, 9]) });
		expect(badge([clean], 'iSeeRed').earnedAt).toBe(MONDAY + DAY);
	});

	it('stays out of a round the ten ring rules do not apply to', () => {
		const field = buildCustomRound({ distance: 30, unit: 'm', faceSize: 60, ends: 2, arrowsPerEnd: 3 });
		const shot = activity({ id: 'a', roundDefinitionId: null, round: { ...field, scoreSetId: 'field-6-ring' }, arrowsShot: 6, ends: ends([9, 9]) });
		expect(badge([shot], 'iSeeRed').earnedAt).toBeNull();
	});
});

describe('the same round over and over', () => {
	it('counts finished rounds of one kind', () => {
		const many = (count: number) =>
			Array.from({ length: count }, (_, i) => activity({ id: `r${i}`, startedAt: MONDAY + i * DAY }));
		expect(badge(many(24), 'groundhogDay').earnedAt).toBeNull();
		expect(badge(many(24), 'groundhogDay').progress?.current).toBe(24);
		expect(badge(many(25), 'groundhogDay').earnedAt).toBe(MONDAY + 24 * DAY);
	});
});

describe('places', () => {
	it('treats a place written two ways as one place', () => {
		const places = ['Club', 'club ', 'Field', 'Wood', 'Hill'];
		const outings = places.map((location, i) =>
			activity({ id: `p${i}`, startedAt: MONDAY + i * DAY, location })
		);
		expect(badge(outings, 'tourist').earnedAt).toBeNull();
		expect(badge(outings, 'tourist').progress?.current).toBe(4);
	});

	it('ignores an outing that recorded no place', () => {
		const blank = activity({ id: 'a', location: '  ' });
		expect(badge([blank], 'tourist').progress?.current).toBe(0);
	});
});

describe('the weather badges', () => {
	it('wants the cold outdoors, where it is the archer freezing and not the hall', () => {
		const inside = activity({ id: 'a', roundDefinitionId: indoor.id, round: indoor, arrowsShot: 30, temperatureC: 4 });
		expect(badge([inside], 'frostbite').earnedAt).toBeNull();
		const outside = activity({ id: 'b', startedAt: MONDAY + DAY, temperatureC: 4 });
		expect(badge([outside], 'frostbite').earnedAt).toBe(MONDAY + DAY);
		const mild = activity({ id: 'c', temperatureC: 12 });
		expect(badge([mild], 'frostbite').earnedAt).toBeNull();
	});

	it('holds the wind to the same distance, so an indoor round is never stormy', () => {
		const inside = activity({ id: 'a', roundDefinitionId: indoor.id, round: indoor, arrowsShot: 30, windKmh: 40 });
		expect(badge([inside], 'stormArcher').earnedAt).toBeNull();
	});
});

describe('rounds the ten ring rules do not apply to', () => {
	const field = buildCustomRound({ distance: 40, unit: 'm', faceSize: 60, ends: 4, arrowsPerEnd: 6 });
	const fieldRound = { ...field, discipline: 'field' as const, scoreSetId: 'field-6-ring' };

	it('keeps the golden end to faces where a nine is the gold', () => {
		const six = [end({ arrows: 6, subtotal: 36, golds: 6 })];
		expect(badge([activity({ id: 'a', roundDefinitionId: null, round: fieldRound, ends: six })], 'goldenEnd').earnedAt).toBeNull();
		expect(badge([activity({ id: 'b', ends: six })], 'goldenEnd').earnedAt).toBe(MONDAY);
	});

	it('counts an unmarked field course as outdoors, because that is where it is', () => {
		const unmarked = {
			...fieldRound,
			stages: fieldRound.stages.map((stage) => ({ ...stage, distance: null }))
		};
		const cold = activity({
			id: 'a',
			roundDefinitionId: null,
			round: unmarked,
			arrowsShot: 24,
			temperatureC: 3
		});
		expect(badge([cold], 'frostbite').earnedAt).toBe(MONDAY);
	});
});

describe('what an end did is judged on a whole end', () => {
	/** The indoor round asks for three arrows an end; this one was stopped after two. */
	it('ignores an end the archer walked away from', () => {
		const short = activity({
			id: 'a',
			roundDefinitionId: indoor.id,
			round: indoor,
			ends: [end({ arrows: 2, subtotal: 20, golds: 2 })]
		});
		expect(badge([short], 'thirtyAt18').earnedAt).toBeNull();
	});

	it('wants every arrow of the end plotted before it measures the group', () => {
		// Six of the seven arrows plotted tightly says nothing about where the seventh went.
		const seven = buildCustomRound({ distance: 18, unit: 'm', faceSize: 40, ends: 2, arrowsPerEnd: 7 });
		const tight = Array.from({ length: 6 }, (_, i) => ({ x: 0.01 * i, y: 0 }));
		const partial = activity({
			id: 'a',
			roundDefinitionId: null,
			round: seven,
			ends: [end({ arrows: 7, plots: tight })]
		});
		expect(badge([partial], 'handfulOfArrows').earnedAt).toBeNull();
	});
});
