import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS, SHOT_PHASES, muscle } from '../muscles';
import { JOINTS, blend } from './movement';
import { EXERCISES, defaultBoard, exercise, primary, worked } from './index';

describe('the catalogue', () => {
	it('names every exercise once', () => {
		expect(new Set(EXERCISES.map((entry) => entry.key)).size).toBe(EXERCISES.length);
	});

	it('works muscles the app knows, at loads it can shade', () => {
		for (const entry of EXERCISES) {
			expect(Object.keys(entry.load).length).toBeGreaterThan(0);
			for (const [id, load] of Object.entries(entry.load)) {
				expect(MUSCLE_IDS).toContain(id);
				expect([1, 2, 3]).toContain(load);
			}
		}
	});

	it('names moments of the shot that exist', () => {
		for (const entry of EXERCISES) {
			expect(entry.phases.length).toBeGreaterThan(0);
			for (const phase of entry.phases) expect(SHOT_PHASES).toContain(phase);
		}
	});

	it('asks for parameters its measure can carry', () => {
		for (const entry of EXERCISES) {
			expect(entry.defaults.sets).toBeGreaterThan(0);
			if (entry.measure === 'reps') expect(entry.defaults.reps).toBeGreaterThan(0);
			if (entry.measure === 'hold') expect(entry.defaults.holdSeconds).toBeGreaterThan(0);
			if (entry.measure === 'distance') expect(entry.defaults.distanceM).toBeGreaterThan(0);
		}
	});

	it('lists what it works hardest first', () => {
		const loads = worked(exercise('bandPullApart')!).map((entry) => entry.load);
		expect(loads).toEqual([...loads].sort((a, b) => b - a));
		expect(primary(exercise('externalRotation')!)).toEqual(['infraspinatus', 'teresMinor']);
	});
});

describe('the figure a diagram opens on', () => {
	it('opens on the one side an exercise is drawn on', () => {
		expect(defaultBoard(exercise('bandPullApart')!)).toBe('back');
		expect(defaultBoard(exercise('bowRaise')!)).toBe('both');
	});

	it('never opens on the close ups', () => {
		for (const entry of EXERCISES) expect(defaultBoard(entry)).not.toBe('deep');
	});

	it('opens on both when the exercise only works muscles no silhouette shows', () => {
		const deep = {
			...exercise('plank')!,
			load: { subscapularis: 3, transverseAbdominis: 2 }
		} as const;
		expect(defaultBoard(deep)).toBe('both');
	});

	it('agrees with where the muscles actually are', () => {
		for (const entry of EXERCISES) {
			const board = defaultBoard(entry);
			if (board === 'both') continue;
			const views = new Set(
				Object.keys(entry.load).map((id) => muscle(id as never)?.view)
			);
			expect(views.has(board === 'back' ? 'front' : 'back')).toBe(false);
		}
	});
});

describe('a movement', () => {
	it('poses every joint in every frame', () => {
		for (const entry of EXERCISES) {
			expect(entry.movement.frames.length).toBeGreaterThan(0);
			for (const frame of entry.movement.frames) {
				for (const joint of JOINTS) expect(frame.pose[joint]).toHaveLength(2);
			}
		}
	});

	it('anchors a band that is tied to something', () => {
		for (const entry of EXERCISES) {
			if (entry.movement.prop === 'anchoredBand') expect(entry.movement.anchor).toBeDefined();
		}
	});

	it('lands on each pose at the ends of a blend', () => {
		const [from, to] = EXERCISES[0].movement.frames;
		expect(blend(from.pose, to.pose, 0)).toEqual(from.pose);
		expect(blend(from.pose, to.pose, 1)).toEqual(to.pose);
		expect(blend(from.pose, to.pose, 0.5).handLeft[0]).toBeCloseTo(
			(from.pose.handLeft[0] + to.pose.handLeft[0]) / 2
		);
	});
});
