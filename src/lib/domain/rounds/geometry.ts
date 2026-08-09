import type { Shot, RoundDefinition, RoundStage, Zone, ScoreSet } from './types';

export function scoreAt(scoreSet: ScoreSet, x: number, y: number): Zone {
	// Innermost first so overlapping definitions resolve to the higher value ring.
	for (let i = scoreSet.zones.length - 1; i >= 0; i--) {
		const zone = scoreSet.zones[i];
		if (containsPoint(zone, x, y)) return zone;
	}
	return missZone(scoreSet);
}

export function containsPoint(zone: Zone, x: number, y: number): boolean {
	const { shape } = zone;
	// Every test is inclusive, because an arrow touching the line scores the higher value.
	if (shape.kind === 'circle') {
		const dx = x - (shape.cx ?? 0);
		const dy = y - (shape.cy ?? 0);
		return dx * dx + dy * dy <= shape.r * shape.r;
	}
	if (shape.kind === 'ellipse') {
		const dx = (x - shape.cx) / shape.rx;
		const dy = (y - shape.cy) / shape.ry;
		return dx * dx + dy * dy <= 1;
	}
	return insidePolygon(shape.points, x, y);
}

/**
 * Ray casting, kept here rather than using Path2D so the scoring rules stay testable outside a
 * browser. Points on an edge count as inside, matching the line-cutting rule.
 */
export function insidePolygon(points: [number, number][], x: number, y: number): boolean {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const [xi, yi] = points[i];
		const [xj, yj] = points[j];
		if (onSegment(xi, yi, xj, yj, x, y)) return true;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function onSegment(xi: number, yi: number, xj: number, yj: number, x: number, y: number): boolean {
	const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
	if (Math.abs(cross) > 1e-9) return false;
	return (
		Math.min(xi, xj) - 1e-9 <= x &&
		x <= Math.max(xi, xj) + 1e-9 &&
		Math.min(yi, yj) - 1e-9 <= y &&
		y <= Math.max(yi, yj) + 1e-9
	);
}

export function missZone(scoreSet: ScoreSet): Zone {
	const miss = scoreSet.zones.find((z) => !z.countsAsHit);
	if (!miss) throw new Error(`Score set "${scoreSet.id}" defines no miss zone`);
	return miss;
}

/** Excludes the miss, which the keypad renders separately so a miss cannot be mistapped for a low score. */
export function scorableZones(scoreSet: ScoreSet): Zone[] {
	return scoreSet.zones.filter((z) => z.countsAsHit).reverse();
}

export function bestZone(scoreSet: ScoreSet): Zone {
	return scoreSet.zones.reduce((best, z) => (z.value > best.value ? z : best));
}

export function zoneByLabel(scoreSet: ScoreSet, label: string): Zone {
	const zone = scoreSet.zones.find((z) => z.label === label);
	if (!zone) throw new Error(`Score set "${scoreSet.id}" has no zone "${label}"`);
	return zone;
}

export function totalArrows(round: RoundDefinition): number {
	return round.stages.reduce((sum, s) => sum + s.ends * s.arrowsPerEnd, 0);
}

export function maxScore(round: RoundDefinition, scoreSet: ScoreSet): number {
	return totalArrows(round) * bestZone(scoreSet).value;
}

/**
 * Paper scoresheet order: highest first, with an X ahead of a plain ten. Both are worth ten, so
 * comparing on value alone left them interleaved.
 */
export function sortShotsDescending<T extends { value: number; zoneLabel: string }>(shots: T[]): T[] {
	return [...shots].sort((a, b) => b.value - a.value || rank(b.zoneLabel) - rank(a.zoneLabel));
}

function rank(label: string): number {
	return label === 'X' ? 1 : 0;
}

/**
 * How deep into its ring an arrow sits, as the ring value plus a tenth: an arrow that has just cut
 * the line reads x.1, one in the dead centre of the ring reads x.9. Archers use this to compare
 * groups that score the same, and it is what makes a plotted arrow more informative than a tapped one.
 *
 * The inner ten, the X, is not treated as a ring of its own here. It is a tie break, not a scoring
 * band, and splitting it gave two 10.1 to 10.9 ramps inside one gold: the whole ten ring is one
 * band, 10.1 at the nine line and 10.9 at the centre.
 *
 * Concentric circular faces only. A field animal or a polygon zone has no single radius to measure
 * against, so those return null and the caller shows the plain value.
 */
export function decimalScore(scoreSet: ScoreSet, x: number, y: number): number | null {
	const zone = scoreAt(scoreSet, x, y);
	if (!zone.countsAsHit) return null;

	const bands = scoreSet.zones.filter(
		(z) =>
			z.countsAsHit &&
			!z.isInner &&
			z.shape.kind === 'circle' &&
			Number.isFinite((z.shape as { r: number }).r)
	);
	if (bands.length < 2) return null;

	// An X sits inside the ten, so it is measured against the ten's own outer radius.
	const band = zone.isInner ? bands.find((z) => z.value === zone.value) : zone;
	const outer = band && band.shape.kind === 'circle' ? band.shape.r : undefined;
	if (outer === undefined || !Number.isFinite(outer)) return null;

	const radii = bands.map((z) => (z.shape as { r: number }).r).sort((a, b) => a - b);
	const inner = radii.filter((r) => r < outer).pop() ?? 0;
	if (outer <= inner) return null;

	const distance = Math.min(Math.max(Math.hypot(x, y), inner), outer);
	const depth = (outer - distance) / (outer - inner);
	// Kept inside .1 to .9 so a hairline cut never prints as a bare x.0, which reads as no depth at all.
	return zone.value + Math.min(0.9, Math.max(0.1, Math.round(depth * 10) / 10));
}

export function sumShots(shots: Shot[]): number {
	return shots.reduce((sum, s) => sum + s.value, 0);
}

export function countLabel(shots: Shot[], label: string): number {
	return shots.filter((s) => s.zoneLabel === label).length;
}

export interface EndSlot {
	stageIndex: number;
	endNo: number;
	arrows: number;
	stage: RoundStage;
}

/** Every end of a round flattened into shooting order. */
export function endSlots(round: RoundDefinition): EndSlot[] {
	const slots: EndSlot[] = [];
	round.stages.forEach((stage, stageIndex) => {
		for (let endNo = 1; endNo <= stage.ends; endNo++) {
			slots.push({ stageIndex, endNo, arrows: stage.arrowsPerEnd, stage });
		}
	});
	return slots;
}

export interface GroupMetrics {
	/** Returned so the UI can caveat a mean radius computed over two arrows. */
	sampleSize: number;
	/** Offset of the group from the face centre, the number that drives a sight move. */
	centerX: number;
	centerY: number;
	/** Spread around the group's own centre, which measures the archer rather than the sight. */
	meanRadius: number;
	horizontalSpread: number;
	verticalSpread: number;
	/** Widest gap between any two arrows, the figure archers quote as their group size. */
	diameter: number;
}

/** A round is finished once every arrow it defines has been entered, not by pressing a button. */
export function isRoundComplete(round: RoundDefinition | null, arrowsShot: number): boolean {
	if (!round) return false;
	const expected = totalArrows(round);
	return expected > 0 && arrowsShot >= expected;
}

/**
 * Convex hull of the plotted arrows, drawn as the group's perimeter. Monotone chain, so the result
 * is deterministic and needs no browser.
 */
export function groupHull(shots: Shot[]): [number, number][] {
	const points = shots
		.filter((s): s is Shot & { x: number; y: number } => s.x !== null && s.y !== null)
		.map((s) => [s.x, s.y] as [number, number])
		.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

	// Fewer than three arrows have no area, so the points themselves are the whole outline.
	if (points.length < 3) return points;

	const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

	const build = (source: [number, number][]) => {
		const chain: [number, number][] = [];
		for (const point of source) {
			while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0)
				chain.pop();
			chain.push(point);
		}
		chain.pop();
		return chain;
	};

	return [...build(points), ...build([...points].reverse())];
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

	let diameter = 0;
	for (let i = 0; i < plotted.length; i++)
		for (let j = i + 1; j < plotted.length; j++)
			diameter = Math.max(diameter, Math.hypot(plotted[i].x - plotted[j].x, plotted[i].y - plotted[j].y));

	return {
		diameter,
		sampleSize: plotted.length,
		centerX,
		centerY,
		meanRadius,
		horizontalSpread: Math.max(...xs) - Math.min(...xs),
		verticalSpread: Math.max(...ys) - Math.min(...ys)
	};
}
