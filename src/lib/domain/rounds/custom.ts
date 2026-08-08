import type { LengthUnit, RoundDefinition } from './types';
import { WA_10_RING } from './seed';

export interface CustomRoundInput {
	name?: string;
	ends: number;
	arrowsPerEnd: number;
	faceSize: number;
	distance: number;
	unit: LengthUnit;
}

/** Typical values, so the pickers offer what archers actually shoot rather than every integer. */
export const FACE_SIZES = [40, 60, 80, 122];
export const DISTANCES_M = [5, 10, 15, 18, 20, 25, 30, 40, 50, 60, 70, 90];
export const DISTANCES_YD = [10, 15, 20, 30, 40, 50, 60, 80, 100];
export const END_COUNTS = Array.from({ length: 30 }, (_, i) => i + 1);
export const ARROWS_PER_END = Array.from({ length: 12 }, (_, i) => i + 1);

export const CUSTOM_ROUND_LIMITS = {
	ends: { min: 1, max: 60 },
	arrowsPerEnd: { min: 1, max: 12 },
	faceSize: { min: 10, max: 200 },
	distance: { min: 1, max: 200 }
};

export function validateCustomRound(input: CustomRoundInput): string[] {
	const errors: string[] = [];
	const check = (value: number, key: keyof typeof CUSTOM_ROUND_LIMITS) => {
		const { min, max } = CUSTOM_ROUND_LIMITS[key];
		if (!Number.isFinite(value) || value < min || value > max) errors.push(key);
	};
	check(input.ends, 'ends');
	check(input.arrowsPerEnd, 'arrowsPerEnd');
	check(input.faceSize, 'faceSize');
	check(input.distance, 'distance');
	return errors;
}

export function defaultCustomName(input: CustomRoundInput): string {
	return `${input.distance}${input.unit} · ${input.faceSize}cm · ${input.ends}x${input.arrowsPerEnd}`;
}

/**
 * Custom rounds are ordinary RoundDefinitions, so the scoring engine, stats, and target rendering
 * treat them exactly like built-in ones.
 */
export function buildCustomRound(input: CustomRoundInput): RoundDefinition {
	return {
		id: crypto.randomUUID(),
		name: input.name?.trim() || defaultCustomName(input),
		discipline: 'custom',
		scoreSetId: WA_10_RING.id,
		isBuiltin: false,
		stages: [
			{
				distance: { value: input.distance, unit: input.unit },
				faceSize: input.faceSize,
				ends: input.ends,
				arrowsPerEnd: input.arrowsPerEnd
			}
		]
	};
}
