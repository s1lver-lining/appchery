/**
 * Storage is canonical metric everywhere. Display follows whatever archers
 * actually say, which is not internally consistent and does not need to be:
 * arrow length and brace height in inches, target distance in metres, arrow and
 * point mass in grains, draw weight in pounds.
 *
 * Keeping the split at the display boundary means no conversion ever touches
 * stored data, so a preference change cannot corrupt records.
 */

const MM_PER_INCH = 25.4;
const GRAIN_PER_GRAM = 15.4324;
const LB_PER_KG = 2.20462;

export const mmToInches = (mm: number): number => mm / MM_PER_INCH;
export const inchesToMm = (inches: number): number => inches * MM_PER_INCH;
export const gramsToGrains = (g: number): number => g * GRAIN_PER_GRAM;
export const grainsToGrams = (gr: number): number => gr / GRAIN_PER_GRAM;
export const kgToPounds = (kg: number): number => kg * LB_PER_KG;
export const poundsToKg = (lb: number): number => lb / LB_PER_KG;
export const metresToYards = (m: number): number => m * 1.09361;
export const yardsToMetres = (yd: number): number => yd / 1.09361;

/** Arrow lengths are quoted in quarter-inches; rounding elsewhere is misleading. */
export function formatArrowLength(mm: number): string {
	const inches = Math.round(mmToInches(mm) * 4) / 4;
	return `${inches}"`;
}

export function formatBraceHeight(mm: number): string {
	const inches = Math.round(mmToInches(mm) * 16) / 16;
	return `${inches}"`;
}

/** Distances keep the unit the round defines them in: a Portsmouth is 20yd, not 18.29m. */
export function formatDistance(value: number, unit: 'm' | 'yd'): string {
	return `${value}${unit}`;
}
