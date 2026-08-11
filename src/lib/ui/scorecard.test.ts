import { describe, it, expect } from 'vitest';
import { scorecardSvg, DEFAULT_CARD_OPTIONS, type CardData } from './scorecard';

function card(partial: Partial<CardData> = {}): CardData {
	return {
		roundName: 'WA 720 70m',
		score: 648,
		max: 720,
		arrows: 72,
		tens: 31,
		xs: 12,
		sheet: [
			{ arrows: ['X', '10', '9'], subtotal: 29, running: 29 },
			{ arrows: ['9', '9', '8'], subtotal: 26, running: 55 }
		],
		date: '11 Aug 2026',
		place: 'Club de Lyon',
		bow: 'Formula',
		category: 'Practice',
		sessionName: 'Club shoot',
		weather: null,
		isBest: false,
		options: { ...DEFAULT_CARD_OPTIONS, theme: 'dark' as const },
		labels: {
			points: 'Total',
			arrows: 'Arrows',
			tens: '10s',
			xs: 'Xs',
			average: 'Per arrow',
			end: 'End',
			endTotal: 'E/T',
			runningTotal: 'Total',
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
		const svg = scorecardSvg(card({ max: null, arrows: 0, score: 0, sheet: [], place: null, bow: null }));
		expect(svg).not.toMatch(/NaN|undefined|Infinity/);
	});
});
