import type { TrackedFix } from './track';

/**
 * The shape a run drew on the ground.
 *
 * No tiles and no basemap: the route alone says where you went, because the person reading it ran
 * it. What it is for is recognising the loop, seeing which way round it went and where it doubled
 * back, and none of that needs a street under it. It also means a finished run draws itself with no
 * network, nothing to attribute and nobody told where its owner runs.
 *
 * The projection is the simplest one that is true at the size of a run: longitude is squeezed by the
 * cosine of the latitude, which is what stops a five kilometre loop coming out stretched sideways,
 * and the curvature over those few kilometres is smaller than the line is thick.
 */

export interface RoutePoint {
	x: number;
	y: number;
}

export interface Route {
	points: RoutePoint[];
	/** The box the points were fitted into, which is what the drawing gives its viewBox. */
	width: number;
	height: number;
}

/**
 * Fitted into a box of the given size, keeping its shape: a route is a picture of somewhere real,
 * and one stretched to fill a box is a picture of somewhere else. The longer side takes the size and
 * the shorter one takes whatever it comes to.
 */
export function routeOf(fixes: { lat: number; lon: number }[], size = 100, pad = 4): Route | null {
	if (fixes.length < 2) return null;
	const lat0 = fixes[0].lat;
	const squeeze = Math.cos((lat0 * Math.PI) / 180);
	// North is up, so a latitude that grows has to draw upwards, which is a y that shrinks.
	const flat = fixes.map((fix) => ({ x: (fix.lon - fixes[0].lon) * squeeze, y: -(fix.lat - lat0) }));

	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const point of flat) {
		minX = Math.min(minX, point.x);
		maxX = Math.max(maxX, point.x);
		minY = Math.min(minY, point.y);
		maxY = Math.max(maxY, point.y);
	}
	const spanX = maxX - minX;
	const spanY = maxY - minY;
	const span = Math.max(spanX, spanY);
	// A run that never left the spot has no shape to draw, and dividing by its span is a divide by nothing.
	if (span <= 0) return null;

	const inner = size - pad * 2;
	const scale = inner / span;
	const width = spanX * scale + pad * 2;
	const height = spanY * scale + pad * 2;
	return {
		points: flat.map((point) => ({
			x: (point.x - minX) * scale + pad,
			y: (point.y - minY) * scale + pad
		})),
		width,
		height
	};
}

/** The route as one SVG path, which is the whole of what a drawing of it needs. */
export function pathOf(route: Route): string {
	return route.points
		.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
		.join('');
}

/**
 * Where a pace sits between the quick end of a run and the slow end of it, as a share.
 *
 * The ends are taken off first, for the same reason the graph's scale takes them off: a run has a
 * handful of samples that say half an hour a kilometre, and a scale drawn to fit those paints the
 * whole route one colour to leave room for four of them.
 */
export function paceBand(paces: (number | null)[], outliers = 0.05): { fast: number; slow: number } | null {
	const sorted = paces.filter((pace): pace is number => pace !== null && pace > 0).sort((a, b) => a - b);
	if (sorted.length < 2) return null;
	const at = (share: number) => sorted[Math.round(share * (sorted.length - 1))];
	const fast = at(outliers);
	const slow = at(1 - outliers);
	return slow > fast ? { fast, slow } : null;
}
