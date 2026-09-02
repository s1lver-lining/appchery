import { describe, expect, it } from 'vitest';
import { musclesIn, type MuscleView } from '$lib/domain/muscles';
import { BACK, FRONT, bodyEdge, contains, sample, type Region } from './muscleMap';

/** The points of a half-unit grid that fall inside a shape: a cheap stand-in for its area. */
function grid(shape: number[][]): number[][] {
	const xs = shape.map((point) => point[0]);
	const ys = shape.map((point) => point[1]);
	const inside: number[][] = [];
	for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) {
		for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.5) {
			if (contains(shape, [x, y])) inside.push([x, y]);
		}
	}
	return inside;
}

const VIEWS: [MuscleView, Region[]][] = [
	['back', BACK],
	['front', FRONT]
];

/** The drawn edges, not the corners they were built from: a spline bows out past its own points. */
const body = bodyEdge();

/** Whether two line segments cross, not counting a shared endpoint. */
function crosses(a: number[], b: number[], c: number[], d: number[]): boolean {
	const side = (p: number[], q: number[], r: number[]) =>
		Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
	const [s1, s2, s3, s4] = [side(a, b, c), side(a, b, d), side(c, d, a), side(c, d, b)];
	return s1 !== s2 && s3 !== s4 && s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0;
}

describe('the muscle figure', () => {
	for (const [view, regions] of VIEWS) {
		describe(`the ${view}`, () => {
			it('draws every muscle the domain puts on this side of the body, and no others', () => {
				const drawn = regions.map((region) => region.id).sort();
				const expected = musclesIn(view)
					.map((entry) => entry.id)
					.sort();
				expect(drawn).toEqual(expected);
			});

			it('draws each muscle once', () => {
				expect(new Set(regions.map((r) => r.id)).size).toBe(regions.length);
			});

			/**
			 * A shape whose outline doubles back on itself. It happens when a muscle is written as one
			 * edge and then the other, and the second edge is listed in the direction it was measured
			 * rather than the direction the outline travels: the two ends swap and the shape draws an
			 * X. It still fills, it still contains points, and every other check here passes it, which
			 * is exactly why it needs one of its own.
			 */
			it('draws every muscle as an outline that does not cross itself', () => {
				for (const region of regions) {
					const points = region.points;
					const bad: string[] = [];
					for (let i = 0; i < points.length; i++) {
						for (let j = i + 2; j < points.length; j++) {
							if (i === 0 && j === points.length - 1) continue;
							const [a, b] = [points[i], points[(i + 1) % points.length]];
							const [c, d] = [points[j], points[(j + 1) % points.length]];
							if (crosses(a, b, c, d)) bad.push(`${i}-${j}`);
						}
					}
					expect({ id: region.id, crossings: bad }).toEqual({ id: region.id, crossings: [] });
				}
			});

			it('keeps every muscle inside the body', () => {
				for (const region of regions) {
					const outside = sample(region.points).filter((point) => !contains(body, point));
					expect({ id: region.id, strayed: outside.length }).toEqual({
						id: region.id,
						strayed: 0
					});
				}
			});

			/**
			 * The one that matters. Regions are drawn in order, so a later one covering an earlier one
			 * takes its taps, and the muscle underneath becomes unreachable however carefully a thumb
			 * is aimed.
			 *
			 * It asks how much of a muscle is still exposed rather than whether its middle happens to
			 * be, because the two are not the same once muscles are layered the way a body layers
			 * them: the latissimus really does run under the trapezius, and its centre can be buried
			 * while most of it stays perfectly tappable. A third left over is plenty to hit.
			 */
			it('leaves every muscle enough of itself uncovered to be tapped on', () => {
				const drawn = regions.map((region) => sample(region.points));
				for (let i = 0; i < regions.length; i++) {
					const inside = grid(drawn[i]);
					const free = inside.filter(
						(point) => !drawn.slice(i + 1).some((later) => contains(later, point))
					);
					const share = inside.length === 0 ? 0 : free.length / inside.length;
					expect({ id: regions[i].id, reachable: share > 0.3 }).toEqual({
						id: regions[i].id,
						reachable: true
					});
				}
			});
		});
	}
});
