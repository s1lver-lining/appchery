/**
 * Head to head matches.
 *
 * A match is scored end by end against somebody else, so its result is not a score: under the set
 * system a 27 that beats a 26 is worth exactly as much as a 30 that beats a 20. Everything here is
 * about who won an end, never about how good the shooting was, which is why matches are kept out of
 * personal bests and round averages everywhere else in the app.
 */

export type MatchSystem = 'set' | 'cumulative';

/**
 * Where a match sits in a bracket. A competition day is a ranking round and then a ladder, so a match
 * that knows its round can be read in the order it was shot rather than by the clock.
 */
export type MatchStage = 'none' | 'r64' | 'r32' | 'r16' | 'quarter' | 'semi' | 'bronze' | 'final';

/** Ordered the way a bracket is climbed, which is how a day's matches should be listed. */
export const MATCH_STAGES: MatchStage[] = [
	'none',
	'r64',
	'r32',
	'r16',
	'quarter',
	'semi',
	'bronze',
	'final'
];

export function stageRank(stage: MatchStage): number {
	const at = MATCH_STAGES.indexOf(stage);
	return at < 0 ? 0 : at;
}
export type MatchFormat = 'individual' | 'team' | 'mixedTeam' | 'custom';
export type Side = 'us' | 'them';

export interface MatchConfig {
	format: MatchFormat;
	system: MatchSystem;
	/** Arrows one side shoots in one end: three individually, six as a team, four mixed. */
	arrowsPerEnd: number;
	/** Ends shot before a tie goes to a shoot-off. */
	maxEnds: number;
	/** Set points that end the match. Ignored under the cumulative system. */
	setPointsToWin: number;
	/**
	 * False while the card is being kept for somebody else. Their arrows are still recorded, they
	 * just are not the archer's own, so nothing here reaches their volume or their badges.
	 */
	forSelf: boolean;
	/** Which round of the bracket this was, or none for a match that belongs to no ladder. */
	stage: MatchStage;
	/** Free text: an opponent is a name on a card, not somebody the app needs to know about. */
	opponent: string | null;
	/** Whether a level match may be taken to a single arrow. Off makes a draw a legal result. */
	shootOff: boolean;
	/** The face the plotted arrows are drawn on. A match carries no round to read it from. */
	scoreSetId: string;
	/** Display only, for a card that says what was shot rather than only who won. */
	faceSize: number | null;
	distance: { value: number; unit: 'm' | 'yd' } | null;
	/** Who our side is, when it is not simply the archer. Names only, and all of them optional. */
	ourName: string | null;
	teammates: string[];
}

export interface MatchEnd {
	endNo: number;
	/** Null while the end has not been entered. Both totals are needed before it counts. */
	ours: number | null;
	theirs: number | null;
	/** The single arrow that decides a tie, which stands outside the regulation ends. */
	shootOff?: boolean;
	/**
	 * Who took a shoot-off the arrows cannot separate. Two tens are decided by a judge with a tape
	 * measure, so the app records the call rather than inventing one.
	 */
	winner?: Side | null;
}

export interface MatchTally {
	ends: { end: MatchEnd; ourPoints: number; theirPoints: number }[];
	/** Set points under the set system, arrows totals under the cumulative one. */
	ourPoints: number;
	theirPoints: number;
	ourTotal: number;
	theirTotal: number;
	endsPlayed: number;
	decided: boolean;
	winner: Side | null;
	/** A tie that the regulation ends could not break: one arrow each, closest to the centre. */
	needsShootOff: boolean;
	/** Level with nothing left to shoot, which is a result rather than an unfinished match. */
	drawn: boolean;
}

const PRESETS: Record<Exclude<MatchFormat, 'custom'>, { arrowsPerEnd: number; maxEnds: number; setPointsToWin: number }> = {
	// World Archery: five sets of three, six set points; teams shoot four ends and play to five.
	individual: { arrowsPerEnd: 3, maxEnds: 5, setPointsToWin: 6 },
	team: { arrowsPerEnd: 6, maxEnds: 4, setPointsToWin: 5 },
	mixedTeam: { arrowsPerEnd: 4, maxEnds: 4, setPointsToWin: 5 }
};

export const MATCH_FORMATS: MatchFormat[] = ['individual', 'team', 'mixedTeam', 'custom'];

/** A match as it starts: the rules of the format, and nobody named yet. */
export function newMatch(format: MatchFormat, system: MatchSystem = 'set'): MatchConfig {
	const preset = format === 'custom' ? PRESETS.individual : PRESETS[format];
	return {
		format,
		system,
		...preset,
		forSelf: true,
		stage: 'none',
		shootOff: true,
		scoreSetId: DEFAULT_SCORE_SET,
		faceSize: null,
		distance: null,
		opponent: null,
		ourName: null,
		teammates: []
	};
}

/** The ten ring every target match is shot at, and the sane default for anything else. */
export const DEFAULT_SCORE_SET = 'wa-10-ring';

/** A hand written config that survives a reload: anything missing falls back to a legal match. */
export function parseConfig(raw: string | null): MatchConfig | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<MatchConfig>;
		const base = newMatch(
			MATCH_FORMATS.includes(parsed.format as MatchFormat) ? (parsed.format as MatchFormat) : 'individual',
			parsed.system === 'cumulative' ? 'cumulative' : 'set'
		);
		return {
			...base,
			arrowsPerEnd: positive(parsed.arrowsPerEnd, base.arrowsPerEnd),
			maxEnds: positive(parsed.maxEnds, base.maxEnds),
			setPointsToWin: positive(parsed.setPointsToWin, base.setPointsToWin),
			forSelf: parsed.forSelf !== false,
			stage: MATCH_STAGES.includes(parsed.stage as MatchStage)
				? (parsed.stage as MatchStage)
				: 'none',
			shootOff: parsed.shootOff !== false,
			scoreSetId: typeof parsed.scoreSetId === 'string' ? parsed.scoreSetId : base.scoreSetId,
			faceSize: positiveOrNull(parsed.faceSize),
			distance:
				parsed.distance && typeof parsed.distance.value === 'number' && parsed.distance.value > 0
					? { value: parsed.distance.value, unit: parsed.distance.unit === 'yd' ? 'yd' : 'm' }
					: null,
			opponent: typeof parsed.opponent === 'string' ? parsed.opponent : null,
			ourName: typeof parsed.ourName === 'string' ? parsed.ourName : null,
			teammates: Array.isArray(parsed.teammates)
				? parsed.teammates.filter((name): name is string => typeof name === 'string')
				: []
		};
	} catch {
		return null;
	}
}

function positiveOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function positive(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** Two points to the winner of an end, one each when it is drawn. */
export function endSetPoints(ours: number, theirs: number): [number, number] {
	if (ours > theirs) return [2, 0];
	if (theirs > ours) return [0, 2];
	return [1, 1];
}

const entered = (end: MatchEnd) => end.ours !== null && end.theirs !== null;

/**
 * Where the match stands. Ends are read in order and stop counting once one side has won, so an end
 * entered by mistake after the match was over cannot change who won it.
 */
export function tally(config: MatchConfig, ends: MatchEnd[]): MatchTally {
	const regulation = ends.filter((end) => !end.shootOff).sort((a, b) => a.endNo - b.endNo);
	const shootOff = ends.find((end) => end.shootOff);

	const rows: MatchTally['ends'] = [];
	let ourPoints = 0;
	let theirPoints = 0;
	let ourTotal = 0;
	let theirTotal = 0;
	let endsPlayed = 0;
	let winner: Side | null = null;

	for (const end of regulation) {
		if (winner || !entered(end)) break;
		endsPlayed += 1;
		ourTotal += end.ours as number;
		theirTotal += end.theirs as number;

		const [ourEnd, theirEnd] =
			config.system === 'set'
				? endSetPoints(end.ours as number, end.theirs as number)
				: [end.ours as number, end.theirs as number];
		ourPoints += ourEnd;
		theirPoints += theirEnd;
		rows.push({ end, ourPoints: ourEnd, theirPoints: theirEnd });

		if (config.system === 'set') {
			if (ourPoints >= config.setPointsToWin) winner = 'us';
			else if (theirPoints >= config.setPointsToWin) winner = 'them';
		}
	}

	// The cumulative system has nothing to declare until every end has been shot.
	if (!winner && config.system === 'cumulative' && endsPlayed >= config.maxEnds) {
		if (ourTotal > theirTotal) winner = 'us';
		else if (theirTotal > ourTotal) winner = 'them';
	}

	const allShot = endsPlayed >= config.maxEnds;
	const tiedAfterRegulation =
		!winner && allShot && (config.system === 'set' ? ourPoints === theirPoints : ourTotal === theirTotal);

	// One arrow each. Equal arrows are decided by a tape measure, so the call is recorded, not guessed.
	if (tiedAfterRegulation && shootOff && entered(shootOff)) {
		ourTotal += shootOff.ours as number;
		theirTotal += shootOff.theirs as number;
		rows.push({ end: shootOff, ourPoints: 0, theirPoints: 0 });
		if ((shootOff.ours as number) > (shootOff.theirs as number)) winner = 'us';
		else if ((shootOff.theirs as number) > (shootOff.ours as number)) winner = 'them';
		else winner = shootOff.winner ?? null;
	}

	const needsShootOff = config.shootOff && tiedAfterRegulation && winner === null;
	return {
		ends: rows,
		ourPoints,
		theirPoints,
		ourTotal,
		theirTotal,
		endsPlayed,
		decided: winner !== null,
		winner,
		needsShootOff,
		// Level, every end shot, and no arrow left to separate them: the match is over and drawn.
		drawn: winner === null && allShot && !needsShootOff && tiedOrShotOut(config, ourPoints, theirPoints, ourTotal, theirTotal)
	};
}

/** The end the archer is being asked for, or null once there is nothing left to enter. */
export function nextEndNo(config: MatchConfig, ends: MatchEnd[]): number | null {
	const result = tally(config, ends);
	if (result.decided) return null;
	if (result.needsShootOff) return null;
	return result.endsPlayed < config.maxEnds ? result.endsPlayed + 1 : null;
}

/**
 * Arrows the archer actually shot. A match run for somebody else counts none of them, and the
 * opponent's arrows never count for anybody: they are on the card to work out who won, no more.
 */
export function arrowsShot(config: MatchConfig, ends: MatchEnd[]): number {
	if (!config.forSelf) return 0;
	const result = tally(config, ends);
	const shot = result.endsPlayed * config.arrowsPerEnd;
	const decider = result.ends.some((row) => row.end.shootOff) ? 1 : 0;
	return shot + decider;
}

/**
 * What the activity records as its score. Set points under the set system, since that is what the
 * result is; the arrow total under the cumulative one, where it is also the score.
 */
export function matchScore(config: MatchConfig, ends: MatchEnd[]): number {
	const result = tally(config, ends);
	return config.system === 'set' ? result.ourPoints : result.ourTotal;
}

/** How far from the centre an arrow landed, which is what separates two shoot-off arrows of equal value. */
export function distanceFromCentre(shot: { x: number | null; y: number | null }): number | null {
	return shot.x === null || shot.y === null ? null : Math.hypot(shot.x, shot.y);
}

/**
 * Who won a shoot-off, read off the arrows themselves. Values first, then the plot: two tens are
 * separated by the closer one, which is exactly what the judge does with a tape measure.
 */
export function shootOffWinner(
	ours: { value: number; x: number | null; y: number | null } | null,
	theirs: { value: number; x: number | null; y: number | null } | null
): Side | null {
	if (!ours || !theirs) return null;
	if (ours.value !== theirs.value) return ours.value > theirs.value ? 'us' : 'them';
	const here = distanceFromCentre(ours);
	const there = distanceFromCentre(theirs);
	if (here === null || there === null || here === there) return null;
	return here < there ? 'us' : 'them';
}

/**
 * Whether a match was won from two sets down, which is the one thing about a match worth a badge:
 * the score says nothing, but coming back from 0-4 says plenty. Read over the ends in order.
 */
export function wonFromBehind(config: MatchConfig, ends: MatchEnd[]): boolean {
	const result = tally(config, ends);
	if (result.winner !== 'us' || config.system !== 'set') return false;

	let ours = 0;
	let theirs = 0;
	let behind = false;
	for (const row of result.ends) {
		ours += row.ourPoints;
		theirs += row.theirPoints;
		if (theirs - ours >= 4) behind = true;
	}
	return behind;
}

/** Level once there is nothing left to shoot, under whichever system the match was played. */
function tiedOrShotOut(
	config: MatchConfig,
	ourPoints: number,
	theirPoints: number,
	ourTotal: number,
	theirTotal: number
): boolean {
	return config.system === 'set' ? ourPoints === theirPoints : ourTotal === theirTotal;
}
