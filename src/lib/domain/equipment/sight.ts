/**
 * Working out a sight mark for a distance that was never shot.
 *
 * The relation is not a curve pulled out of the air: an arrow leaving at speed `v` has to be launched
 * at an angle above the line of sight to reach distance `d`, and ignoring drag that angle is
 *
 *     sin(2θ) = g·d / v²
 *
 * The sight pin sits on the riser a fixed distance ahead of the eye, so the mark it reads is that
 * angle carried down the sight bar: `height = a + b·tan(θ/1)`, where `b` stands for the sight
 * geometry and `a` for wherever the scale happens to call zero. Fitting `a`, `b` and `v` to the
 * marks the archer actually proved is what the good sight mark calculators do, and it holds up
 * outside the range that was shot in a way a polynomial does not.
 *
 * Drag is not modelled. A real arrow slows down, so the fitted `v` comes out a little under the true
 * launch speed and absorbs some of that loss; marks far outside the proved range drift low.
 *
 * A worked out mark is a guess and is always labelled as one: it is a place to start, not a mark.
 */

export interface MarkLike {
	distance: number;
	unit: string;
	height: string | null;
	/** 1 when this mark was worked out from the others, so it is never fed back into the fit. */
	interpolated: number;
}

export interface ProvenMark {
	distance: number;
	height: number;
}

/**
 * A mark is only usable as evidence if it was shot in and carries a number. Distances come back in
 * metres whatever they were entered in: the flight does not care which unit an archer counts in, so
 * a bow sighted in at 30 yards still says something about 30 metres.
 */
export function provenMarks(marks: MarkLike[]): ProvenMark[] {
	return marks
		.filter((mark) => !mark.interpolated)
		.map((mark) => ({
			distance: toMetres(mark.distance, mark.unit),
			height: Number.parseFloat(mark.height ?? '')
		}))
		.filter((mark) => Number.isFinite(mark.height))
		.sort((a, b) => a.distance - b.distance);
}

const YARD_IN_METRES = 0.9144;
const GRAVITY = 9.80665;

const toMetres = (distance: number, unit: string) =>
	unit === 'yd' ? distance * YARD_IN_METRES : distance;

/**
 * The sight height for `distance`, or null when there is not enough proved to say anything. Three
 * marks or more are fitted with the flight model above; two can only give the line through them.
 */
export function interpolateHeight(marks: MarkLike[], distance: number, unit: string): number | null {
	const proven = provenMarks(marks);
	const target = toMetres(distance, unit);
	// A distance already proved answers for itself: no fit can beat the mark that was shot.
	const exact = proven.find((mark) => mark.distance === target);
	if (exact) return exact.height;
	if (proven.length < 2) return null;

	if (proven.length >= 3) {
		const flight = fitFlight(proven);
		if (flight) {
			const angle = launchAngle(target, flight.speed);
			// Past the range that flight can carry, there is no mark to give: no fit invents one.
			return angle === null ? null : round(flight.offset + flight.gain * Math.tan(angle));
		}
		const curve = quadratic(proven, target);
		if (curve !== null) return round(curve);
	}
	return round(linear(proven, target));
}

/**
 * The launch speed the marks imply, in metres a second, or null when too few were proved to say.
 * It is the one bow figure a sight tape holds: everything else about the shot is in the archer.
 */
export function fittedSpeed(marks: MarkLike[]): number | null {
	const proven = provenMarks(marks);
	return proven.length >= 3 ? (fitFlight(proven)?.speed ?? null) : null;
}

interface Flight {
	speed: number;
	/** Scale zero and sight geometry: the two ends of turning an angle into a number on a tape. */
	offset: number;
	gain: number;
}

/**
 * Speed is searched and the two sight terms solved outright, because for a fixed speed the model is
 * linear in them: one coarse sweep and one fine sweep beat any amount of gradient chasing here.
 */
function fitFlight(proven: ProvenMark[]): Flight | null {
	const sweep = (from: number, to: number, step: number): (Flight & { error: number }) | null => {
		let found: (Flight & { error: number }) | null = null;
		for (let speed = from; speed <= to; speed += step) {
			const solved = solveSight(proven, speed);
			if (solved && (found === null || solved.error < found.error)) found = { ...solved, speed };
		}
		return found;
	};

	// 30 to 110 m/s covers everything from a heavy longbow to a hot compound, with room either side.
	const coarse = sweep(30, 110, 0.5);
	if (!coarse) return null;
	return sweep(Math.max(20, coarse.speed - 1), coarse.speed + 1, 0.02) ?? coarse;
}

/** Least squares through `height = offset + gain · tan(θ)` once the speed is fixed. */
function solveSight(
	proven: ProvenMark[],
	speed: number
): { offset: number; gain: number; error: number } | null {
	const xs: number[] = [];
	for (const mark of proven) {
		const angle = launchAngle(mark.distance, speed);
		if (angle === null) return null;
		xs.push(Math.tan(angle));
	}

	const n = proven.length;
	const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
	const meanY = proven.reduce((sum, mark) => sum + mark.height, 0) / n;
	const covariance = xs.reduce((sum, x, i) => sum + (x - meanX) * (proven[i].height - meanY), 0);
	const variance = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
	if (variance < 1e-12) return null;

	const gain = covariance / variance;
	const offset = meanY - gain * meanX;
	const error = proven.reduce(
		(sum, mark, i) => sum + (mark.height - (offset + gain * xs[i])) ** 2,
		0
	);
	return { offset, gain, error };
}

/** The angle above the line of sight that carries an arrow of this speed to this distance. */
function launchAngle(distance: number, speed: number): number | null {
	const sine = (GRAVITY * distance) / (speed * speed);
	// Past 1 the distance is beyond the arrow's range however it is loosed, so this speed is wrong.
	if (!(sine < 0.999)) return null;
	return 0.5 * Math.asin(sine);
}

/** Two decimals is finer than any sight scale, and trailing zeros read as false precision. */
export function formatHeight(value: number): string {
	return String(Math.round(value * 100) / 100);
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Straight through the two marks nearest the distance asked for, extended beyond the ends. Local
 * rather than fitted across everything, because two marks far away say nothing about the middle.
 */
function linear(proven: ProvenMark[], distance: number): number {
	const above = proven.findIndex((mark) => mark.distance > distance);
	// Past every mark there is none above, so the pair is the last two rather than the first two.
	const upper = above < 0 ? proven.length - 1 : Math.max(above, 1);
	const a = proven[upper - 1];
	const b = proven[upper] ?? proven[proven.length - 1];
	if (a.distance === b.distance) return a.height;
	return a.height + ((b.height - a.height) * (distance - a.distance)) / (b.distance - a.distance);
}

/**
 * The fallback when the flight model will not fit: a least squares parabola over every proved mark,
 * solved on distances centred about their mean so
 * the normal equations stay conditioned: raw distances cubed and to the fourth swamp the constant
 * term and the solve comes back as noise.
 */
function quadratic(proven: ProvenMark[], distance: number): number | null {
	const mean = proven.reduce((sum, mark) => sum + mark.distance, 0) / proven.length;
	const xs = proven.map((mark) => mark.distance - mean);
	const ys = proven.map((mark) => mark.height);

	const power = (n: number) => xs.reduce((sum, x) => sum + x ** n, 0);
	const weighted = (n: number) => xs.reduce((sum, x, i) => sum + x ** n * ys[i], 0);

	// [ n    S1  S2 ] [c]   [T0]
	// [ S1   S2  S3 ] [b] = [T1]
	// [ S2   S3  S4 ] [a]   [T2]
	const solved = solve3(
		[
			[proven.length, power(1), power(2)],
			[power(1), power(2), power(3)],
			[power(2), power(3), power(4)]
		],
		[weighted(0), weighted(1), weighted(2)]
	);
	if (!solved) return null;

	const [c, b, a] = solved;
	const x = distance - mean;
	return a * x * x + b * x + c;
}

/** Gaussian elimination with partial pivoting. Null when the marks are too alike to fit a curve. */
function solve3(matrix: number[][], rhs: number[]): [number, number, number] | null {
	const rows = matrix.map((row, i) => [...row, rhs[i]]);

	for (let col = 0; col < 3; col++) {
		let pivot = col;
		for (let row = col + 1; row < 3; row++) {
			if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
		}
		if (Math.abs(rows[pivot][col]) < 1e-9) return null;
		[rows[col], rows[pivot]] = [rows[pivot], rows[col]];

		for (let row = 0; row < 3; row++) {
			if (row === col) continue;
			const factor = rows[row][col] / rows[col][col];
			for (let k = col; k < 4; k++) rows[row][k] -= factor * rows[col][k];
		}
	}

	// Fully reduced above, so each row is one term against its own diagonal.
	const solution = rows.map((row, i) => row[3] / row[i]);
	return solution.every(Number.isFinite) ? (solution as [number, number, number]) : null;
}
