import { BADGES, type EarnedBadge } from '$lib/domain/badges';
import type { IconName } from '$lib/ui/Icon.svelte';
import type { DiagramName } from '$lib/domain/tuning/guide';
import { EXERCISES } from '$lib/domain/exercises';
import { WA_10_RING } from '$lib/domain/rounds/seed';
import type { Shot } from '$lib/domain/rounds/types';
import type { Band, ProgressionPoint, ValueCount } from '$lib/domain/stats';

/**
 * An invented archer, good enough to be worth showing and human enough to be believable.
 *
 * The landing page draws the app's own components rather than screenshots of them, so it needs the
 * shape of a season without a database to read one from. Every figure here is made up: it is a
 * poster, and nobody's real scores belong on it.
 */

/** A polar plot, which is how a real group falls: scattered around a centre that is slightly off. */
function group(count: number, spread: number, offset: [number, number], seed: number): Shot[] {
	let state = seed;
	const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
	return Array.from({ length: count }, (_, i) => {
		const angle = random() * Math.PI * 2;
		const radius = Math.sqrt(random()) * spread;
		const x = offset[0] + Math.cos(angle) * radius;
		const y = offset[1] + Math.sin(angle) * radius;
		const hit = Math.hypot(x, y);
		// Innermost first: the zones are listed outermost to innermost, and the tightest ring the
		// arrow is inside is the one it scores.
		const zone = [...WA_10_RING.zones]
			.reverse()
			.find((z) => z.countsAsHit && z.shape.kind === 'circle' && hit <= z.shape.r);
		return {
			ordinal: i + 1,
			value: zone?.value ?? 0,
			zoneLabel: zone?.label ?? 'M',
			x,
			y,
			source: 'plotted'
		} satisfies Shot;
	});
}

export const SCORE_SET = WA_10_RING;
export const END_SHOTS = group(6, 0.14, [0.02, -0.05], 7);
export const EARLIER_SHOTS = group(18, 0.2, [0.03, -0.02], 91);

const DAY = 86_400_000;
const START = new Date('2026-03-07T00:00').getTime();

/** A season that improves and then plateaus, because a line that only rises is a line nobody trusts. */
export const PROGRESSION: ProgressionPoint[] = [
	612, 598, 631, 627, 645, 638, 659, 651, 664, 672, 668, 681, 677, 686
].map((score, i, all) => {
	const window = all.slice(Math.max(0, i - 4), i + 1);
	return {
		at: START + i * 12 * DAY,
		score,
		rolling: window.reduce((sum, value) => sum + value, 0) / window.length,
		isBest: all.slice(0, i).every((earlier) => earlier < score)
	};
});

export const ZONE_COUNTS: ValueCount[] = [
	{ label: 'X', value: 10, count: 34 },
	{ label: '10', value: 10, count: 61 },
	{ label: '9', value: 9, count: 112 },
	{ label: '8', value: 8, count: 96 },
	{ label: '7', value: 7, count: 48 },
	{ label: '6', value: 6, count: 21 },
	{ label: '5', value: 5, count: 9 },
	{ label: 'M', value: 0, count: 3 }
];

/** What the wind costs, which is the question the bands exist to answer. */
export const WIND_BANDS: Band[] = [
	{ key: 'calm', rounds: 21, arrows: 1512, perArrow: 9.12 },
	{ key: 'light', rounds: 14, arrows: 1008, perArrow: 8.74 },
	{ key: 'strong', rounds: 6, arrows: 432, perArrow: 8.21 }
];

/** Two earned and one still to come, so the locked state is on the page as well as the earned one. */
export const SAMPLE_BADGES: EarnedBadge[] = (
	[
		['fftaWhite', 1_763_000_000_000, null],
		['fftaBlack', 1_771_000_000_000, null],
		['fftaBlue', 1_776_000_000_000, null],
		['fftaRed', null, { current: 264, target: 280 }]
	] as const
).map(([key, earnedAt, progress]) => ({
	definition: BADGES.find((badge) => badge.key === key)!,
	earnedAt,
	progress
}));

export const SAMPLE_EXERCISE = EXERCISES.find((entry) => entry.key === 'bandPullApart')!;

/**
 * One outing, laid out the way the app lays one out: a goal to shoot against, the weather it was
 * shot in, the arrows that belong to no round, and everything done that day. The kinds are the
 * point of the list, so it holds a round, a tuning, a strength set and a run rather than four
 * rounds.
 */
export interface SampleActivity {
	kind: 'scoring' | 'tuning' | 'other';
	icon: IconName;
	/** The tuning drawing the app puts on the row, which names the test better than a wrench does. */
	diagram?: DiagramName;
	/** A dictionary key where the app already has the words, so the list speaks both languages. */
	titleKey?: string;
	title?: string;
	detailKey?: string;
	detail?: string;
	score?: number;
}

export const SESSION = {
	/** Arrows the listed activities account for. The training count is added on top, live. */
	roundArrows: 221,
	goal: 300,
	trainingArrows: 24,
	temperature: '14°',
	wind: '12 km/h',
	activities: [
		{
			kind: 'scoring',
			icon: 'target',
			title: 'WA 720 (70m)',
			detail: '72 · 12 × 6',
			score: 648
		},
		{
			kind: 'tuning',
			icon: 'wrench',
			diagram: 'bowStrength',
			titleKey: 'tuning.template.weight-ratio',
			detailKey: 'tuning.title'
		},
		{
			kind: 'other',
			icon: 'exercise',
			titleKey: 'exercises.item.bandPullApart.name',
			detail: '3 × 15'
		},
		{ kind: 'other', icon: 'run', titleKey: 'exercises.activity.running', detail: '5.2 km · 27 min' }
	] as SampleActivity[],
	/** What the mass to draw weight test was set up with. Editable on the screen, as in the app. */
	tuning: { massGrams: 2660, drawWeightLb: 38 }
};

/** Ends already on the card when the scoring screen is opened, so it opens part way through a round. */
export const SCORED_ENDS: Shot[][] = [
	['10', '9', '9', '9', '8', '8'],
	['X', '10', '9', '9', '9', '7'],
	['10', '10', '9', '9', '8', '8']
].map((labels) =>
	labels.map((label, i) => {
		const zone = WA_10_RING.zones.find((entry) => entry.label === label)!;
		return {
			ordinal: i + 1,
			value: zone.value,
			zoneLabel: zone.label,
			x: null,
			y: null,
			source: 'manual'
		} satisfies Shot;
	})
);
