import { describe, it, expect } from 'vitest';
import { scorecardSvg, DEFAULT_CARD_OPTIONS, type CardData } from './scorecard';

const base: Omit<CardData, 'options'> = {
	roundName: 'Us · Them',
	score: 5,
	max: null,
	arrows: 9,
	tens: 2,
	xs: 1,
	sheet: [
		{ arrows: ['10', '9', '9'], opponentArrows: ['9', '8', '8'], subtotal: 28, running: 25 },
		{ arrows: ['9', '9', '8'], opponentArrows: ['10', '9', '9'], subtotal: 26, running: 28 }
	],
	date: '12 Aug 2026',
	place: null,
	bow: null,
	category: null,
	sessionName: null,
	weather: null,
	isBest: false,
	labels: {
		points: 'SETS',
		arrows: 'Arrows',
		tens: 'Tens',
		xs: 'Xs',
		average: 'Average',
		personalBest: 'Won',
		end: 'End',
		endTotal: 'A very long archer name',
		runningTotal: 'Another long name here',
		tagline: 'Shot with Appchery'
	}
};

const card = (extra: Partial<CardData> = {}) =>
	scorecardSvg({
		...base,
		...extra,
		options: { ...DEFAULT_CARD_OPTIONS, theme: 'light', ...(extra.options ?? {}) }
	} as CardData);

describe('the match card', () => {
	it('writes the result as one scoreline rather than two loose figures', () => {
		expect(card({ opponentScore: 3 })).toContain('>5 – 3<');
	});

	it('leaves a round alone, which has a ceiling instead of an opponent', () => {
		const round = card({ score: 648, max: 720 });
		expect(round).toContain('>648<');
		expect(round).toContain('>/ 720<');
	});

	it('averages a match over its arrows, not over its set points', () => {
		// 54 points across 9 arrows is 6.00; the 5 set points would have said 0.56.
		expect(card({ opponentScore: 3, arrowTotal: 54 })).toContain('>6.00<');
	});

	/**
	 * The heads are drawn right aligned at the two column edges, so the second one is the one that can
	 * run into the first. Both are held inside their column with a gutter to spare.
	 */
	it('keeps both column heads inside their own column', () => {
		const svg = card({ opponentScore: 3 });
		const heads = [...svg.matchAll(/text-anchor="end"[^>]*>([^<]+)</g)].map((match) => match[1]);
		const names = heads.filter((head) => head.includes('…') || head.includes('NAME'));
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			// The estimate the card places by: size 20, letter spacing 2, and a 152px column to sit in.
			expect(name.length * (20 * 0.66 + 2)).toBeLessThanOrEqual(152);
		}
		expect(svg).not.toContain('A VERY LONG ARCHER NAME');
	});

	it('leaves a head that fits alone', () => {
		expect(card({ labels: { ...base.labels, endTotal: 'Ana', runningTotal: 'Bo' } })).toContain(
			'>ANA<'
		);
	});

	it('draws the other side’s arrows only when asked to', () => {
		const off = card({ opponentScore: 3 });
		const on = card({ opponentScore: 3, options: { opponentArrows: true } as CardData['options'] });
		expect(on.split('>8<').length).toBeGreaterThan(off.split('>8<').length);
	});
});

describe('an end the other side has not entered', () => {
	it('leaves the column blank rather than saying they shot nothing', () => {
		const svg = card({ sheet: [{ arrows: ['10', '9', '9'], subtotal: 28, running: null }] });
		expect(svg).not.toContain('>0</text>');
	});
});
