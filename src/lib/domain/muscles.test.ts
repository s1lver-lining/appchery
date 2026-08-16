import { describe, expect, it } from 'vitest';
import {
	MUSCLES,
	MUSCLE_IDS,
	PHASE_LOAD,
	SHOT_PHASES,
	loadAt,
	muscle,
	musclesIn,
	musclesInPhase,
	peakLoad,
	peakPhases,
	shotCoverage,
	toggleMuscle,
	type MuscleId
} from './muscles';

describe('the muscle list', () => {
	it('names each muscle once', () => {
		expect(new Set(MUSCLE_IDS).size).toBe(MUSCLE_IDS.length);
	});

	it('draws a close up only where one sorts out muscles that lie over each other', () => {
		// The five round the shoulder blade earn a panel. Muscles that would be alone in one do not:
		// they are still pickable from the list, which is all a single shape ever needed.
		expect(MUSCLES.filter((entry) => entry.inset).map((entry) => entry.id)).toEqual([
			'levatorScapulae',
			'supraspinatus',
			'infraspinatus',
			'teresMinor',
			'subscapularis'
		]);
	});

	it('lets a muscle be both on the figure and in a close up when it is genuinely both', () => {
		// The infraspinatus reaches the skin under the trapezius, so an archer can be shown where to
		// feel it; the rest of the cuff never surfaces and lives only in the close up.
		expect(muscle('infraspinatus')?.view).toBe('back');
		for (const id of ['supraspinatus', 'teresMinor', 'subscapularis'] as const) {
			expect(muscle(id)?.view).toBe('deep');
		}
	});

	it('carries the whole rotator cuff, which a fitness chart drops and a shoulder needs', () => {
		const cuff: MuscleId[] = ['supraspinatus', 'infraspinatus', 'teresMinor', 'subscapularis'];
		for (const id of cuff) expect(muscle(id)?.inset).toBe('scapula');
	});

	it('works the scapular muscles the draw is actually made of', () => {
		for (const id of ['rhomboids', 'trapeziusMid', 'trapeziusLower', 'serratusAnterior'] as const) {
			expect(peakLoad(id)).toBe(3);
		}
	});
});

describe('what the shot asks of each muscle', () => {
	it('only loads muscles it knows', () => {
		for (const phase of SHOT_PHASES) {
			for (const id of Object.keys(PHASE_LOAD[phase])) {
				expect(MUSCLE_IDS).toContain(id as MuscleId);
			}
		}
	});

	it('works every muscle it lists somewhere in the shot', () => {
		for (const id of MUSCLE_IDS) expect(peakLoad(id)).toBeGreaterThan(0);
	});

	it('holds the archer up from the ground in every phase', () => {
		for (const phase of SHOT_PHASES) expect(loadAt(phase, 'erectorSpinae')).toBeGreaterThan(0);
	});

	it('leaves the upper trapezius out of the draw, because shrugging is the fault it names', () => {
		expect(loadAt('draw', 'trapeziusUpper')).toBe(0);
		expect(loadAt('anchor', 'trapeziusUpper')).toBe(0);
		// It is allowed the setup, where raising the bow genuinely asks for it.
		expect(loadAt('setup', 'trapeziusUpper')).toBeGreaterThan(0);
	});

	it('takes the arm out of the shot at the transfer and leaves the back in', () => {
		expect(loadAt('anchor', 'biceps')).toBe(2);
		expect(loadAt('transfer', 'biceps')).toBe(1);
		expect(loadAt('transfer', 'trapeziusLower')).toBe(3);
	});

	it('lets the string go by relaxing the fingers while the back keeps pulling', () => {
		expect(loadAt('expansion', 'fingerFlexors')).toBe(3);
		expect(loadAt('release', 'fingerFlexors')).toBe(0);
		expect(loadAt('release', 'rhomboids')).toBe(3);
	});

	it('reads the hardest working muscles of a phase first', () => {
		const working = musclesInPhase('draw');
		expect(working[0].load).toBe(3);
		expect(working.map((entry) => entry.load)).toEqual(
			[...working.map((entry) => entry.load)].sort((a, b) => b - a)
		);
		expect(working.every((entry) => entry.load > 0)).toBe(true);
	});

	it('names where a muscle is worked hardest', () => {
		expect(peakPhases('supraspinatus')).toEqual(['setup']);
		expect(peakPhases('rhomboids')).toContain('expansion');
	});
});

describe('choosing muscles for an exercise', () => {
	it('adds and removes one at a time', () => {
		expect(toggleMuscle([], 'rhomboids')).toEqual(['rhomboids']);
		expect(toggleMuscle(['rhomboids'], 'rhomboids')).toEqual([]);
	});

	it('keeps a selection in one order however it was tapped in', () => {
		const tapped = toggleMuscle(toggleMuscle([], 'calves'), 'rhomboids');
		const other = toggleMuscle(toggleMuscle([], 'rhomboids'), 'calves');
		expect(tapped).toEqual(other);
		expect(tapped).toEqual(MUSCLE_IDS.filter((id) => id === 'rhomboids' || id === 'calves'));
	});

	it('counts an empty selection as covering none of the shot and everything as all of it', () => {
		expect(shotCoverage([])).toBe(0);
		expect(shotCoverage(MUSCLE_IDS)).toBe(1);
	});

	it('credits a muscle the shot leans on over one it barely uses', () => {
		expect(shotCoverage(['rhomboids'])).toBeGreaterThan(shotCoverage(['trapeziusUpper']));
	});
});
