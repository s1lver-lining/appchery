import { describe, expect, it } from 'vitest';
import { WA_10_RING } from '../rounds/seed';
import { defaultConfig, drillFaceLabel, needsSetup, newDrill, validateDrill } from './games';
import { countsOwnArrows, endSize, parseDrill, serialiseDrill, usesFace } from './serialise';

describe('parseDrill', () => {
	it('brings back everything it was handed', () => {
		const drill = newDrill('lives');
		drill.config.lives = 5;
		drill.state.calls = ['9', '10'];
		drill.state.startedAt = 1234;
		expect(parseDrill(serialiseDrill(drill))).toEqual(drill);
	});

	it('falls back to a fresh drill rather than throwing on a block it cannot read', () => {
		expect(parseDrill('not json').game).toBe('successZone');
		expect(parseDrill(null).game).toBe('successZone');
	});

	it('treats a game this build has never heard of as the plain one', () => {
		expect(parseDrill(JSON.stringify({ game: 'quidditch' })).game).toBe('successZone');
	});

	it('fills in every setting a block left out', () => {
		expect(parseDrill(JSON.stringify({ game: 'targetScore' })).config).toEqual(
			defaultConfig('targetScore')
		);
	});

	it('keeps a null arrow count, which is a meaning and not a gap', () => {
		const drill = newDrill('streak');
		expect(parseDrill(serialiseDrill(drill)).config.arrows).toBeNull();
	});

	it('refuses a score set it could not draw, because getScoreSet would throw on one', () => {
		const parsed = parseDrill(JSON.stringify({ game: 'streak', face: { scoreSetId: 'nonsense' } }));
		expect(parsed.face.scoreSetId).toBe(WA_10_RING.id);
	});

	it('keeps a distance nobody recorded as none rather than inventing one', () => {
		const parsed = parseDrill(JSON.stringify({ game: 'streak', face: { distance: null } }));
		expect(parsed.face.distance).toBeNull();
	});
});

describe('validateDrill', () => {
	it('passes a drill straight out of the catalogue', () => {
		expect(validateDrill(newDrill('successZone'))).toEqual([]);
	});

	it('will not hold a drill asking for fewer arrows than it puts in an end', () => {
		const drill = newDrill('successZone');
		drill.config.arrows = 3;
		drill.config.arrowsPerEnd = 6;
		expect(validateDrill(drill)).toContain('arrows');
	});

	it('measures the sorting drill against its set, which is the end it actually shoots', () => {
		const drill = newDrill('arrowSorting');
		drill.config.arrowSet = 12;
		drill.config.arrows = 6;
		expect(validateDrill(drill)).toContain('arrows');
		drill.config.arrows = 36;
		expect(validateDrill(drill)).toEqual([]);
	});

	it('says nothing about a setting the game does not read', () => {
		const drill = newDrill('streak');
		drill.config.goal = -1;
		expect(validateDrill(drill)).toEqual([]);
	});

	it('marks a face nobody could shoot at', () => {
		const drill = newDrill('successZone');
		drill.face.faceSize = 4000;
		expect(validateDrill(drill)).toContain('faceSize');
	});
});

describe('shape of a drill', () => {
	it('puts one arrow in an end for the drills shot one arrow at a time', () => {
		expect(endSize(newDrill('onePressure'))).toBe(1);
		expect(endSize(newDrill('successZone'))).toBe(6);
	});

	it('shoots the sorting drill a whole set at a time, so arrow one is always the first of an end', () => {
		const drill = newDrill('arrowSorting');
		drill.config.arrowSet = 8;
		expect(endSize(drill)).toBe(8);
	});

	it('knows the one drill that is shot at nothing', () => {
		expect(usesFace(newDrill('blindBale'))).toBe(false);
		expect(usesFace(newDrill('successZone'))).toBe(true);
	});

	it('makes the drill with no shot rows carry its own arrow count', () => {
		expect(countsOwnArrows(newDrill('blindBale'))).toBe(true);
		expect(countsOwnArrows(newDrill('successZone'))).toBe(false);
	});

	it('asks about a drill with nothing to set only when there is something to set', () => {
		expect(needsSetup('blindBale')).toBe(false);
		expect(needsSetup('successZone')).toBe(true);
		expect(needsSetup('streak')).toBe(true);
	});

	it('names a drill by where it was shot and on what', () => {
		expect(drillFaceLabel({ scoreSetId: WA_10_RING.id, faceSize: 40, distance: 18, unit: 'm' })).toBe(
			'18m · 40cm'
		);
		expect(drillFaceLabel({ scoreSetId: WA_10_RING.id, faceSize: 60, distance: null, unit: 'm' })).toBe(
			'60cm'
		);
	});
});
