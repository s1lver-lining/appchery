import { describe, it, expect } from 'vitest';
import {
	newMatch,
	parseConfig,
	endSetPoints,
	tally,
	nextEndNo,
	arrowsShot,
	matchScore,
	wonFromBehind,
	type MatchEnd
} from './matches';

const ends = (...pairs: [number, number][]): MatchEnd[] =>
	pairs.map(([ours, theirs], i) => ({ endNo: i + 1, ours, theirs }));

describe('newMatch', () => {
	it('starts an individual match as five sets of three played to six points', () => {
		const config = newMatch('individual');
		expect(config).toMatchObject({ arrowsPerEnd: 3, maxEnds: 5, setPointsToWin: 6, system: 'set' });
	});

	it('starts a team match as four ends of six played to five points', () => {
		expect(newMatch('team')).toMatchObject({ arrowsPerEnd: 6, maxEnds: 4, setPointsToWin: 5 });
	});

	it('starts a mixed team match as four ends of four', () => {
		expect(newMatch('mixedTeam')).toMatchObject({ arrowsPerEnd: 4, maxEnds: 4 });
	});
});

describe('endSetPoints', () => {
	it('gives two to the winner and one each to a drawn end', () => {
		expect(endSetPoints(28, 27)).toEqual([2, 0]);
		expect(endSetPoints(26, 29)).toEqual([0, 2]);
		expect(endSetPoints(27, 27)).toEqual([1, 1]);
	});
});

describe('tally under the set system', () => {
	const config = newMatch('individual');

	it('stops the match the moment a side reaches the set points', () => {
		const result = tally(config, ends([28, 26], [27, 25], [29, 28]));
		expect(result.ourPoints).toBe(6);
		expect(result.winner).toBe('us');
		expect(result.decided).toBe(true);
		expect(result.endsPlayed).toBe(3);
	});

	it('ignores ends entered after the match was already won', () => {
		const decided = tally(config, ends([28, 26], [27, 25], [29, 28]));
		const extra = tally(config, ends([28, 26], [27, 25], [29, 28], [20, 30], [20, 30]));
		expect(extra).toEqual(decided);
	});

	it('counts a drawn end as one point each', () => {
		const result = tally(config, ends([27, 27], [28, 26]));
		expect([result.ourPoints, result.theirPoints]).toEqual([3, 1]);
		expect(result.decided).toBe(false);
	});

	it('asks for a shoot-off when the sets are level after five', () => {
		const result = tally(config, ends([27, 27], [27, 27], [27, 27], [27, 27], [27, 27]));
		expect([result.ourPoints, result.theirPoints]).toEqual([5, 5]);
		expect(result.needsShootOff).toBe(true);
		expect(result.winner).toBeNull();
	});

	it('lets the closer arrow win the shoot-off', () => {
		const level = ends([27, 27], [27, 27], [27, 27], [27, 27], [27, 27]);
		const result = tally(config, [...level, { endNo: 6, ours: 10, theirs: 9, shootOff: true }]);
		expect(result.winner).toBe('us');
		expect(result.needsShootOff).toBe(false);
	});

	it('leaves an equal shoot-off to the judge rather than calling it', () => {
		const level = ends([27, 27], [27, 27], [27, 27], [27, 27], [27, 27]);
		const result = tally(config, [...level, { endNo: 6, ours: 10, theirs: 10, shootOff: true }]);
		expect(result.winner).toBeNull();
		expect(result.decided).toBe(false);
	});
});

describe('tally under the cumulative system', () => {
	const config = newMatch('individual', 'cumulative');

	it('declares nothing until every end has been shot', () => {
		const four = tally(config, ends([29, 27], [29, 27], [29, 27], [29, 27]));
		expect(four.decided).toBe(false);
		const five = tally(config, ends([29, 27], [29, 27], [29, 27], [29, 27], [29, 27]));
		expect(five.winner).toBe('us');
		expect(five.ourTotal).toBe(145);
	});

	it('goes to a shoot-off when the totals are level', () => {
		const level = ends([28, 28], [28, 28], [28, 28], [28, 28], [28, 28]);
		expect(tally(config, level).needsShootOff).toBe(true);
	});
});

describe('nextEndNo', () => {
	const config = newMatch('individual');

	it('asks for the end after the last one entered', () => {
		expect(nextEndNo(config, [])).toBe(1);
		expect(nextEndNo(config, ends([27, 27]))).toBe(2);
	});

	it('asks for nothing once the match is decided', () => {
		expect(nextEndNo(config, ends([28, 26], [27, 25], [29, 28]))).toBeNull();
	});
});

describe('arrowsShot', () => {
	const config = newMatch('individual');

	it('counts the arrows of the ends actually shot, and the shoot-off arrow with them', () => {
		expect(arrowsShot(config, ends([28, 26], [27, 25]))).toBe(6);
		const level = ends([27, 27], [27, 27], [27, 27], [27, 27], [27, 27]);
		expect(arrowsShot(config, [...level, { endNo: 6, ours: 10, theirs: 9, shootOff: true }])).toBe(16);
	});

	it('counts nothing while the card is kept for somebody else', () => {
		expect(arrowsShot({ ...config, forSelf: false }, ends([28, 26], [27, 25]))).toBe(0);
	});
});

describe('matchScore', () => {
	it('records set points under the set system and the arrow total under the cumulative one', () => {
		expect(matchScore(newMatch('individual'), ends([28, 26], [27, 25]))).toBe(4);
		expect(matchScore(newMatch('individual', 'cumulative'), ends([28, 26], [27, 25]))).toBe(55);
	});
});

describe('parseConfig', () => {
	it('reads back what was stored', () => {
		const config = { ...newMatch('team'), opponent: 'Meudon', teammates: ['Ana', 'Bo'] };
		expect(parseConfig(JSON.stringify(config))).toEqual(config);
	});

	it('survives junk without taking the page down', () => {
		expect(parseConfig('not json')).toBeNull();
		expect(parseConfig(null)).toBeNull();
		expect(parseConfig('{"format":"nonsense","arrowsPerEnd":-4}')).toMatchObject({
			format: 'individual',
			arrowsPerEnd: 3
		});
	});
});

describe('wonFromBehind', () => {
	const config = newMatch('individual');

	it('sees a win from two sets down', () => {
		// 0-2, 0-4, then three sets taken: the comeback the badge is for.
		const comeback = ends([25, 27], [25, 27], [28, 26], [28, 26], [28, 26]);
		expect(wonFromBehind(config, comeback)).toBe(true);
	});

	it('is not a comeback when the match was never two sets down', () => {
		expect(wonFromBehind(config, ends([28, 26], [25, 27], [28, 26], [28, 26]))).toBe(false);
	});

	it('says nothing about a match that was lost, or one shot on totals', () => {
		expect(wonFromBehind(config, ends([25, 27], [25, 27], [25, 27]))).toBe(false);
		const level = ends([25, 27], [25, 27], [30, 20], [30, 20], [30, 20]);
		expect(wonFromBehind(newMatch('individual', 'cumulative'), level)).toBe(false);
	});
});

describe('a match that cannot be separated', () => {
	const level = ends([27, 27], [27, 27], [27, 27], [27, 27], [27, 27]);

	it('is drawn when no shoot-off is allowed', () => {
		const config = { ...newMatch('individual'), shootOff: false };
		const result = tally(config, level);
		expect(result.drawn).toBe(true);
		expect(result.needsShootOff).toBe(false);
		expect(result.winner).toBeNull();
	});

	it('is not drawn while a shoot-off is still to come', () => {
		const result = tally(newMatch('individual'), level);
		expect(result.drawn).toBe(false);
		expect(result.needsShootOff).toBe(true);
	});

	it('is not drawn halfway through', () => {
		expect(tally(newMatch('individual'), ends([27, 27], [27, 27])).drawn).toBe(false);
	});
});
