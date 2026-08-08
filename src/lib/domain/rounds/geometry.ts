import type { Shot, RoundDefinition, RoundStage, Zone, ScoreSet } from './types';

/**
 * Score a point in normalised face coordinates.
 *
 * Walks zones innermost -> outermost and returns the first containing zone, so
 * overlapping definitions resolve to the highest-value ring. Returns the miss
 * zone when nothing contains the point.
 */
export function scoreAt(scoreSet: ScoreSet, x: number, y: number): Zone {
	for (let i = scoreSet.zones.length - 1; i >= 0; i--) {
		const zone = scoreSet.zones[i];
		if (containsPoint(zone, x, y)) return zone;
	}
	return missZone(scoreSet);
}

export function containsPoint(zone: Zone, x: number, y: number): boolean {
	const { shape } = zone;
	if (shape.kind === 'circle') {
		const dx = x - (shape.cx ?? 0);
		const dy = y - (shape.cy ?? 0);
		return dx * dx + dy * dy <= shape.r * shape.r;
	}
	// Path zones (3D animal faces) need Path2D hit-testing, which is a browser
	// API rather than pure logic. Deliberately unimplemented until 3D faces land
	// in phase 2 — failing loudly beats silently scoring every shot as a miss.
	throw new Error(`Path zone hit-testing is not implemented yet (zone "${zone.label}")`);
}

export function missZone(scoreSet: ScoreSet): Zone {
	const miss = scoreSet.zones.find((z) => !z.countsAsHit);
	if (!miss) throw new Error(`Score set "${scoreSet.id}" defines no miss zone`);
	return miss;
}

/**
 * Scoring zones highest-value first, for the keypad. Excludes the miss zone,
 * which the UI renders separately and distinctly — a miss is a different kind of
 * outcome from a low score, and mixing it into the ring buttons invites mistaps.
 */
export function scorableZones(scoreSet: ScoreSet): Zone[] {
	return scoreSet.zones.filter((z) => z.countsAsHit).reverse();
}

/** The highest-scoring zone, used to compute a round's maximum. */
export function bestZone(scoreSet: ScoreSet): Zone {
	return scoreSet.zones.reduce((best, z) => (z.value > best.value ? z : best));
}

export function totalArrows(round: RoundDefinition): number {
	return round.stages.reduce((sum, s) => sum + s.ends * s.arrowsPerEnd, 0);
}

export function maxScore(round: RoundDefinition, scoreSet: ScoreSet): number {
	return totalArrows(round) * bestZone(scoreSet).value;
}

export function sumShots(shots: Shot[]): number {
	return shots.reduce((sum, s) => sum + s.value, 0);
}

export function countLabel(shots: Shot[], label: string): number {
	return shots.filter((s) => s.zoneLabel === label).length;
}

/** Flattened list of every end in a round, in shooting order. */
export interface EndSlot {
	stageIndex: number;
	endNo: number;
	arrows: number;
	stage: RoundStage;
}

export function endSlots(round: RoundDefinition): EndSlot[] {
	const slots: EndSlot[] = [];
	round.stages.forEach((stage, stageIndex) => {
		for (let endNo = 1; endNo <= stage.ends; endNo++) {
			slots.push({ stageIndex, endNo, arrows: stage.arrowsPerEnd, stage });
		}
	});
	return slots;
}

/**
 * Group metrics over plotted shots. Shots without coordinates are ignored,
 * which is why the sample size is returned alongside — a mean radius over two
 * arrows is noise, and the UI should say so.
 */
export interface GroupMetrics {
	sampleSize: number;
	/** Group centre offset from face centre. The number that drives sight moves. */
	centerX: number;
	centerY: number;
	/** Mean distance from the group's own centre. Measures the archer, not the sight. */
	meanRadius: number;
	horizontalSpread: number;
	verticalSpread: number;
}

export function groupMetrics(shots: Shot[]): GroupMetrics | null {
	const plotted = shots.filter(
		(s): s is Shot & { x: number; y: number } => s.x !== null && s.y !== null
	);
	if (plotted.length === 0) return null;

	const centerX = plotted.reduce((sum, s) => sum + s.x, 0) / plotted.length;
	const centerY = plotted.reduce((sum, s) => sum + s.y, 0) / plotted.length;
	const meanRadius =
		plotted.reduce((sum, s) => Math.hypot(s.x - centerX, s.y - centerY), 0) / plotted.length;

	const xs = plotted.map((s) => s.x);
	const ys = plotted.map((s) => s.y);

	return {
		sampleSize: plotted.length,
		centerX,
		centerY,
		meanRadius,
		horizontalSpread: Math.max(...xs) - Math.min(...xs),
		verticalSpread: Math.max(...ys) - Math.min(...ys)
	};
}
