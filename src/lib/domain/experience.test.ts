import { describe, it, expect } from 'vitest';
import {
	experience,
	levelAt,
	xpForLevel,
	roundXp,
	matchXp,
	badgeXp,
	stageDifficulty,
	roundDifficulty,
	XP_PER_ARROW,
	XP_MATCH_WIN,
	type XpActivity
} from './experience';
import { BADGES } from './badges';
import { getRound } from './rounds/seed';

const wa720 = getRound('wa720-70m')!;
const indoor = getRound('wa-indoor-300-18m')!;

function activity(partial: Partial<XpActivity> & { id: string }): XpActivity {
	return {
		sessionId: 's',
		startedAt: 0,
		totalScore: 0,
		arrowsShot: 0,
		count10s: 0,
		countX: 0,
		roundDefinitionId: null,
		round: null,
		kind: 'training',
		...partial
	};
}

describe('levels', () => {
	it('starts at level one with nothing shot', () => {
		expect(levelAt(0)).toBe(1);
		expect(xpForLevel(1)).toBe(0);
	});

	it('asks four times as much for twice the level', () => {
		expect(xpForLevel(3)).toBe(4 * xpForLevel(2));
	});

	it('reads a level back from the points that reach it', () => {
		for (const level of [1, 2, 5, 12, 40]) {
			expect(levelAt(xpForLevel(level))).toBe(level);
			expect(levelAt(xpForLevel(level) - 1)).toBe(Math.max(1, level - 1));
		}
	});
});

describe('difficulty', () => {
	it('rates the round it is measured against at one', () => {
		expect(stageDifficulty({ distance: { value: 18, unit: 'm' }, faceSize: 40, ends: 10, arrowsPerEnd: 3 })).toBeCloseTo(1);
	});

	it('rates a face further away for its size as harder', () => {
		expect(roundDifficulty(wa720)).toBeGreaterThan(roundDifficulty(indoor));
	});

	it('reads a distance in yards in metres', () => {
		const yards = stageDifficulty({ distance: { value: 20, unit: 'yd' }, faceSize: 40, ends: 10, arrowsPerEnd: 3 });
		const metres = stageDifficulty({ distance: { value: 20, unit: 'm' }, faceSize: 40, ends: 10, arrowsPerEnd: 3 });
		expect(yards).toBeLessThan(metres);
	});

	it('rates an unmarked course at the plain rate rather than guessing', () => {
		expect(stageDifficulty({ distance: null, faceSize: 40, ends: 10, arrowsPerEnd: 3 })).toBe(1);
	});
});

describe('rounds', () => {
	const finished = (round: typeof wa720, score: number) =>
		activity({
			id: 'a',
			kind: 'scoring',
			round,
			roundDefinitionId: round.id,
			arrowsShot: round.stages.reduce((sum, s) => sum + s.ends * s.arrowsPerEnd, 0),
			totalScore: score
		});

	it('pays nothing for a round left unfinished', () => {
		expect(roundXp({ ...finished(wa720, 600), arrowsShot: 30 })).toBe(0);
	});

	it('pays a better score more than a worse one on the same round', () => {
		expect(roundXp(finished(wa720, 700))).toBeGreaterThan(roundXp(finished(wa720, 300)));
	});

	it('still pays something for a round that went badly', () => {
		expect(roundXp(finished(wa720, 0))).toBeGreaterThan(0);
	});

	it('pays more per arrow outdoors at seventy metres than indoors at eighteen', () => {
		const outdoor = roundXp(finished(wa720, 720)) / 72;
		const inside = roundXp(finished(indoor, 300)) / 30;
		expect(outdoor).toBeGreaterThan(inside);
	});

	it('pays nothing for arrows that belong to no round', () => {
		expect(roundXp(activity({ id: 'a', kind: 'training', arrowsShot: 60 }))).toBe(0);
	});
});

describe('matches', () => {
	const match = (partial: Partial<NonNullable<XpActivity['match']>>) =>
		activity({
			id: 'm',
			kind: 'match',
			arrowsShot: 15,
			match: { won: true, drawn: false, stage: 'none', bot: null, ...partial }
		});

	it('pays nothing for a match lost', () => {
		expect(matchXp(match({ won: false }))).toBe(0);
	});

	it('pays a draw half of a win', () => {
		expect(matchXp(match({ won: false, drawn: true }))).toBe(XP_MATCH_WIN * 0.5);
	});

	it('pays a final more than a first round', () => {
		expect(matchXp(match({ stage: 'final' }))).toBeGreaterThan(matchXp(match({ stage: 'r64' })));
	});

	it('pays beating the professional more than beating the beginner', () => {
		expect(matchXp(match({ bot: 'professional' }))).toBeGreaterThan(
			matchXp(match({ bot: 'beginner' }))
		);
	});

	it('pays nothing at all for a card kept for somebody else', () => {
		const kept = activity({ id: 'm', kind: 'match', arrowsShot: 0, match: null });
		expect(matchXp(kept)).toBe(0);
		expect(experience({ activities: [kept], badges: [] }).total).toBe(0);
	});
});

describe('badges', () => {
	it('values every badge in the catalogue', () => {
		for (const badge of BADGES) expect(badge.xp).toBeGreaterThan(0);
	});

	it('pays a badge once however many rows name it', () => {
		const twice = experience({ activities: [], badges: ['marathon', 'marathon'] });
		expect(twice.total).toBe(badgeXp('marathon'));
		expect(twice.sources.badges.count).toBe(1);
	});

	it('pays nothing for a key no badge answers to', () => {
		expect(experience({ activities: [], badges: ['nothingByThatName'] }).total).toBe(0);
	});
});

describe('experience', () => {
	it('counts every arrow, whatever produced it', () => {
		const result = experience({
			activities: [
				activity({ id: 'a', kind: 'tuning', arrowsShot: 24 }),
				activity({ id: 'b', kind: 'freeScore', arrowsShot: 36 })
			],
			badges: []
		});
		expect(result.sources.arrows.count).toBe(60);
		expect(result.sources.arrows.xp).toBe(60 * XP_PER_ARROW);
	});

	it('gives the same answer whatever order the shooting arrives in', () => {
		const activities = [
			activity({ id: 'a', kind: 'scoring', round: wa720, arrowsShot: 72, totalScore: 640 }),
			activity({ id: 'b', kind: 'tuning', arrowsShot: 24 }),
			activity({
				id: 'c',
				kind: 'match',
				arrowsShot: 15,
				match: { won: true, drawn: false, stage: 'semi', bot: 'amateur' }
			})
		];
		const forwards = experience({ activities, badges: ['marathon'] });
		const backwards = experience({ activities: [...activities].reverse(), badges: ['marathon'] });
		expect(backwards).toEqual(forwards);
	});

	it('takes back exactly what a deleted session gave', () => {
		const kept = activity({ id: 'a', kind: 'scoring', round: wa720, arrowsShot: 72, totalScore: 640 });
		const gone = activity({ id: 'b', kind: 'tuning', arrowsShot: 24, sessionId: 'other' });
		const both = experience({ activities: [kept, gone], badges: [] });
		const one = experience({ activities: [kept], badges: [] });
		expect(both.total - one.total).toBe(24 * XP_PER_ARROW);
	});

	it('places the archer inside their level', () => {
		const result = experience({ activities: [activity({ id: 'a', arrowsShot: 300 })], badges: [] });
		expect(result.total).toBe(600);
		expect(result.level).toBe(levelAt(600));
		expect(result.into + result.toNext).toBe(result.span);
		expect(result.nextLevelAt).toBe(xpForLevel(result.level + 1));
	});
});
