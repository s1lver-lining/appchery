/**
 * Opponents to shoot against when there is nobody on the next target.
 *
 * A bot is not a score generator: it is a group. Each level shoots at the middle with a spread of
 * its own, and the arrows that come out are placed on the face like anybody else's, so they are
 * scored by the same zone map the archer's own arrows are. That is what makes beating one mean
 * something: a professional's group is tight because its arrows land close together, not because a
 * number was picked to be high.
 */

export type BotLevel = 'beginner' | 'amateur' | 'advanced' | 'professional';

export const BOT_LEVELS: BotLevel[] = ['beginner', 'amateur', 'advanced', 'professional'];

interface BotShape {
	/**
	 * Spread of one arrow around the point of aim, in face radii. A Rayleigh distance follows from
	 * it, so the mean miss is about 1.25 times this.
	 */
	spread: number;
	/**
	 * How far the point of aim itself wanders from the centre between ends, in face radii. A beginner
	 * does not merely scatter: their whole group walks, which is what an end of theirs looks like.
	 */
	drift: number;
}

const SHAPES: Record<BotLevel, BotShape> = {
	beginner: { spread: 0.42, drift: 0.16 },
	amateur: { spread: 0.25, drift: 0.08 },
	advanced: { spread: 0.15, drift: 0.04 },
	professional: { spread: 0.085, drift: 0.02 }
};

export function botShape(level: BotLevel): BotShape {
	return SHAPES[level];
}

/** A pair of independent normal samples, which is what a group of arrows around a point is made of. */
function gaussian(random: () => number): [number, number] {
	// Box-Muller. The first sample is clamped off zero, whose logarithm is not a number.
	const u = Math.max(random(), 1e-9);
	const v = random();
	const radius = Math.sqrt(-2 * Math.log(u));
	return [radius * Math.cos(2 * Math.PI * v), radius * Math.sin(2 * Math.PI * v)];
}

/**
 * One end from a bot, as normalised face coordinates. The aim wanders once per end and every arrow
 * scatters around it, so an end reads as a group rather than as a handful of unrelated arrows.
 * Anything landing outside the face is left there: a beginner misses, and a miss is a real result.
 */
export function botEnd(level: BotLevel, arrows: number, random: () => number = Math.random): { x: number; y: number }[] {
	const shape = SHAPES[level];
	const [driftX, driftY] = gaussian(random);
	const aimX = driftX * shape.drift;
	const aimY = driftY * shape.drift;

	const shots: { x: number; y: number }[] = [];
	for (let i = 0; i < arrows; i++) {
		const [dx, dy] = gaussian(random);
		// Held just outside the face rather than let run away: an arrow off the boss is still a miss.
		shots.push({
			x: clamp(aimX + dx * shape.spread),
			y: clamp(aimY + dy * shape.spread)
		});
	}
	return shots;
}

function clamp(value: number): number {
	return Math.max(-1.4, Math.min(1.4, value));
}

/** What a bot is called on the card, so a match against one says what it was against. */
export function botName(level: BotLevel, label: string): string {
	return `Bot (${label})`;
}
