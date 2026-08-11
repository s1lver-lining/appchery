import { describe, it, expect } from 'vitest';
import { scorecardSvg, type CardData } from './scorecard';

function card(partial: Partial<CardData> = {}): CardData {
	return {
		roundName: 'WA 720 70m',
		score: 648,
		max: 720,
		arrows: 72,
		tens: 31,
		xs: 12,
		ends: [56, 54, 57, 52],
		date: '11 Aug 2026',
		place: 'Club de Lyon',
		bow: 'Formula',
		isBest: false,
		labels: {
			points: 'Total',
			arrows: 'Arrows',
			tens: '10s',
			xs: 'Xs',
			average: 'Per arrow',
			ends: 'End by end',
			personalBest: 'Personal best',
			tagline: 'shot with Appchery'
		},
		...partial
	};
}

describe('scorecardSvg', () => {
	it('carries the figures the round is remembered by', () => {
		const svg = scorecardSvg(card());
		expect(svg).toContain('>648<');
		expect(svg).toContain('/ 720');
		expect(svg).toContain('9.00');
	});

	it('escapes anything the archer typed, since the card is built as markup', () => {
		const svg = scorecardSvg(card({ place: 'Ravens & <script>Crows</script>' }));
		expect(svg).toContain('Ravens &amp; &lt;script&gt;');
		expect(svg).not.toContain('<script>');
	});

	it('wears the ribbon only for a record', () => {
		expect(scorecardSvg(card({ isBest: true }))).toContain('PERSONAL BEST');
		expect(scorecardSvg(card())).not.toContain('PERSONAL BEST');
	});

	it('never draws a number it does not have', () => {
		const svg = scorecardSvg(card({ max: null, arrows: 0, score: 0, ends: [], place: null, bow: null }));
		expect(svg).not.toMatch(/NaN|undefined|Infinity/);
	});
});
