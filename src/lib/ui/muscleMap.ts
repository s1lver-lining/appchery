import type { MuscleId } from '$lib/domain/muscles';

/**
 * The shapes the muscle figure is drawn from.
 *
 * Each shape is a handful of control points rather than a traced curve, and the curve is worked out
 * from them: a closed Catmull-Rom spline, which passes through every point it is given and rounds
 * off what lies between. That buys the soft anatomical edges without a thousand hand-tuned bézier
 * handles, and it leaves the geometry as numbers a test can read, which matters, because two
 * regions that overlap steal each other's taps. The one drawn later wins and the one under it
 * becomes unreachable however carefully an archer aims a thumb.
 */

export type Region = {
	id: MuscleId;
	points: number[][];
	/**
	 * Points the shape turns a corner on instead of curving through. Two muscles that share a border
	 * need it: a spline's curve between two points depends on the points either side of them, which
	 * differ in each shape, so a shared pair of ends still lets the two curves bow apart and overlap.
	 * Cornered, the shared run is drawn straight in both, and straight is the same in both.
	 */
	corners?: Set<number>;
};

/**
 * The whole archer as one outline, traced down the right side: head, neck, out over the shoulder,
 * down the outside of the arm, round the thumb and the fingers, back up the inside of the arm to
 * the armpit, then down the ribs and the leg and up the inner leg to where the two halves meet.
 *
 * The armpit is the reason this is hard. The trace folds back on itself there, and a curve run
 * through a fold ties itself in a knot, which is why the arms were once shapes of their own. The
 * answer is not to split the body but to tell the curve where the body actually has a corner.
 *
 * The hand hangs palm forward, which is how an anatomy plate stands: the thumb is on the outside,
 * so the front view shows palms and the back view shows knuckles. The figure would be easier to
 * draw with a mitten on the end of each arm, but then nothing in it says which way an arm is turned.
 */
export const BODY_HALF = [
	[100, 10], [110, 14], [116, 27], [114, 41], [109, 50],
	[108, 60], [113, 68],
	// The shoulder runs out almost level from the neck and then swells: it is an archer's shoulder.
	[131, 71], [148, 77], [159, 85], [166, 97], [167, 112],
	[166, 128], [164, 146], [164, 158],
	[170, 176], [170, 194], [166, 208],
	// The thumb, then the palm, then the fingers reaching down the thigh.
	[173, 214], [177, 222], [173, 230],
	[172, 240], [169, 254], [162, 260], [156, 256],
	[154, 242], [153, 226], [153, 212],
	[151, 198], [149, 180], [148, 164], [148, 152],
	[146, 134], [144, 118],
	[141, 104],
	[139, 112], [139, 130], [133, 152], [131, 164],
	[136, 180], [142, 196], [145, 210],
	[142, 234], [135, 262], [128, 288],
	[130, 306], [132, 324], [126, 348], [117, 366],
	[114, 378], [129, 383], [130, 388],
	[102, 388], [103, 354], [108, 308], [107, 266], [101, 230], [100, 216]
];

const at = (x: number, y: number) =>
	BODY_HALF.findIndex((point) => point[0] === x && point[1] === y);

/**
 * The stretches of outline a muscle can be asked to lie along. Naming them is what lets a muscle be
 * defined as "two units in from the edge of the thigh at this height" instead of as a number that
 * has to be re-guessed by hand every time the silhouette moves.
 */
const SHOULDER_TO_PALM = BODY_HALF.slice(at(159, 85), at(172, 240) + 1);
const PALM_TO_ARMPIT = BODY_HALF.slice(at(154, 242), at(141, 104) + 1);
const ARMPIT_TO_HIP = BODY_HALF.slice(at(141, 104), at(145, 210) + 1);
const HIP_TO_FOOT = BODY_HALF.slice(at(145, 210), at(130, 388) + 1);

/**
 * Where a stretch of outline sits at a given height. The stretches all run one way in y, so the
 * first crossing is the only crossing and a straight walk down the segments finds it.
 */
function edgeAt(edge: number[][], y: number): number {
	for (let i = 0; i < edge.length - 1; i++) {
		const [x1, y1] = edge[i];
		const [x2, y2] = edge[i + 1];
		if ((y >= y1 && y <= y2) || (y <= y1 && y >= y2)) {
			return y2 === y1 ? x1 : x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
		}
	}
	return edge[edge.length - 1][0];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A point tucked `inset` inside an outline that has the body on its left, such as a flank. */
const lat = (edge: number[][], y: number, inset: number) => [round(edgeAt(edge, y) - inset), y];
/** A point tucked `inset` inside an outline that has the body on its right, such as an inner arm. */
const med = (edge: number[][], y: number, inset: number) => [round(edgeAt(edge, y) + inset), y];

/**
 * Where the trapezius stops and the deltoid starts. On a body they meet along the spine of the
 * shoulder blade rather than leaving a gap, so the two shapes are given the same two points and the
 * seam between them is a shared edge instead of a stripe of bare skin.
 */
const ACROMION = [150, 80];
const SHOULDER_SEAM = [140, 96];

/**
 * Where the upper trapezius hands over to the lower one. They are the same muscle, so they meet
 * along a real border rather than butting corners: three shared points, given to both shapes, so
 * the two curves run together over a stretch instead of touching at a spot and overlapping either
 * side of it.
 */
const TRAP_SEAM = [
	[103, 88],
	[113, 94],
	[124, 100]
];

/**
 * And again where the neck band hands over to the yoke across the shoulders. It runs out along the
 * shoulder rather than across it: the upper trapezius is the strip along the top from the skull to
 * the point of the shoulder, and the middle is the band below it pulling the blade towards the spine.
 */
/** Where the infraspinatus hands over to the teres major, along the length the two of them share. */
const CUFF_SEAM = [
	[124, 138],
	[130, 122],
	[137, 113]
];

const NECK_SEAM = [
	[102, 70],
	[122, 76],
	[142, 82]
];

/** The same arrangement down the front, where the obliques meet the edge of the abdominals. */
const AB_SEAM = [
	[116, 126],
	[119, 148],
	[118, 172]
];

/**
 * Muscles that lie on top of each other in a real body are laid out side by side here, so both can
 * be tapped: the rhomboids sit beside the mid trapezius rather than beneath it. Order is paint
 * order, and paint order is tap order.
 */
export const BACK: Region[] = [
	// The spinal column goes down first: everything else on the back lies over it.
	{ id: 'erectorSpinae', points: [[101, 122], [107, 126], [109, 152], [108, 176], [104, 190], [101, 188]] },
	/*
	 * Paint order is depth order, and here it follows the body: teres major and the rhomboids lie
	 * against the ribs and the shoulder blade with everything else over them, and the latissimus
	 * tucks under the lower trapezius where the two meet. So they go down before it does.
	 */
		/*
	 * The infraspinatus and the teres major run down the back of the shoulder blade side by side, and
	 * they share the long edge between them. The infraspinatus is much the bigger of the two on a
	 * body; it is drawn to the same width here because the point is to say which is which, and two
	 * bands of a size are easier to tell apart than a band beside a slab.
	 */
	{ id: 'infraspinatus', points: [...[...CUFF_SEAM].reverse(), [117, 131], [123, 116], [130, 107]], corners: new Set([0, 1, 2]) },
	{ id: 'teresMajor', points: [...CUFF_SEAM, [138, 124], [132, 135], [126, 147]], corners: new Set([0, 1, 2]) },
	/*
	 * The rhomboids as the plate draws them: a broad band that is tall where it holds the spine and
	 * shallower where it reaches the shoulder blade, and it runs downhill on the way, so the two
	 * ends are square-ish and the shape between them is a leaning rectangle rather than an oval.
	 */
	{ id: 'rhomboids', points: [[102, 96], [118, 101], [133, 107], [133, 117], [117, 115], [102, 120]] },
	{
		id: 'latissimus',
		points: [
			[112, 132], [128, 140], lat(ARMPIT_TO_HIP, 146, 3), lat(ARMPIT_TO_HIP, 158, 3),
			lat(ARMPIT_TO_HIP, 168, 4), [120, 180], [112, 176]
		]
	},
	{
		// Narrow where it climbs to the seam, so the rhomboids under it are seen either side of it
		// rather than swallowed: below, it widens out to the spine where it actually inserts.
		id: 'trapeziusLower',
		points: [...TRAP_SEAM, [121, 112], [120, 142], [114, 166], [106, 158], [110, 118]],
		corners: new Set([0, 1, 2])
	},
	/*
	 * The trapezius runs from the base of the skull to the middle of the back, and it is one muscle
	 * the whole way. The band up the neck is the part that shrugs; the yoke across the shoulders is
	 * the part that draws. They meet along a shared border, as the yoke and the lower part do.
	 */
	{
		id: 'trapeziusMid',
		points: [...NECK_SEAM, ACROMION, SHOULDER_SEAM, ...[...TRAP_SEAM].reverse()],
		corners: new Set([0, 1, 2, 5, 6, 7])
	},
	{
		id: 'trapeziusUpper',
		points: [[100, 52], [105, 55], [107, 63], [116, 70], [132, 76], ...[...NECK_SEAM].reverse()],
		corners: new Set([5, 6, 7])
	},
	// The fan on the side of the hip, which holds the pelvis level while an archer stands on two feet
	// and does nothing else all day. Drawn first, with the bigger muscle over the back of it.
	{
		id: 'gluteusMedius',
		points: [[117, 200], [130, 204], lat(HIP_TO_FOOT, 212, 2), lat(HIP_TO_FOOT, 222, 2), [127, 218], [118, 210]]
	},
	{
		id: 'gluteusMaximus',
		points: [
			[104, 214], [120, 214], lat(HIP_TO_FOOT, 224, 2), lat(HIP_TO_FOOT, 234, 3),
			lat(HIP_TO_FOOT, 246, 4), [118, 252], [105, 250]
		]
	},
	{
		id: 'hamstrings',
		points: [
			[110, 256], [126, 254], lat(HIP_TO_FOOT, 266, 1), lat(HIP_TO_FOOT, 286, 2),
			[122, 300], [114, 302], [110, 282]
		]
	},
	{
		id: 'calves',
		points: [
			[112, 318], [123, 316], lat(HIP_TO_FOOT, 330, 1), lat(HIP_TO_FOOT, 346, 1),
			[119, 358], [113, 354], [111, 336]
		]
	},
	{
		id: 'deltoidPosterior',
		points: [
			ACROMION, lat(SHOULDER_TO_PALM, 90, 1), lat(SHOULDER_TO_PALM, 106, 1),
			lat(SHOULDER_TO_PALM, 120, 2), [148, 124],
			// Down the inside of the arm rather than straight back to the seam: a straight edge there
			// cuts the corner of the armpit, and the corner of the armpit is outside the body.
			med(PALM_TO_ARMPIT, 120, 4), med(PALM_TO_ARMPIT, 108, 4), SHOULDER_SEAM
		]
	},
	{
		id: 'triceps',
		points: [
			[148, 124], lat(SHOULDER_TO_PALM, 130, 2), lat(SHOULDER_TO_PALM, 146, 2),
			lat(SHOULDER_TO_PALM, 158, 3), med(PALM_TO_ARMPIT, 158, 2), med(PALM_TO_ARMPIT, 138, 1)
		]
	},
	{
		id: 'forearmExtensors',
		points: [
			med(PALM_TO_ARMPIT, 170, 2), lat(SHOULDER_TO_PALM, 178, 2), lat(SHOULDER_TO_PALM, 192, 2),
			lat(SHOULDER_TO_PALM, 204, 3), med(PALM_TO_ARMPIT, 204, 2), med(PALM_TO_ARMPIT, 184, 1)
		]
	}
];

export const FRONT: Region[] = [
	// Deepest first: the hip flexor runs from the lower spine, through the pelvis, to the top of the
	// thigh, and everything on the front of the body is in front of it.
	{ id: 'iliopsoas', points: [[104, 190], [116, 194], [123, 208], [119, 220], [110, 214], [103, 198]] },
	{
		id: 'rectusAbdominis',
		points: [[101, 120], [113, 122], ...AB_SEAM, [112, 190], [101, 190]],
		corners: new Set([2, 3, 4])
	},
	// Wide, because they are: the obliques wrap the whole flank from the lower ribs to the hip crest,
	// and drawn as a narrow strip beside the abdominals they look like a seam rather than a muscle.
	// They stop where the abdominals start, along the border the two of them share.
	{
		id: 'obliques',
		points: [
			...AB_SEAM, [126, 190], lat(ARMPIT_TO_HIP, 174, 3),
			lat(ARMPIT_TO_HIP, 156, 2), lat(ARMPIT_TO_HIP, 140, 2), [121, 128]
		],
		corners: new Set([0, 1, 2])
	},
	{ id: 'serratusAnterior', points: [[128, 122], lat(ARMPIT_TO_HIP, 126, 2), [136, 140], [130, 146], [126, 134]] },
	// The pectoral reaches out to the deltoid and stops where it starts: on a body they are joined,
	// and a gap between them draws a seam across the front of a shoulder that has none. It lies over
	// the abdominals and over the serratus, which is the order a chest, a stomach and a rib cage go.
	{
		id: 'pectoralisMajor',
		points: [
			[101, 82], [120, 84], [133, 89], [139, 100], lat(ARMPIT_TO_HIP, 116, 2),
			[126, 128], [110, 128], [101, 126]
		]
	},
	{
		id: 'quadriceps',
		points: [
			[106, 212], [124, 214], lat(HIP_TO_FOOT, 226, 2), lat(HIP_TO_FOOT, 254, 2),
			lat(HIP_TO_FOOT, 278, 2), [120, 292], [112, 292], [108, 272]
		]
	},
	// A strap down the outside of the hip, over the top of the thigh: superficial, so it goes last.
	{
		id: 'tensorFasciaeLatae',
		points: [[128, 212], lat(HIP_TO_FOOT, 216, 2), lat(HIP_TO_FOOT, 230, 2), [134, 244], [128, 236], [126, 220]]
	},
	{
		id: 'deltoidAnterior',
		points: [
			SHOULDER_SEAM, ACROMION, [155, 92], [153, 111], [147, 108], med(PALM_TO_ARMPIT, 114, 2)
		]
	},
	{
		id: 'deltoidLateral',
		points: [
			ACROMION, lat(SHOULDER_TO_PALM, 90, 1), lat(SHOULDER_TO_PALM, 106, 1),
			lat(SHOULDER_TO_PALM, 120, 2), [151, 118], [155, 92]
		]
	},
	{
		id: 'biceps',
		points: [
			[148, 126], lat(SHOULDER_TO_PALM, 132, 3), lat(SHOULDER_TO_PALM, 148, 3),
			lat(SHOULDER_TO_PALM, 158, 4), med(PALM_TO_ARMPIT, 158, 2), med(PALM_TO_ARMPIT, 140, 1)
		]
	},
	{
		id: 'forearmFlexors',
		points: [
			med(PALM_TO_ARMPIT, 170, 2), lat(SHOULDER_TO_PALM, 178, 3), lat(SHOULDER_TO_PALM, 192, 3),
			lat(SHOULDER_TO_PALM, 204, 4), med(PALM_TO_ARMPIT, 204, 2), med(PALM_TO_ARMPIT, 184, 1)
		]
	}
];

/**
 * The lines that make a hand a hand: the crease at the wrist, the knuckles, and the gaps between
 * the fingers. Drawn rather than cut out of the outline, because at this size four separate fingers
 * come out as a row of bumps nobody can read.
 */
export const HAND_LINES = [
	'M154 216 Q164 219 172 217',
	'M156 238 Q165 241 172 238',
	'M167 242 L165 258',
	'M162 243 L160 259',
	'M158 242 L157 257'
];

/**
 * The tendons the finger flexors pull on, running from the forearm across the palm into the fingers.
 * They are the reason the release is a relaxation: these let go, and nothing on the back of the arm
 * has to do anything for the string to leave. Not tappable: a tendon is not a muscle.
 */
export const FLEXOR_TENDONS = [
	'M158 200 Q160 224 166 250',
	'M156 200 Q157 224 161 252',
	'M154 202 Q154 226 157 251'
];

/** The same idea on the other side: what opens a hand, and what a release does not use. */
export const EXTENSOR_TENDONS = [
	'M162 200 Q164 224 167 249',
	'M159 201 Q160 225 162 251',
	'M156 202 Q156 226 158 252'
];

/** The whole hand, as one shape to aim a thumb at. Never painted: tendons are too thin to hit. */
export const PALM = [
	[166, 209], [174, 215], [177, 224], [172, 234],
	[170, 250], [162, 258], [156, 254], [154, 236], [153, 214]
];

/** The pad at the base of the thumb, which is what a bow hand rests its weight on. */
export const THENAR = [[168, 218], [174, 224], [172, 236], [165, 238], [163, 226]];

/**
 * Where the outline turns a corner instead of curving through one. Only the armpit: everywhere else
 * a body is round, and a corner drawn anywhere it does not belong reads as a crease in the skin.
 */
const HALF_CORNERS = [at(141, 104)];

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
 * drawn again, so the head, the trunk and the legs stay the body the muscle map draws: only the
 * walk out along the arm is replaced by a shoulder rounding off into the armpit.
 */
const TRUNK_HALF = [
	...BODY_HALF.slice(0, at(166, 97) + 1),
	[164, 104],
	[152, 108],
	...BODY_HALF.slice(at(141, 104) + 1)
];
export const TRUNK = smooth([...TRUNK_HALF, ...mirror(TRUNK_HALF).reverse()]);

/** The middle of a region, which is where a thumb aiming at it lands and where a test taps. */
export function centroid(points: number[][]): number[] {
	const sum = points.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
	return [sum[0] / points.length, sum[1] / points.length];
}
