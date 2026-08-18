import { BADGES, type EarnedBadge } from '$lib/domain/badges';
import { EXERCISES } from '$lib/domain/exercises';
import { WA_10_RING } from '$lib/domain/rounds/seed';
import type { Shot } from '$lib/domain/rounds/types';
import type { Band, ProgressionPoint, ValueCount, VolumeBucket } from '$lib/domain/stats';

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
	{ key: 'breeze', rounds: 14, arrows: 1008, perArrow: 8.74 },
	{ key: 'strong', rounds: 6, arrows: 432, perArrow: 8.21 }
];

export const VOLUME: VolumeBucket[] = [
	[288, 0], [360, 0], [216, 144], [432, 0], [288, 216], [504, 0], [396, 288], [324, 144]
].map(([practice, competition], i) => ({
	at: START + i * 7 * DAY,
	arrows: practice + competition,
	rounds: Math.round((practice + competition) / 72),
	perArrow: 8.6 + i * 0.06,
	byKey: {
		practice: { arrows: practice, rounds: Math.round(practice / 72) },
		competition: { arrows: competition, rounds: Math.round(competition / 72) }
	}
}));

export const VOLUME_KEYS = ['practice', 'competition'];

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
