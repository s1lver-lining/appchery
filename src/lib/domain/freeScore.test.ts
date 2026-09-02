import { describe, it, expect } from 'vitest';
import {
	parseFreeScore,
	clampFreeScore,
	FREE_SCORE_LIMITS,
	serialiseFreeScore,
	validateFreeScoreSetup,
	freeScoreLabel,
	freeScoreAverage,
	defaultFreeScoreSetup,
	FREE_SCORE_KIND
} from './freeScore';
import { toVolume, volumeRoundKey } from './stats';

describe('free score setup', () => {
	it('survives a round trip through storage', () => {
		const setup = { distance: 30, unit: 'yd' as const, faceSize: 80 };
		expect(parseFreeScore(serialiseFreeScore(setup))).toEqual(setup);
	});

	it('falls back rather than failing on a measurement block written by something else', () => {
		expect(parseFreeScore(null)).toEqual(defaultFreeScoreSetup());
		expect(parseFreeScore('not json')).toEqual(defaultFreeScoreSetup());
		// A block that says nothing usable leaves the face at the default and the distance unknown,
		// which is the honest reading: it never claimed a distance.
		expect(parseFreeScore('{"faceSize":"big"}')).toEqual({ distance: null, unit: 'm', faceSize: 40 });
	});

	it('keeps an unknown distance as unknown rather than inventing one', () => {
		const parsed = parseFreeScore(serialiseFreeScore({ distance: null, unit: 'm', faceSize: 40 }));
		expect(parsed.distance).toBeNull();
		expect(freeScoreLabel(parsed)).toBe('40cm');
	});

	it('names itself by where it was shot', () => {
		expect(freeScoreLabel({ distance: 18, unit: 'm', faceSize: 40 })).toBe('18m · 40cm');
	});

	it('refuses a face or a distance nobody shoots', () => {
		expect(validateFreeScoreSetup({ distance: 18, unit: 'm', faceSize: 40 })).toEqual([]);
		expect(validateFreeScoreSetup({ distance: 18, unit: 'm', faceSize: 9999 })).toEqual(['faceSize']);
		expect(validateFreeScoreSetup({ distance: -3, unit: 'm', faceSize: 40 })).toEqual(['distance']);
	});

	it('reports an average only once something was shot', () => {
		expect(freeScoreAverage(62, 8)).toBeCloseTo(7.75);
		expect(freeScoreAverage(0, 0)).toBeNull();
	});
});

describe('free score in the stats', () => {
	const activity = {
		id: 'free',
		sessionId: 's',
		startedAt: 0,
		totalScore: 62,
		arrowsShot: 8,
		count10s: 0,
		countX: 0,
		roundDefinitionId: null,
		round: null,
		kind: FREE_SCORE_KIND
	};

	it('counts its arrows as volume and its score as nothing', () => {
		const [volume] = toVolume([activity]);
		expect(volume.arrowsShot).toBe(8);
		// The whole reason this kind exists: a score with no ends behind it must never reach an
		// average, a personal best or a round comparison.
		expect(volume.totalScore).toBe(0);
	});

	it('is filed under its own kind rather than under a round shape', () => {
		expect(volumeRoundKey(activity)).toBe('kind:freeScore');
	});
});

describe('clampFreeScore', () => {
	it('holds a figure to the bounds declared beside it', () => {
		expect(clampFreeScore(999_999, FREE_SCORE_LIMITS.arrows)).toBe(FREE_SCORE_LIMITS.arrows.max);
		expect(clampFreeScore(-5, FREE_SCORE_LIMITS.arrows)).toBe(FREE_SCORE_LIMITS.arrows.min);
		expect(clampFreeScore(36.4, FREE_SCORE_LIMITS.arrows)).toBe(36);
	});

	it('reads a cleared field as the lowest the figure may be, never as NaN', () => {
		expect(clampFreeScore(Number.NaN, FREE_SCORE_LIMITS.score)).toBe(FREE_SCORE_LIMITS.score.min);
		expect(clampFreeScore(Number.POSITIVE_INFINITY, FREE_SCORE_LIMITS.score)).toBe(
			FREE_SCORE_LIMITS.score.min
		);
	});
});
