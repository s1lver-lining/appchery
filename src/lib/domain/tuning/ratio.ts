/**
 * The mass a bow carries for each pound it draws, which is what a stabiliser setup is really about:
 * too little and the bow will not hold still, too much and it cannot be held at all. Archers quote
 * it in grams per pound and aim at about 70.
 */

export const IDEAL_RATIO = 70;

/** How far from the ideal a reading is allowed to sit before it stops being comfortable. */
export const RATIO_BANDS = { good: 5, fair: 15, poor: 30 } as const;

export type RatioBand = 'good' | 'fair' | 'poor';

/** The ends of the scale the point is drawn on: past these it sits on the edge rather than off it. */
export const RATIO_MIN = IDEAL_RATIO - RATIO_BANDS.poor;
export const RATIO_MAX = IDEAL_RATIO + RATIO_BANDS.poor;

export function ratioOf(massGrams: number, drawWeightLb: number): number | null {
	if (!(massGrams > 0) || !(drawWeightLb > 0)) return null;
	return massGrams / drawWeightLb;
}

/** Which band a reading falls in. Anything past the far band reads as poor, however far past. */
export function bandOf(ratio: number): RatioBand {
	const off = Math.abs(ratio - IDEAL_RATIO);
	if (off <= RATIO_BANDS.good) return 'good';
	if (off <= RATIO_BANDS.fair) return 'fair';
	return 'poor';
}

/** Where the reading sits along the scale, 0 to 1, clamped so an extreme value stays on the bar. */
export function positionOf(ratio: number): number {
	const at = (ratio - RATIO_MIN) / (RATIO_MAX - RATIO_MIN);
	return Math.min(1, Math.max(0, at));
}
