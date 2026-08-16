import { describe, expect, it } from 'vitest';
import { musclesIn, type MuscleView } from '$lib/domain/muscles';
import { BACK, FRONT, OUTLINE, centroid, contains, mirror, type Region } from './muscleMap';

const VIEWS: [MuscleView, Region[]][] = [
	['back', BACK],
	['front', FRONT]
];

const body = [...OUTLINE, ...mirror(OUTLINE).reverse()];

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

			it('keeps every muscle inside the body', () => {
				for (const region of regions) {
					for (const point of region.points) {
						expect({ id: region.id, inside: contains(body, point) }).toEqual({
							id: region.id,
							inside: true
						});
					}
				}
			});

			/**
			 * The one that matters. Regions are drawn in order, so a later one covering an earlier one
			 * takes its taps: the muscle underneath is still visible at the edges but can never be
			 * picked. Checking the middle of each region catches exactly that.
			 */
			it('leaves every muscle a middle of its own to be tapped on', () => {
				for (let i = 0; i < regions.length; i++) {
					const middle = centroid(regions[i].points);
					const covered = regions.slice(i + 1).find((later) => contains(later.points, middle));
					expect({ id: regions[i].id, coveredBy: covered?.id }).toEqual({
						id: regions[i].id,
						coveredBy: undefined
					});
				}
			});
		});
	}
});
