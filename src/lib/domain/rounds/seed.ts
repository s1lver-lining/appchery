import type { RoundDefinition, ScoreSet, Zone } from './types';
import { FIELD_SCORE_SETS, FIELD_ROUNDS } from './field';

/**
 * Curated built-in rounds. Scoring data is rules data: verify any addition against the governing
 * body's current published rulebook, because a wrong zone map corrupts scores silently.
 */

function ring(value: number, label: string, r: number, color: string, strokeColor: string): Zone {
	return { value, label, shape: { kind: 'circle', r }, countsAsHit: true, color, strokeColor };
}

const GOLD = '#ffcf3f';
const RED = '#e8453c';
const BLUE = '#3aa0d8';
const BLACK = '#23282c';
const WHITE = '#f4f1ea';

/**
 * Ten equal-width rings, so ring N sits at radius (11 - N)/10 and the X ring is half the 10 ring.
 * As fractions this is identical for a 122cm and a 40cm face, which is why coordinates are normalised.
 */
export const WA_10_RING: ScoreSet = {
	id: 'wa-10-ring',
	name: 'WA 10-ring',
	zones: [
		{
			value: 0,
			label: 'M',
			shape: { kind: 'circle', r: Number.POSITIVE_INFINITY },
			countsAsHit: false,
			color: 'transparent',
			strokeColor: '#888888'
		},
		ring(1, '1', 1.0, WHITE, BLACK),
		ring(2, '2', 0.9, WHITE, BLACK),
		ring(3, '3', 0.8, BLACK, WHITE),
		ring(4, '4', 0.7, BLACK, WHITE),
		ring(5, '5', 0.6, BLUE, BLACK),
		ring(6, '6', 0.5, BLUE, BLACK),
		ring(7, '7', 0.4, RED, BLACK),
		ring(8, '8', 0.3, RED, BLACK),
		ring(9, '9', 0.2, GOLD, BLACK),
		ring(10, '10', 0.1, GOLD, BLACK),
		{ ...ring(10, 'X', 0.05, GOLD, BLACK), isInner: true }
	]
};

export const SCORE_SETS: ScoreSet[] = [WA_10_RING, ...FIELD_SCORE_SETS];

export const ROUNDS: RoundDefinition[] = [
	{
		id: 'wa720-70m',
		name: 'WA 720 (70m)',
		discipline: 'target',
		governingBody: 'WA',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [{ distance: { value: 70, unit: 'm' }, faceSize: 122, ends: 12, arrowsPerEnd: 6 }]
	},
	{
		id: 'wa-indoor-18m',
		name: 'WA Indoor 18m',
		discipline: 'target',
		governingBody: 'WA',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [{ distance: { value: 18, unit: 'm' }, faceSize: 40, ends: 20, arrowsPerEnd: 3 }]
	}
];

/** Field and 3D rounds are listed apart, because their score sets still need rulebook checking. */
export const UNVERIFIED_ROUNDS: RoundDefinition[] = FIELD_ROUNDS;

export const ALL_ROUNDS: RoundDefinition[] = [...ROUNDS, ...FIELD_ROUNDS];

export function roundNeedsVerification(round: RoundDefinition): boolean {
	return getScoreSet(round.scoreSetId).needsVerification === true;
}

export function getRound(id: string): RoundDefinition | undefined {
	return ALL_ROUNDS.find((r) => r.id === id);
}

export function getScoreSet(id: string): ScoreSet {
	const set = SCORE_SETS.find((s) => s.id === id);
	if (!set) throw new Error(`Unknown score set "${id}"`);
	return set;
}
