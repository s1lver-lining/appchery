import { describe, it, expect } from 'vitest';
import { driftingArrow, type PlottedArrow } from './arrowDrift';

/** A tight group of good arrows, numbered 1 to 3, five ends of them. */
function goodGroup(): PlottedArrow[] {
	const jitter = [-0.02, 0.01, 0.02, -0.01, 0];
	return jitter.flatMap((d, i) =>
		[1, 2, 3].map((ordinal) => ({
			ordinal,
			x: d + ordinal * 0.005,
			y: -d + (i % 2) * 0.01
		}))
	);
}

describe('driftingArrow', () => {
	it('says nothing about a set of arrows that all land together', () => {
		expect(driftingArrow(goodGroup())).toBeNull();
	});

	it('names the arrow that lands away from the others, and where it lands', () => {
		const arrows = goodGroup().map((arrow) =>
			arrow.ordinal === 2 ? { ...arrow, x: arrow.x + 0.25 } : arrow
		);
		const drift = driftingArrow(arrows);
		expect(drift?.ordinal).toBe(2);
		expect(drift?.direction).toBe('right');
		expect(drift?.shots).toBe(5);
		expect(drift?.offset).toBeGreaterThan(0.2);
	});

	it('reads the face downwards, so an arrow below the group is low', () => {
		const arrows = goodGroup().map((arrow) =>
			arrow.ordinal === 3 ? { ...arrow, y: arrow.y + 0.3 } : arrow
		);
		expect(driftingArrow(arrows)?.direction).toBe('low');
	});

	it('stays quiet when the whole group is scattered, which is the archer, not the arrow', () => {
		const wide = [0.3, -0.35, 0.2, -0.25, 0.4].flatMap((d, i) =>
			[1, 2, 3].map((ordinal) => ({ ordinal, x: d * (i % 2 ? 1 : -1), y: d * (ordinal - 2) }))
		);
		expect(driftingArrow(wide)).toBeNull();
	});

	it('stays quiet about an arrow that sprays rather than one that leans', () => {
		const spraying = [0.3, -0.32, 0.28, -0.3, 0.31];
		const arrows = goodGroup().map((arrow, i) =>
			arrow.ordinal === 2 ? { ...arrow, x: spraying[Math.floor(i / 3)] } : arrow
		);
		expect(driftingArrow(arrows)).toBeNull();
	});

	it('waits for three plots of the arrow before it accuses it', () => {
		const arrows = goodGroup()
			.map((arrow) => (arrow.ordinal === 2 ? { ...arrow, x: arrow.x + 0.25 } : arrow))
			.filter((arrow, i) => arrow.ordinal !== 2 || i < 7);
		expect(driftingArrow(arrows)).toBeNull();
	});

	it('waits for enough of the other arrows to have somewhere to compare against', () => {
		const short = [1, 2, 3].flatMap((ordinal) =>
			[0, 1, 2].map((i) => ({ ordinal, x: ordinal === 2 ? 0.3 : 0.01 * i, y: 0.01 * i }))
		).filter((arrow) => arrow.ordinal === 2 || arrow.x < 0.02);
		expect(driftingArrow(short.slice(0, 8))).toBeNull();
	});

	it('cannot pick between two arrow numbers, which are only odd to each other', () => {
		const pair = [0, 1, 2, 3, 4, 5].flatMap((i) => [
			{ ordinal: 1, x: 0.01 * (i % 2), y: 0.01 * (i % 3) },
			{ ordinal: 2, x: 0.3 + 0.01 * (i % 2), y: 0.01 * (i % 3) }
		]);
		expect(driftingArrow(pair)).toBeNull();
	});

	it('has nothing to say about a single arrow number', () => {
		expect(driftingArrow([{ ordinal: 1, x: 0, y: 0 }])).toBeNull();
	});
});
