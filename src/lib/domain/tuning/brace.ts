import { groupMetrics } from '$lib/domain/rounds/geometry';
import type { Shot } from '$lib/domain/rounds/types';

/**
 * Brace height tuning read off the boss: at each height a few ends are shot, and what is compared
 * across the heights is where the group sat and how big it was. Two curves rather than one because
 * they answer different questions: the height of the group says the bow is throwing the arrow
 * differently, and the size of it says whether that height suits the archer at all.
 *
 * Faces are plotted in a unit circle, so a reading only becomes centimetres once the face it was
 * shot on is known.
 */

export interface BraceGroup {
	/** Brace height in millimetres, which is how the bow's own record holds it. */
	braceMm: number;
	ends: { id: string; shots: Shot[] }[];
}

export interface BracePoint {
	braceCm: number;
	/** Height of the group centre above the middle of the face, in centimetres. Negative is low. */
	centreCm: number;
	/** Widest spread across the group, in centimetres. */
	spreadCm: number;
	arrows: number;
}

/**
 * One point per brace height, from every arrow shot at it: the ends are pooled rather than averaged
 * end by end, so an end of three and an end of six weigh what they are worth.
 */
export function bracePoints(groups: BraceGroup[], faceCm: number): BracePoint[] {
	const radius = faceCm / 2;
	return groups
		.map((group) => {
			const shots = group.ends.flatMap((end) => end.shots);
			const metrics = groupMetrics(shots);
			if (!metrics) return null;
			const plotted = shots.filter((shot) => shot.x !== null && shot.y !== null);
			return {
				braceCm: group.braceMm / 10,
				// The face is drawn with y downwards, so a group above the middle reads negative there.
				centreCm: -metrics.centerY * radius,
				spreadCm: metrics.diameter * radius,
				arrows: plotted.length
			};
		})
		.filter((point): point is BracePoint => point !== null)
		.sort((a, b) => a.braceCm - b.braceCm);
}

/** The brace height whose group was tightest, which is the answer the procedure exists to give. */
export function tightestBrace(points: BracePoint[]): BracePoint | null {
	if (points.length === 0) return null;
	return points.reduce((best, point) => (point.spreadCm < best.spreadCm ? point : best));
}
