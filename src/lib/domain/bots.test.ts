import { describe, it, expect } from 'vitest';
import { BOT_LEVELS, botEnd, botShape, botName } from './bots';
import { WA_10_RING } from './rounds/seed';
import { scoreAt } from './rounds/geometry';

/** A deterministic stream, so a bot's group can be asserted rather than hoped for. */
function stream(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

const averageScore = (level: (typeof BOT_LEVELS)[number], ends = 400) => {
	const random = stream(7);
	let total = 0;
	let arrows = 0;
	for (let i = 0; i < ends; i++) {
		for (const shot of botEnd(level, 3, random)) {
			total += scoreAt(WA_10_RING, shot.x, shot.y).value;
			arrows += 1;
		}
	}
	return total / arrows;
};

describe('bot shapes', () => {
	it('tightens as the level rises', () => {
		const spreads = BOT_LEVELS.map((level) => botShape(level).spread);
		expect(spreads).toEqual([...spreads].sort((a, b) => b - a));
	});
});

describe('botEnd', () => {
	it('shoots the arrows it was asked for', () => {
		expect(botEnd('advanced', 3, stream(1))).toHaveLength(3);
		expect(botEnd('advanced', 6, stream(1))).toHaveLength(6);
	});

	it('keeps every arrow within reach of the face', () => {
		for (const shot of botEnd('beginner', 60, stream(3))) {
			expect(Math.abs(shot.x)).toBeLessThanOrEqual(1.4);
			expect(Math.abs(shot.y)).toBeLessThanOrEqual(1.4);
		}
	});

	it('gives the same end back for the same stream, so a test can trust it', () => {
		expect(botEnd('amateur', 3, stream(9))).toEqual(botEnd('amateur', 3, stream(9)));
	});

	it('scores higher the better the level, and stays inside what an archer could shoot', () => {
		// Called by hand rather than passed to map, which would hand the index in as the end count.
		const scores = BOT_LEVELS.map((level) => averageScore(level));
		expect(scores).toEqual([...scores].sort((a, b) => a - b));
		expect(scores[0]).toBeGreaterThan(2);
		expect(scores[3]).toBeLessThan(10);
		// A professional averages around nine an arrow, which is what a good 70m looks like.
		expect(scores[3]).toBeGreaterThan(8);
	});
});

describe('botName', () => {
	it('says what it is and how hard it shoots', () => {
		expect(botName('advanced', 'Advanced')).toBe('Bot (Advanced)');
	});
});
