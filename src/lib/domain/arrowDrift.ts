export interface PlottedArrow {
	/** The number the arrow was called in, which is the number written on the shaft. */
	ordinal: number;
	x: number;
	y: number;
}

export interface ArrowDrift {
	ordinal: number;
	/** How far its own centre sits from the centre of the others, in face radii. */
	offset: number;
	/** Where it lands, in the words an archer would use at the boss: `highLeft`, `low`, `right`. */
	direction: string;
	/** Plots the reading is made from, so the card can say how much it is standing on. */
	shots: number;
}

/** Three plots is the fewest that can show a direction rather than a pair of accidents. */
const MIN_SHOTS = 3;
/** Below this the other arrows are too few to be a reference worth measuring against. */
const MIN_OTHERS = 8;
/** A full ring on a ten ring face. Anything tighter is not worth pulling a shaft out of a quiver. */
const MIN_OFFSET = 0.1;
/** Separation of the two means in standard errors. Deliberately strict: this accuses a shaft. */
const MIN_T = 4;
/**
 * How much wider than the rest the suspect arrow's own group may be. An arrow that sprays is a
 * loose arrow, not a consistent one, and saying it lands left would be inventing a pattern.
 */
const MAX_SPREAD_RATIO = 1.5;
/** How far outside the natural scatter of the group the gap has to sit before it is a gap. */
const SPREAD_MARGIN = 1.25;

function mean(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample variance, over n-1: the shots are a sample of what that arrow does, not all of it. */
function variance(values: number[]): number {
	if (values.length < 2) return 0;
	const centre = mean(values);
	return values.reduce((sum, value) => sum + (value - centre) ** 2, 0) / (values.length - 1);
}

function spread(points: PlottedArrow[]): number {
	const cx = mean(points.map((p) => p.x));
	const cy = mean(points.map((p) => p.y));
	return Math.sqrt(mean(points.map((p) => (p.x - cx) ** 2 + (p.y - cy) ** 2)));
}

const DIRECTIONS = [
	'right',
	'lowRight',
	'low',
	'lowLeft',
	'left',
	'highLeft',
	'high',
	'highRight'
];

/** Face coordinates run right and down, which is how the arrows are drawn and how they are read. */
function directionOf(dx: number, dy: number): string {
	const step = Math.PI / 4;
	const angle = Math.atan2(dy, dx);
	const index = Math.round(angle / step);
	return DIRECTIONS[((index % 8) + 8) % 8];
}

/**
 * The one arrow of a set that lands somewhere else. Read by comparing each numbered arrow against
 * every other arrow rather than against the middle of the target: an archer whose whole group is
 * left has a sight problem, not a shaft problem, and this must stay quiet about that.
 *
 * Every gate here exists to keep it quiet unless the arrow really is the odd one: enough plots of
 * it and of the rest, a gap worth a ring, a gap that survives the scatter around both means, the
 * suspect arrow grouping no worse than its fellows, and every one of its plots on the same side.
 */
export function driftingArrow(arrows: PlottedArrow[]): ArrowDrift | null {
	const byOrdinal = new Map<number, PlottedArrow[]>();
	for (const arrow of arrows) {
		const list = byOrdinal.get(arrow.ordinal);
		if (list) list.push(arrow);
		else byOrdinal.set(arrow.ordinal, [arrow]);
	}
	// With two numbers there is no telling which of them is the odd one: they are odd to each other.
	if (byOrdinal.size < 3) return null;

	let worst: (ArrowDrift & { t: number }) | null = null;

	for (const [ordinal, mine] of byOrdinal) {
		if (mine.length < MIN_SHOTS) continue;
		const others = arrows.filter((arrow) => arrow.ordinal !== ordinal);
		if (others.length < MIN_OTHERS) continue;

		const centre = { x: mean(others.map((a) => a.x)), y: mean(others.map((a) => a.y)) };
		const dx = mean(mine.map((a) => a.x)) - centre.x;
		const dy = mean(mine.map((a) => a.y)) - centre.y;
		const offset = Math.hypot(dx, dy);
		if (offset < MIN_OFFSET) continue;

		// Measured along the line between the two centres: an arrow that is left is not also high.
		const ux = dx / offset;
		const uy = dy / offset;
		const project = (arrow: PlottedArrow) => (arrow.x - centre.x) * ux + (arrow.y - centre.y) * uy;
		const projectedMine = mine.map(project);
		const projectedOthers = others.map(project);

		const spreadOthers = spread(others);
		// A group nobody would call a group cannot say that one arrow of it is out.
		if (offset < SPREAD_MARGIN * spreadOthers) continue;
		if (spread(mine) > MAX_SPREAD_RATIO * spreadOthers) continue;
		// Not one plot of it falls back among the others, which is what makes it the arrow and not the shot.
		if (!projectedMine.every((value) => value > mean(projectedOthers))) continue;

		const error = Math.sqrt(
			variance(projectedMine) / projectedMine.length +
				variance(projectedOthers) / projectedOthers.length
		);
		// Two perfect groups a ring apart: no scatter to divide by, and nothing left to doubt.
		const t = error === 0 ? Infinity : (mean(projectedMine) - mean(projectedOthers)) / error;
		if (t < MIN_T) continue;

		if (!worst || t > worst.t)
			worst = { ordinal, offset, direction: directionOf(dx, dy), shots: mine.length, t };
	}

	return worst ? { ordinal: worst.ordinal, offset: worst.offset, direction: worst.direction, shots: worst.shots } : null;
}
