import type { LengthUnit } from './rounds/types';

/**
 * Shooting that was scored but never written down arrow by arrow.
 *
 * Free plotting, a scoring game, a drill somebody kept a running total of: the archer knows how far
 * away they stood, what face they shot at, how many arrows they let go and what it all added up to,
 * and nothing else. Recorded as a round it would be a lie — a round has ends, and a round with six
 * invented arrows scoring sixty two is a thing no archer has ever shot.
 *
 * So it is its own kind of activity. It has no ends, no arrows of its own and no round definition,
 * which is what keeps it out of averages, personal bests and round comparisons: those are questions
 * a round answers, and this is not one. Its arrows count as volume, like a match or a bare shaft
 * session, because arrows shot are arrows shot.
 */
export const FREE_SCORE_KIND = 'freeScore';

export interface FreeScoreSetup {
	/** Null when the archer did not record how far away they stood. */
	distance: number | null;
	unit: LengthUnit;
	/** Face diameter in cm. */
	faceSize: number;
}

export const FREE_SCORE_LIMITS = {
	faceSize: { min: 10, max: 200 },
	distance: { min: 1, max: 300 },
	arrows: { min: 0, max: 2000 },
	score: { min: 0, max: 20_000 }
};

export function defaultFreeScoreSetup(): FreeScoreSetup {
	return { distance: 18, unit: 'm', faceSize: 40 };
}

/**
 * Held in the activity's measurements rather than in a round definition, deliberately: anything
 * that reads a round definition treats what it finds as a round, and this must never be read as one.
 */
export function serialiseFreeScore(setup: FreeScoreSetup): string {
	return JSON.stringify({
		distance: setup.distance,
		unit: setup.unit,
		faceSize: setup.faceSize
	});
}

export function parseFreeScore(measurements: string | null): FreeScoreSetup {
	const fallback = defaultFreeScoreSetup();
	if (!measurements) return fallback;
	try {
		const parsed = JSON.parse(measurements) as Partial<FreeScoreSetup>;
		const distance =
			typeof parsed.distance === 'number' && Number.isFinite(parsed.distance) ? parsed.distance : null;
		return {
			distance,
			unit: parsed.unit === 'yd' ? 'yd' : 'm',
			faceSize:
				typeof parsed.faceSize === 'number' && Number.isFinite(parsed.faceSize)
					? parsed.faceSize
					: fallback.faceSize
		};
	} catch {
		// A measurement block written by something else is not worth failing a page over.
		return fallback;
	}
}

export function validateFreeScoreSetup(setup: FreeScoreSetup): string[] {
	const errors: string[] = [];
	const { faceSize, distance } = FREE_SCORE_LIMITS;
	if (!Number.isFinite(setup.faceSize) || setup.faceSize < faceSize.min || setup.faceSize > faceSize.max)
		errors.push('faceSize');
	if (
		setup.distance !== null &&
		(!Number.isFinite(setup.distance) || setup.distance < distance.min || setup.distance > distance.max)
	)
		errors.push('distance');
	return errors;
}

/** What the row is called when the archer gave it no name: where it was shot, and on what. */
export function freeScoreLabel(setup: FreeScoreSetup): string {
	const face = `${setup.faceSize}cm`;
	return setup.distance === null ? face : `${setup.distance}${setup.unit} · ${face}`;
}

/**
 * The average an archer can read off a total. Kept here rather than in the stats module because it
 * is a property of this one activity, never of a body of shooting: nothing aggregates these.
 */
export function freeScoreAverage(totalScore: number, arrowsShot: number): number | null {
	return arrowsShot > 0 ? totalScore / arrowsShot : null;
}
