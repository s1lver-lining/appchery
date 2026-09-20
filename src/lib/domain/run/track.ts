/**
 * What a run adds up to as the fixes arrive.
 *
 * A phone reports where it thinks it is, not where the runner is, so every fix is judged before it
 * counts: too vague, too still, or too fast to be true, and it is dropped. Doing that here rather
 * than in the tracker keeps it testable without a satellite, and keeps the same rules on the totals
 * the live screen shows and the summary worked out afterwards from the stored track.
 */

export interface RunFix {
	/** Milliseconds, as the fix itself reported them rather than when it was received. */
	at: number;
	lat: number;
	lon: number;
	/** Metres of horizontal error, or null when the source says nothing. */
	accuracy: number | null;
	altitude: number | null;
	/** Metres per second as the receiver measured it, which is steadier than a difference of fixes. */
	speed: number | null;
}

/**
 * A fix as it was stored, carrying the run's own clock so a track replays through its pauses, and
 * whatever the wrist was reporting when it landed. The beat is on the fix rather than in a series of
 * its own because that is how a GPX carries one, and because a run is read back point by point.
 */
export type TrackedFix = RunFix & { elapsedSeconds: number; heartRate?: number | null };

export const TRACK_RULES = {
	/** Beyond this the fix says little more than which town you are in. */
	accuracyM: 25,
	/** Under this a fix is the receiver wandering while the runner stands still. */
	minStepM: 3,
	/**
	 * How much of a fix's own stated error a step has to beat to count as a step. A receiver that
	 * admits to 20 m is entitled to wander ten of them without anybody having moved, and a phone left
	 * on a table wanders exactly that much all day: at one fix a second it is what turns a still run
	 * into a kilometre every few minutes.
	 */
	accuracyShare: 0.5,
	/** Above this nobody ran it: a jump between fixes, not a stride. */
	maxSpeedMs: 8,
	/**
	 * Under this the receiver is saying the phone is not moving, which it knows better than any
	 * difference of positions does: Doppler is measured, a difference of two guesses is two guesses.
	 */
	stillMs: 0.7,
	/**
	 * Above this the receiver says the phone is moving, and it is believed over the distance floor: a
	 * slow runner at one fix a second covers less ground between fixes than a vague fix may wander,
	 * and the floor alone would record them as standing still for the whole run.
	 */
	movingMs: 1.2,
	/** Altitude is the noisiest thing a phone reports, so only a real climb counts. */
	climbM: 4,
	/** The window the pace on screen is worked out over: short enough to react, long enough to settle. */
	paceWindowSeconds: 30,
	paceWindowMinM: 25
};

export interface TrackState {
	distanceM: number;
	elevationGainM: number;
	last: RunFix | null;
	/** The altitude the current climb is measured from, held until it moves by more than the noise. */
	climbFrom: number | null;
	/** Recent fixes as (elapsed seconds, cumulative metres), for the pace shown right now. */
	recent: { seconds: number; distanceM: number }[];
	splits: Split[];
	/** Where the split being run started, so a split is closed the moment its kilometre is crossed. */
	splitFrom: { distanceM: number; seconds: number };
}

export interface Split {
	/** 1 based: split 1 is the first kilometre. */
	index: number;
	distanceM: number;
	seconds: number;
}

export const SPLIT_M = 1000;

export function emptyTrack(): TrackState {
	return {
		distanceM: 0,
		elevationGainM: 0,
		last: null,
		climbFrom: null,
		recent: [],
		splits: [],
		splitFrom: { distanceM: 0, seconds: 0 }
	};
}

const EARTH_M = 6371008.8;

/** Metres between two fixes on the sphere, which is close enough at the distances a stride covers. */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLon = (b.lon - a.lon) * rad;
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * How far a fix has to be from the last one to be movement rather than the receiver thinking again.
 * It rises with the error the fix admits to, because that error is exactly how far it may wander.
 */
export function stepFloor(fix: RunFix): number {
	const admitted = (fix.accuracy ?? 0) * TRACK_RULES.accuracyShare;
	return Math.max(TRACK_RULES.minStepM, admitted);
}

/** Whether a fix is worth keeping at all, which is the one judgement made before anything is stored. */
export function isUsable(fix: RunFix): boolean {
	return (
		Number.isFinite(fix.lat) &&
		Number.isFinite(fix.lon) &&
		(fix.accuracy === null || fix.accuracy <= TRACK_RULES.accuracyM)
	);
}

/**
 * The totals after one more fix, and whether it moved them. `seconds` is the run's own clock, which
 * stops when the run is paused: a fix arriving during a pause adds neither distance nor time.
 */
export function addFix(
	state: TrackState,
	fix: RunFix,
	seconds: number
): { state: TrackState; moved: boolean } {
	if (!isUsable(fix)) return { state, moved: false };
	const next: TrackState = { ...state, recent: [...state.recent], splits: [...state.splits] };
	if (fix.altitude !== null && next.climbFrom === null) next.climbFrom = fix.altitude;

	if (!state.last) {
		next.last = fix;
		next.recent = [{ seconds, distanceM: next.distanceM }];
		return { state: next, moved: true };
	}

	const step = haversine(state.last, fix);
	const gap = (fix.at - state.last.at) / 1000;
	// No time passed, so nothing was run: a repeated or reordered fix is not a stride.
	if (gap <= 0) return { state, moved: false };
	if (fix.speed !== null && fix.speed < TRACK_RULES.stillMs) return { state, moved: false };
	const believed = fix.speed !== null && fix.speed >= TRACK_RULES.movingMs;
	if (!believed && step < stepFloor(fix)) return { state, moved: false };
	if (step / gap > TRACK_RULES.maxSpeedMs) return { state, moved: false };

	next.distanceM = state.distanceM + step;
	next.last = fix;
	if (fix.altitude !== null && next.climbFrom !== null) {
		const climb = fix.altitude - next.climbFrom;
		if (Math.abs(climb) >= TRACK_RULES.climbM) {
			if (climb > 0) next.elevationGainM = state.elevationGainM + climb;
			next.climbFrom = fix.altitude;
		}
	}

	next.recent.push({ seconds, distanceM: next.distanceM });
	const cutoff = seconds - TRACK_RULES.paceWindowSeconds;
	while (next.recent.length > 2 && next.recent[1].seconds < cutoff) next.recent.shift();

	// Split boundaries land between fixes, so the crossing is timed by where inside the step it fell.
	while (next.distanceM - next.splitFrom.distanceM >= SPLIT_M) {
		const target = next.splitFrom.distanceM + SPLIT_M;
		const before = state.distanceM;
		const share = step > 0 ? (target - before) / step : 1;
		const at = seconds - gap * (1 - Math.min(1, Math.max(0, share)));
		next.splits.push({
			index: next.splits.length + 1,
			distanceM: SPLIT_M,
			seconds: Math.max(0, at - next.splitFrom.seconds)
		});
		next.splitFrom = { distanceM: target, seconds: at };
	}

	return { state: next, moved: true };
}

/** Seconds per kilometre, the number a runner talks in. Null while there is too little to divide. */
export function paceOf(distanceM: number, seconds: number): number | null {
	if (distanceM <= 0 || seconds <= 0) return null;
	return seconds / (distanceM / 1000);
}

/** The pace right now, over the last half minute rather than over the whole run. */
export function currentPace(state: TrackState, seconds: number): number | null {
	const first = state.recent[0];
	if (!first) return null;
	const run = state.distanceM - first.distanceM;
	const span = seconds - first.seconds;
	if (run < TRACK_RULES.paceWindowMinM || span <= 0) return null;
	return paceOf(run, span);
}

/** Every split, the one in progress included, which is what makes the list worth showing mid run. */
export function splitsNow(state: TrackState, seconds: number): (Split & { partial: boolean })[] {
	const done = state.splits.map((split) => ({ ...split, partial: false }));
	const restM = state.distanceM - state.splitFrom.distanceM;
	if (restM <= 0) return done;
	return [
		...done,
		{
			index: done.length + 1,
			distanceM: restM,
			seconds: Math.max(0, seconds - state.splitFrom.seconds),
			partial: true
		}
	];
}

/** The totals rebuilt from a stored track, so a run reopened adds up to what it did while it ran. */
export function replay(fixes: RunFix[]): TrackState {
	let state = emptyTrack();
	const started = fixes[0]?.at ?? 0;
	for (const fix of fixes) state = addFix(state, fix, (fix.at - started) / 1000).state;
	return state;
}

/** The same, for a track stored with the clock it was run against, which is the one a pause stops. */
export function replayTracked(fixes: TrackedFix[]): TrackState {
	let state = emptyTrack();
	for (const fix of fixes) state = addFix(state, fix, fix.elapsedSeconds).state;
	return state;
}

/**
 * What the heart did over a run, out of the fixes it is written on. Null where nothing was
 * measuring: an average of the handful of beats that arrived before a strap slipped is worse than
 * no figure at all, so a run has to carry a few before it is worth saying anything about.
 */
export function heartOf(fixes: TrackedFix[]): { average: number; max: number } | null {
	let sum = 0;
	let count = 0;
	let max = 0;
	for (const fix of fixes) {
		const beat = fix.heartRate;
		if (!beat || beat <= 0) continue;
		sum += beat;
		count++;
		if (beat > max) max = beat;
	}
	if (count < HEART_MIN_SAMPLES) return null;
	return { average: Math.round(sum / count), max };
}

/** Fewer than this and the wrist was reporting by accident rather than for the length of a run. */
export const HEART_MIN_SAMPLES = 5;
