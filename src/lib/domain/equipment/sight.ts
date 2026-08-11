/**
 * Working out a sight mark for a distance that was never shot.
 *
 * Sight height against distance is not a straight line: the arrow flies a parabola, so the marks
 * bunch up close in and spread out further away. Fitting a curve through every mark the archer
 * actually proved gives a usable starting point for a distance they have not stood at yet, which is
 * the difference between one sighting arrow and a whole end of them.
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

/** A mark is only usable as evidence if it was shot in and carries a number. */
export function provenMarks(marks: MarkLike[], unit: string): ProvenMark[] {
	return marks
		.filter((mark) => mark.unit === unit && !mark.interpolated)
		.map((mark) => ({ distance: mark.distance, height: Number.parseFloat(mark.height ?? '') }))
		.filter((mark) => Number.isFinite(mark.height))
		.sort((a, b) => a.distance - b.distance);
}

/**
 * The sight height for `distance`, or null when there is not enough proved to say anything. Three
 * marks or more are fitted with a parabola, which is the shape the flight actually has; two can only
 * give the line through them.
 */
export function interpolateHeight(marks: MarkLike[], distance: number, unit: string): number | null {
	const proven = provenMarks(marks, unit);
	// A distance already proved answers for itself: no fit can beat the mark that was shot.
	const exact = proven.find((mark) => mark.distance === distance);
	if (exact) return exact.height;
	if (proven.length < 2) return null;

	const fitted = proven.length >= 3 ? quadratic(proven, distance) : null;
	return round(fitted ?? linear(proven, distance));
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
	const upper = above <= 0 ? 1 : above;
	const a = proven[upper - 1];
	const b = proven[upper] ?? proven[proven.length - 1];
	if (a.distance === b.distance) return a.height;
	return a.height + ((b.height - a.height) * (distance - a.distance)) / (b.distance - a.distance);
}

/**
 * Least squares parabola over every proved mark, solved on distances centred about their mean so
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
