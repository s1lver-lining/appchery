import type { MuscleId } from '$lib/domain/muscles';

/**
 * The shapes the muscle figure is drawn from. They live here rather than in the component because
 * two regions that overlap steal each other's taps: the one drawn later wins, and the one under it
 * becomes unreachable however carefully an archer aims a thumb. That is a property of the numbers,
 * so the numbers are somewhere a test can read them.
 */

export type Region = { id: MuscleId; points: number[][] };

/**
 * Half a body. Each region is drawn once for the archer's left and mirrored about the midline for
 * the right, because a muscle is a pair and picking one means picking both. Muscles that lie on top
 * of each other in a real body are laid out side by side here, so both can be tapped: the rhomboids
 * sit beside the mid trapezius rather than beneath it.
 */
export const BACK: Region[] = [
	// The spinal column goes down first: everything else on the back lies over it.
	{ id: 'erectorSpinae', points: [[101,96],[108,96],[109,196],[101,196]] },
	{ id: 'trapeziusUpper', points: [[100,56],[118,64],[141,80],[126,90],[102,76]] },
	{ id: 'rhomboids', points: [[109,84],[123,92],[124,112],[109,108]] },
	{ id: 'trapeziusMid', points: [[124,90],[138,88],[134,110],[125,112]] },
	{ id: 'deltoidPosterior', points: [[141,78],[157,88],[159,110],[144,108],[136,92]] },
	// The lower trapezius lies over the top of the latissimus, so it is painted after it.
	{ id: 'latissimus', points: [[109,116],[133,126],[135,152],[120,172],[109,170]] },
	{ id: 'trapeziusLower', points: [[109,112],[126,116],[114,150],[109,148]] },
	{ id: 'teresMajor', points: [[124,113],[135,117],[134,131],[123,127]] },
	{ id: 'triceps', points: [[150,112],[164,118],[165,152],[152,152]] },
	{ id: 'forearmExtensors', points: [[152,158],[166,160],[169,204],[157,206]] },
	{ id: 'glutes', points: [[101,198],[131,201],[135,231],[101,234]] },
	{ id: 'hamstrings', points: [[102,236],[134,233],[127,304],[105,306]] },
	{ id: 'calves', points: [[106,322],[125,319],[124,372],[110,372]] }
];

export const FRONT: Region[] = [
	{ id: 'deltoidAnterior', points: [[131,74],[150,80],[152,101],[136,99],[129,85]] },
	{ id: 'deltoidLateral', points: [[152,82],[159,93],[158,115],[153,105]] },
	{ id: 'pectoralisMajor', points: [[102,80],[129,85],[133,107],[102,111]] },
	{ id: 'serratusAnterior', points: [[126,112],[135,116],[134,133],[125,129]] },
	{ id: 'biceps', points: [[146,110],[159,114],[157,148],[150,148]] },
	{ id: 'forearmFlexors', points: [[151,158],[164,162],[168,202],[158,204]] },
	{ id: 'rectusAbdominis', points: [[101,113],[120,115],[120,178],[101,180]] },
	{ id: 'obliques', points: [[121,136],[134,140],[129,172],[121,174]] },
	{ id: 'quadriceps', points: [[102,196],[133,199],[127,302],[105,304]] }
];

/**
 * Half an outline, drawn the way a hand traces one: down the head and shoulder, out along the arm
 * and back up its inside, down the ribs and the leg, and up the inner leg to where the two halves
 * meet. Mirrored and closed, that is a body, and the legs come out separate because the tracing
 * stops at the crotch rather than at the floor.
 */
export const OUTLINE = [
	[100, 8], [112, 12], [117, 26], [113, 42], [107, 50],
	[110, 56], [128, 62], [147, 74],
	[159, 90], [164, 116], [167, 150],
	[171, 180], [173, 206], [169, 217],
	[158, 215], [153, 188], [149, 152],
	[145, 114], [139, 96],
	[135, 112], [137, 150], [129, 178],
	[134, 198], [139, 218],
	[136, 246], [132, 278], [128, 306], [126, 320],
	[130, 342], [128, 368], [121, 386], [123, 396],
	[104, 396], [103, 340], [104, 290], [102, 250], [100, 234]
];

export const mirror = (points: number[][]) => points.map(([x, y]) => [200 - x, y]);
export const pointsAttr = (points: number[][]) => points.map(([x, y]) => `${x},${y}`).join(' ');

/** The closed silhouette: the traced half, then the other half read back the way it came. */
export const BODY = pointsAttr([...OUTLINE, ...mirror(OUTLINE).reverse()]);

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

/** The middle of a region, which is where a thumb aiming at it lands and where a test clicks. */
export function centroid(points: number[][]): number[] {
	const sum = points.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
	return [sum[0] / points.length, sum[1] / points.length];
}
