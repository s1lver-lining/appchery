/**
 * Round & scoring domain types.
 *
 * This module is pure: no database, no UI, no platform APIs. Everything here is
 * testable in isolation, and it is the single source of truth for what a round
 * *is*. The renderer, the tap hit-test and the score calculation all read these
 * same definitions, so they cannot drift apart.
 */

export type Discipline = 'target' | 'field' | '3d' | 'clout' | 'custom';

export type LengthUnit = 'm' | 'yd';

/**
 * Zone geometry lives in **normalised face coordinates**: the face is a unit
 * circle centred on (0, 0) with radius 1.0. This keeps a definition independent
 * of the physical face size, so one 10-ring definition serves a 40cm indoor face
 * and a 122cm 70m face alike.
 */
export type ZoneShape =
	| { kind: 'circle'; r: number; cx?: number; cy?: number }
	/** For 3D animal faces, where vitals are offset and not circular. */
	| { kind: 'path'; d: string };

export interface Zone {
	/** Points awarded. */
	value: number;
	/** Semantic result recorded on the shot: '10', 'X', 'M', 'vital'. */
	label: string;
	shape: ZoneShape;
	/** Inner-10 / X-ring: scores the same but breaks ties. */
	isInner?: boolean;
	/** False for a miss. */
	countsAsHit: boolean;
	/** Fill colour for rendering, as a CSS colour. */
	color: string;
	/** Contrasting colour for the ring line and any label drawn over this zone. */
	strokeColor: string;
}

export interface ScoreSet {
	id: string;
	name: string;
	/**
	 * Ordered outermost -> innermost. Hit-testing walks from the end so the
	 * innermost matching zone wins; rendering walks forward so inner zones paint
	 * on top.
	 */
	zones: Zone[];
}

export interface RoundStage {
	/** `null` for unmarked-distance field and 3D courses. */
	distance: { value: number; unit: LengthUnit } | null;
	/** Face diameter in cm. */
	faceSize: number;
	ends: number;
	arrowsPerEnd: number;
	label?: string;
}

export interface RoundDefinition {
	id: string;
	name: string;
	discipline: Discipline;
	/** Most rounds have one stage; a WA 1440 has four. */
	stages: RoundStage[];
	scoreSetId: string;
	governingBody?: string;
	isBuiltin: boolean;
}

/** A single arrow. */
export interface Shot {
	ordinal: number;
	value: number;
	zoneLabel: string;
	/** Normalised face coordinates. Null when entered as a bare number. */
	x: number | null;
	y: number | null;
	/** Provenance matters: stats over vision-derived shots deserve a caveat. */
	source: 'manual' | 'plotted' | 'vision';
}
