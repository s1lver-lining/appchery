import type { RoundDefinition, ScoreSet, Zone } from './types';

/**
 * Field, IFAA and 3D scoring.
 *
 * ⚠️ The sets still carrying `needsVerification` were written from general knowledge of the
 * disciplines, NOT transcribed from a rulebook, and the organisations revise them between editions.
 * The app shows a warning on any round using one of those, and the flag comes off a set only once
 * every value in it has been read out of the current published rulebook.
 * See doc/scoring-verification.md for what was checked, against which edition, and what is left.
 */

const GOLD = '#ffcf3f';
const RED = '#e8453c';
const BLACK = '#23282c';
const WHITE = '#f4f1ea';
const OLIVE = '#7d8a5c';
const TAN = '#c8a678';

function miss(): Zone {
	return {
		value: 0,
		label: 'M',
		shape: { kind: 'circle', r: Number.POSITIVE_INFINITY },
		countsAsHit: false,
		color: 'transparent',
		strokeColor: '#888888'
	};
}

function ring(value: number, label: string, r: number, color: string, strokeColor: string): Zone {
	return { value, label, shape: { kind: 'circle', r }, countsAsHit: true, color, strokeColor };
}

/**
 * Six concentric rings, the inner spot scoring the same as the ring around it and breaking ties.
 * Values and colours are World Archery's: the two yellow rings score six and five, the four black
 * ones four down to one. The ring widths are still assumed equal, which is why the set stays
 * flagged: Book 4 publishes the face as a drawing, not as a table of diameters.
 */
export const WA_FIELD: ScoreSet = {
	id: 'wa-field-6',
	name: 'WA field (6 zone)',
	needsVerification: true,
	zones: [
		miss(),
		ring(1, '1', 1.0, BLACK, WHITE),
		ring(2, '2', 0.833, BLACK, WHITE),
		ring(3, '3', 0.667, BLACK, WHITE),
		ring(4, '4', 0.5, BLACK, WHITE),
		ring(5, '5', 0.333, GOLD, BLACK),
		ring(6, '6', 0.167, GOLD, BLACK),
		{ ...ring(6, 'X', 0.083, GOLD, BLACK), isInner: true }
	]
};

/**
 * The IFAA field face: a black spot inside a white ring inside a black outer ring, scoring five,
 * four and three. Verified against the IFAA Book of Rules 2019-2020, Article V.A, which publishes
 * the rings as diameters per face size: 4/12/20, 7/21/35, 10/30/50 and 13/39/65 cm, all of which
 * reduce to the same fractions of the face. The hunter face is the same layout in other colours.
 *
 * There is no inner spot: the rulebook scores five, four and three and nothing finer.
 */
export const IFAA_FIELD: ScoreSet = {
	id: 'ifaa-field-5',
	name: 'IFAA field (5-4-3)',
	zones: [
		miss(),
		ring(3, '3', 1.0, BLACK, WHITE),
		ring(4, '4', 0.6, WHITE, BLACK),
		ring(5, '5', 0.2, BLACK, WHITE)
	]
};

/**
 * 3D animal faces: the vitals sit forward of and above the body centre, which is why these are
 * ellipses rather than the concentric rings every target discipline uses.
 */
function animalZones(highest: number, secondary: number): Zone[] {
	return [
		miss(),
		{
			value: 5,
			label: '5',
			shape: {
				kind: 'polygon',
				// A coarse animal silhouette: enough to score against, not an illustration.
				points: [
					[-0.95, -0.25],
					[-0.55, -0.75],
					[-0.15, -0.6],
					[0.5, -0.55],
					[0.95, -0.1],
					[0.85, 0.5],
					[0.45, 0.9],
					[-0.4, 0.85],
					[-0.9, 0.35]
				]
			},
			countsAsHit: true,
			color: TAN,
			strokeColor: BLACK
		},
		{
			value: secondary,
			label: String(secondary),
			shape: { kind: 'ellipse', rx: 0.34, ry: 0.28, cx: -0.06, cy: -0.02 },
			countsAsHit: true,
			color: OLIVE,
			strokeColor: WHITE
		},
		{
			value: highest,
			label: String(highest),
			shape: { kind: 'ellipse', rx: 0.16, ry: 0.13, cx: -0.06, cy: -0.02 },
			countsAsHit: true,
			color: RED,
			strokeColor: WHITE
		}
	];
}

export const IBO_3D: ScoreSet = {
	id: 'ibo-3d',
	name: 'IBO 3D (11-10-8-5)',
	needsVerification: true,
	zones: [
		...animalZones(10, 8),
		{
			value: 11,
			label: '11',
			shape: { kind: 'ellipse', rx: 0.07, ry: 0.06, cx: -0.19, cy: -0.02 },
			countsAsHit: true,
			color: GOLD,
			strokeColor: BLACK,
			isInner: true
		}
	]
};

export const ASA_3D: ScoreSet = {
	id: 'asa-3d',
	name: 'ASA 3D (12-10-8-5)',
	needsVerification: true,
	zones: [
		...animalZones(10, 8),
		{
			value: 12,
			label: '12',
			shape: { kind: 'ellipse', rx: 0.07, ry: 0.06, cx: 0.06, cy: -0.02 },
			countsAsHit: true,
			color: GOLD,
			strokeColor: BLACK,
			isInner: true
		}
	]
};

export const FIELD_SCORE_SETS: ScoreSet[] = [WA_FIELD, IFAA_FIELD, IBO_3D, ASA_3D];

/** Courses are a number of targets shot as ends, so one unmarked stage describes them all. */
function course(
	id: string,
	name: string,
	discipline: 'field' | '3d',
	scoreSetId: string,
	governingBody: string,
	targets: number,
	arrowsPerTarget: number,
	marked: boolean,
	/** The face the round is listed under. A real course changes size with the peg distance. */
	faceSize = 60
): RoundDefinition {
	return {
		id,
		name,
		discipline,
		governingBody,
		scoreSetId,
		isBuiltin: true,
		stages: [
			{
				// Face size varies per peg on a real course, so this is the reference size only.
				distance: marked ? { value: 0, unit: 'm' } : null,
				faceSize,
				ends: targets,
				arrowsPerEnd: arrowsPerTarget
			}
		]
	};
}

export const FIELD_ROUNDS: RoundDefinition[] = [
	course('wa-field-24-unmarked', 'WA Field 24 (unmarked)', 'field', WA_FIELD.id, 'WA', 24, 3, false),
	course('wa-field-24-marked', 'WA Field 24 (marked)', 'field', WA_FIELD.id, 'WA', 24, 3, true),
	// Two standard units of fourteen targets, four arrows at each: IFAA Book of Rules 2019-2020, V.A.
	course('ifaa-field-28', 'IFAA Field 28', 'field', IFAA_FIELD.id, 'IFAA', 28, 4, true, 65),
	course('ibo-3d-20', 'IBO 3D 20 targets', '3d', IBO_3D.id, 'IBO', 20, 1, false),
	course('asa-3d-20', 'ASA 3D 20 targets', '3d', ASA_3D.id, 'ASA', 20, 1, false)
];
