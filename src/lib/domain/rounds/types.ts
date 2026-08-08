/**
 * Round and scoring domain types.
 * Pure by design: the renderer, the tap hit test, and the score calculation all read these same
 * definitions, so they cannot drift apart.
 */

export type Discipline = 'target' | 'field' | '3d' | 'clout' | 'custom';

export type LengthUnit = 'm' | 'yd';

/** Normalised face coordinates: a unit circle centred on the origin, so face size never matters. */
export type ZoneShape =
	| { kind: 'circle'; r: number; cx?: number; cy?: number }
	/** Ellipses cover 3D vitals, which are offset from the face centre and wider than they are tall. */
	| { kind: 'ellipse'; rx: number; ry: number; cx: number; cy: number }
	/** Arbitrary outlines, as a closed polygon in normalised face coordinates. */
	| { kind: 'polygon'; points: [number, number][] };

export interface Zone {
	value: number;
	/** Semantic result recorded on the shot: 10, X, M, vital. */
	label: string;
	shape: ZoneShape;
	/** Scores the same as the ring around it but breaks ties. */
	isInner?: boolean;
	countsAsHit: boolean;
	color: string;
	strokeColor: string;
}

export interface ScoreSet {
	id: string;
	name: string;
	/**
	 * True while the point values have not been checked against the governing body's current
	 * rulebook. The UI warns on these, because a wrong zone map corrupts scores silently.
	 */
	needsVerification?: boolean;
	/** Ordered outermost to innermost, so hit testing can walk backwards and take the first match. */
	zones: Zone[];
}

export interface RoundStage {
	/** Null for unmarked distance field and 3D courses, where the archer judges the distance. */
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
	/** Most rounds have one stage, a WA 1440 has four. */
	stages: RoundStage[];
	scoreSetId: string;
	governingBody?: string;
	isBuiltin: boolean;
}

export interface Shot {
	ordinal: number;
	value: number;
	zoneLabel: string;
	/** Normalised face coordinates, null when entered as a bare number. */
	x: number | null;
	y: number | null;
	/** Stats over vision derived shots deserve a caveat, so provenance is kept. */
	source: 'manual' | 'plotted' | 'vision';
}
