import type { RoundDefinition, ScoreSet, Zone } from './types';

/**
 * Curated built-in round definitions.
 *
 * ⚠️ Scoring data is rules data. Every value here must be checked against the
 * current published rulebook of the governing body before release — a wrong
 * zone map corrupts scores silently, and the archer only finds out when a
 * result is disputed. Field, IFAA, IBO and ASA score sets are deliberately NOT
 * included yet for exactly this reason; see `field.todo.md` in this folder.
 */

const GOLD = '#ffd94a';
const RED = '#f2453d';
const BLUE = '#4aa3df';
const BLACK = '#2b2b2b';
const WHITE = '#f7f7f7';

function ring(value: number, label: string, r: number, color: string, strokeColor: string): Zone {
	return { value, label, shape: { kind: 'circle', r }, countsAsHit: true, color, strokeColor };
}

/**
 * The World Archery 10-ring face. Ten equal-width rings, so ring N sits at
 * radius (11 - N)/10 of the face; the X-ring is half the 10-ring.
 *
 * Expressed as fractions, this is identical for a 122cm, 80cm, 60cm or 40cm
 * face — which is the whole point of normalised coordinates.
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
			strokeColor: '#888'
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

export const SCORE_SETS: ScoreSet[] = [WA_10_RING];

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
		id: 'wa720-60m',
		name: 'WA 720 (60m)',
		discipline: 'target',
		governingBody: 'WA',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [{ distance: { value: 60, unit: 'm' }, faceSize: 122, ends: 12, arrowsPerEnd: 6 }]
	},
	{
		id: 'wa720-50m-compound',
		name: 'WA 720 (50m, 80cm face)',
		discipline: 'target',
		governingBody: 'WA',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [{ distance: { value: 50, unit: 'm' }, faceSize: 80, ends: 12, arrowsPerEnd: 6 }]
	},
	{
		id: 'wa-indoor-18m',
		name: 'WA Indoor 18m',
		discipline: 'target',
		governingBody: 'WA',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [{ distance: { value: 18, unit: 'm' }, faceSize: 40, ends: 20, arrowsPerEnd: 3 }]
	},
	{
		id: 'portsmouth',
		name: 'Portsmouth',
		discipline: 'target',
		governingBody: 'AGB',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [{ distance: { value: 20, unit: 'yd' }, faceSize: 60, ends: 20, arrowsPerEnd: 3 }]
	},
	{
		id: 'wa1440-men',
		name: 'WA 1440 (men)',
		discipline: 'target',
		governingBody: 'WA',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [
			{ distance: { value: 90, unit: 'm' }, faceSize: 122, ends: 6, arrowsPerEnd: 6 },
			{ distance: { value: 70, unit: 'm' }, faceSize: 122, ends: 6, arrowsPerEnd: 6 },
			{ distance: { value: 50, unit: 'm' }, faceSize: 80, ends: 6, arrowsPerEnd: 6 },
			{ distance: { value: 30, unit: 'm' }, faceSize: 80, ends: 6, arrowsPerEnd: 6 }
		]
	},
	{
		id: 'wa1440-women',
		name: 'WA 1440 (women)',
		discipline: 'target',
		governingBody: 'WA',
		scoreSetId: WA_10_RING.id,
		isBuiltin: true,
		stages: [
			{ distance: { value: 70, unit: 'm' }, faceSize: 122, ends: 6, arrowsPerEnd: 6 },
			{ distance: { value: 60, unit: 'm' }, faceSize: 122, ends: 6, arrowsPerEnd: 6 },
			{ distance: { value: 50, unit: 'm' }, faceSize: 80, ends: 6, arrowsPerEnd: 6 },
			{ distance: { value: 30, unit: 'm' }, faceSize: 80, ends: 6, arrowsPerEnd: 6 }
		]
	}
];

export function getRound(id: string): RoundDefinition | undefined {
	return ROUNDS.find((r) => r.id === id);
}

export function getScoreSet(id: string): ScoreSet {
	const set = SCORE_SETS.find((s) => s.id === id);
	if (!set) throw new Error(`Unknown score set "${id}"`);
	return set;
}
