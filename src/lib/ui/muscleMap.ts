import type { MuscleId } from '$lib/domain/muscles';

/**
 * The shapes the muscle figure is drawn from.
 *
 * Each shape is a handful of control points rather than a traced curve, and the curve is worked out
 * from them: a closed Catmull-Rom spline, which passes through every point it is given and rounds
 * off what lies between. That buys the soft anatomical edges without a thousand hand-tuned bézier
 * handles, and it leaves the geometry as numbers a test can read — which matters, because two
 * regions that overlap steal each other's taps. The one drawn later wins and the one under it
 * becomes unreachable however carefully an archer aims a thumb.
 */

export type Region = { id: MuscleId; points: number[][] };

/**
 * The whole archer as one outline, traced down the right side: head, neck, out over the shoulder,
 * down the outside of the arm, round the hand, back up its inside to the armpit, then down the ribs
 * and the leg and up the inner leg to where the two halves meet.
 *
 * The armpit is the reason this is hard. The trace folds back on itself there, and a curve run
 * through a fold ties itself in a knot, which is why the arms were once shapes of their own. The
 * answer is not to split the body but to tell the curve where the body actually has a corner.
 */
export const BODY_HALF = [
	[100, 10], [110, 14], [116, 27], [114, 41], [109, 50],
	[108, 60], [113, 68],
	[131, 71], [148, 77],
	// The deltoid: the shoulder is where an archer's outline should look like it draws a bow, so the
	// line runs out almost level from the neck and then swells before it turns down into the arm.
	[159, 85], [166, 97], [167, 112],
	[166, 128], [165, 145], [165, 159],
	[169, 176], [170, 196], [166, 212],
	[170, 222], [166, 236], [157, 236],
	[155, 222], [152, 206], [150, 186], [149, 166],
	[148, 152], [146, 134], [144, 118],
	[141, 104],
	[139, 112], [139, 130], [133, 152], [131, 164],
	[136, 180], [142, 196], [145, 210],
	[142, 234], [135, 262], [128, 288],
	[130, 306], [132, 324], [126, 348], [117, 366],
	[114, 378], [129, 383], [130, 388],
	[102, 388], [103, 354], [108, 308], [107, 266], [101, 230], [100, 216]
];

/**
 * Where the outline turns a corner instead of curving through one. Only the armpit: everywhere else
 * a body is round, and a corner drawn anywhere it does not belong reads as a crease in the skin.
 */
const HALF_CORNERS = [29];

/**
 * Muscles that lie on top of each other in a real body are laid out side by side here, so both can
 * be tapped: the rhomboids sit beside the mid trapezius rather than beneath it. Order is paint
 * order, and paint order is tap order.
 */
export const BACK: Region[] = [
	// The spinal column goes down first: everything else on the back lies over it.
	{ id: 'erectorSpinae', points: [[101,102],[109,105],[112,138],[111,172],[107,196],[101,196]] },
	{ id: 'trapeziusUpper', points: [[100,62],[109,68],[128,74],[151,84],[141,96],[119,87],[103,77]] },
	{ id: 'rhomboids', points: [[111,96],[126,102],[131,116],[129,126],[111,122]] },
	{ id: 'trapeziusMid', points: [[132,102],[139,103],[137,114],[135,124],[132,122]] },
	// The lower trapezius lies over the top of the latissimus, so it is painted after it.
	{ id: 'latissimus', points: [[112,130],[133,134],[137,124],[131,150],[126,166],[120,180],[112,178]] },
	{ id: 'trapeziusLower', points: [[111,128],[123,132],[120,148],[114,164],[111,160]] },
	{ id: 'teresMajor', points: [[128,118],[137,121],[136,131],[130,134],[126,126]] },
	{ id: 'glutes', points: [[104,208],[120,210],[136,216],[140,230],[134,244],[117,248],[106,246]] },
	{ id: 'hamstrings', points: [[110,254],[125,252],[132,264],[127,288],[124,304],[116,308],[112,300]] },
	{ id: 'calves', points: [[112,318],[122,316],[128,330],[125,346],[119,358],[113,354],[111,336]] },
	// The deltoid sits on the shoulder cap, where the arm and the trunk are one piece of body.
	{ id: 'deltoidPosterior', points: [[137,82],[151,85],[163,96],[165,114],[155,121],[145,110],[136,94]] },
	{ id: 'triceps', points: [[147,122],[159,126],[161,140],[157,158],[151,158],[147,140]] },
	{ id: 'forearmExtensors', points: [[152,172],[161,175],[164,186],[160,200],[156,208],[153,198],[152,184]] }
];

export const FRONT: Region[] = [
	// The pectoral reaches out to the deltoid and stops where it starts: on a body they are joined,
	// and a gap between them draws a seam across the front of a shoulder that has none.
	{ id: 'pectoralisMajor', points: [[101,82],[118,84],[132,89],[138,99],[136,112],[122,118],[108,118],[101,116]] },
	{ id: 'serratusAnterior', points: [[128,120],[136,123],[136,136],[130,140],[126,130]] },
	{ id: 'rectusAbdominis', points: [[101,122],[115,124],[120,148],[119,172],[113,188],[101,188]] },
	{ id: 'obliques', points: [[121,140],[128,148],[126,166],[122,182],[116,178],[117,152]] },
	{ id: 'quadriceps', points: [[106,212],[123,214],[133,228],[129,264],[123,292],[116,298],[112,288]] },
	{ id: 'deltoidAnterior', points: [[137,82],[149,85],[155,96],[153,111],[147,108],[139,97]] },
	{ id: 'deltoidLateral', points: [[150,85],[163,96],[165,114],[157,123],[153,106]] },
	{ id: 'biceps', points: [[148,124],[159,128],[160,144],[156,158],[150,157],[147,140]] },
	{ id: 'forearmFlexors', points: [[152,172],[161,175],[163,188],[159,202],[155,208],[153,198],[153,184]] }
];

export const mirror = (points: number[][]) => points.map(([x, y]) => [200 - x, y]);

/** The body closed: the traced half, then the other half read back the way it came. */
export const BODY_LOOP = [...BODY_HALF, ...mirror(BODY_HALF).reverse()];

/** The same corners, found again in the mirrored half, which runs backwards. */
const CORNERS = new Set([
	...HALF_CORNERS,
	...HALF_CORNERS.map((index) => BODY_LOOP.length - 1 - index)
]);


/**
 * How tightly the curve hugs its control points. Below one it slackens towards straight lines;
 * much above and the curve bows out past the points and a muscle spills over its neighbour.
 */
const TENSION = 0.9;

type Segment = { c1: number[]; c2: number[]; end: number[] };

/**
 * The closed spline through `points`, one cubic per gap between them. A point named in `corners`
 * gets no handle: the curve arrives at it and leaves it straight, which is what makes a sharp
 * armpit instead of a loop where the outline folds back on itself.
 */
function segments(points: number[][], corners?: Set<number>): Segment[] {
	const n = points.length;
	return points.map((p1, i) => {
		const p0 = points[(i - 1 + n) % n];
		const p2 = points[(i + 1) % n];
		const p3 = points[(i + 2) % n];
		const next = (i + 1) % n;
		return {
			c1: corners?.has(i)
				? p1
				: [p1[0] + ((p2[0] - p0[0]) / 6) * TENSION, p1[1] + ((p2[1] - p0[1]) / 6) * TENSION],
			c2: corners?.has(next)
				? p2
				: [p2[0] - ((p3[0] - p1[0]) / 6) * TENSION, p2[1] - ((p3[1] - p1[1]) / 6) * TENSION],
			end: p2
		};
	});
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A closed smooth outline through the given points, as an SVG path. */
export function smooth(points: number[][], corners?: Set<number>): string {
	const body = segments(points, corners)
		.map(
			({ c1, c2, end }) =>
				`C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(end[0])} ${round(end[1])}`
		)
		.join('');
	return `M${points[0][0]} ${points[0][1]}${body}Z`;
}

/**
 * The curve itself, as points. Tests read this rather than the control points: what an archer taps
 * is where the curve goes, and a spline can bow out well past the corners it was built from.
 */
export function sample(points: number[][], per = 10, corners?: Set<number>): number[][] {
	const out: number[][] = [];
	for (const { c1, c2, end } of segments(points, corners)) {
		const start = out.length === 0 ? points[0] : out[out.length - 1];
		for (let step = 1; step <= per; step++) {
			const t = step / per;
			const u = 1 - t;
			out.push([
				u * u * u * start[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
				u * u * u * start[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1]
			]);
		}
	}
	return out;
}

/** Whether a point is inside a polygon, by the usual count of crossings to the left of it. */
export function contains(polygon: number[][], [x, y]: number[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/** The archer's outline, corners and all: the one shape every muscle has to fit inside. */
export const BODY = smooth(BODY_LOOP, CORNERS);
export const bodyEdge = () => sample(BODY_LOOP, 10, CORNERS);

/**
 * The same archer with the arms left off, for the figure that poses them somewhere else: drawn with
 * the hanging arms still on, it grows a second pair. It is cut from the same outline rather than
 * drawn again, so the head, the trunk and the legs stay the body the muscle map draws — only the
 * walk out along the arm is replaced by a shoulder rounding off into the armpit.
 */
const ARMPIT = BODY_HALF.findIndex(([x, y]) => x === 141 && y === 104);
const TRUNK_HALF = [
	...BODY_HALF.slice(0, 10),
	[164, 97],
	[155, 108],
	...BODY_HALF.slice(ARMPIT + 1)
];
export const TRUNK = smooth([...TRUNK_HALF, ...mirror(TRUNK_HALF).reverse()]);

/** The middle of a region, which is where a thumb aiming at it lands and where a test taps. */
export function centroid(points: number[][]): number[] {
	const sum = points.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
	return [sum[0] / points.length, sum[1] / points.length];
}
