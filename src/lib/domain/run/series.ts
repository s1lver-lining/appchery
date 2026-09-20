import { addFix, currentPace, emptyTrack, type TrackedFix } from './track';

/**
 * A run as three lines rather than as a table of kilometres.
 *
 * The splits say what each kilometre came to, which is the right answer to "how did it go" and the
 * wrong one to "why did the fourth one hurt". A hill answers that, and so does a heart rate that
 * never came back down, and neither of them is visible in a figure per kilometre.
 *
 * Everything is worked out from the stored track through the same gates the run itself was measured
 * by, so the line and the total agree about what the run was.
 */

export interface RunSample {
	/** The run's own clock, so a pause is a gap rather than a straight line drawn through one. */
	seconds: number;
	distanceM: number;
	/** Seconds per kilometre over the window ending here, null while there is too little to divide. */
	pace: number | null;
	/** Metres above where the run started, which is what a climb reads as on a graph. */
	climbM: number | null;
	heartRate: number | null;
}

/** How many fixes the height is averaged over. Altitude is the noisiest thing a phone reports. */
const SMOOTH = 5;
/**
 * And how many the pace is. The window it is worked out over already spans half a minute, but the
 * window's own ends move from fix to fix, so the figure jitters by a few seconds a kilometre between
 * one and the next. Drawn raw that is a hedge rather than a line, and the shape is the whole point:
 * nobody reads a graph to find out what their pace was at 14:07, which is what the figures are for.
 */
const SMOOTH_PACE = 4;

export function samplesOf(fixes: TrackedFix[]): RunSample[] {
	let state = emptyTrack();
	const taken: { seconds: number; distanceM: number; altitude: number | null; heartRate: number | null }[] = [];
	const paces: (number | null)[] = [];
	for (const fix of fixes) {
		const next = addFix(state, fix, fix.elapsedSeconds);
		if (!next.moved) continue;
		state = next.state;
		taken.push({
			seconds: fix.elapsedSeconds,
			distanceM: state.distanceM,
			altitude: fix.altitude,
			heartRate: fix.heartRate ?? null
		});
		paces.push(currentPace(state, fix.elapsedSeconds));
	}

	const ground = taken.find((one) => one.altitude !== null)?.altitude ?? null;
	return taken.map((one, index) => ({
		seconds: one.seconds,
		distanceM: one.distanceM,
		pace: evened(paces, index),
		climbM: ground === null ? null : smoothed(taken, index) - ground,
		heartRate: one.heartRate
	}));
}

/** The mean of the paces around a point, which is the shape the line is drawn to show. */
function evened(paces: (number | null)[], index: number): number | null {
	let sum = 0;
	let count = 0;
	for (let i = Math.max(0, index - SMOOTH_PACE); i <= Math.min(paces.length - 1, index + SMOOTH_PACE); i++) {
		const pace = paces[i];
		if (pace === null) continue;
		sum += pace;
		count++;
	}
	// Nothing to average means nothing was measurable there, which is a gap and not a zero.
	return count === 0 ? null : sum / count;
}

/** The mean of the heights around a point, because a single one wanders by metres at a stride. */
function smoothed(taken: { altitude: number | null }[], index: number): number {
	let sum = 0;
	let count = 0;
	for (let i = Math.max(0, index - SMOOTH); i <= Math.min(taken.length - 1, index + SMOOTH); i++) {
		const altitude = taken[i].altitude;
		if (altitude === null) continue;
		sum += altitude;
		count++;
	}
	return count === 0 ? 0 : sum / count;
}

/**
 * A run in at most this many samples, each the average of the stretch it stands for.
 *
 * Averaged rather than picked. A run is thousands of fixes and a phone screen a few hundred pixels
 * wide, and taking every ninth fix keeps every one of its wobbles while throwing away the eight that
 * would have cancelled them out: what comes back is not the run, it is the noise, sampled. Averaging
 * the stretch is what a line drawn at this size is claiming to show anyway.
 */
export function condense(samples: RunSample[], most: number): RunSample[] {
	if (samples.length <= most || most < 2) return samples;
	const per = samples.length / most;
	const out: RunSample[] = [];
	for (let i = 0; i < most; i++) {
		const from = Math.floor(i * per);
		const to = Math.min(samples.length, Math.floor((i + 1) * per));
		const slice = samples.slice(from, Math.max(from + 1, to));
		out.push({
			// The ground is taken from the end of the stretch, so the line still runs left to right
			// over the whole run rather than stopping half a bucket short of the end of it.
			seconds: slice[slice.length - 1].seconds,
			distanceM: slice[slice.length - 1].distanceM,
			pace: mean(slice.map((one) => one.pace)),
			climbM: mean(slice.map((one) => one.climbM)),
			heartRate: mean(slice.map((one) => one.heartRate))
		});
	}
	return out;
}

/** The average of what is there, or nothing where a stretch measured nothing at all. */
function mean(values: (number | null)[]): number | null {
	let sum = 0;
	let count = 0;
	for (const value of values) {
		if (value === null) continue;
		sum += value;
		count++;
	}
	return count === 0 ? null : sum / count;
}

/**
 * Evenly spaced samples, at most this many. For a series whose points are places rather than
 * measurements, where one of every so many is still a true picture of where the run went.
 */
export function thin<T>(samples: T[], most: number): T[] {
	if (samples.length <= most || most < 2) return samples;
	const step = (samples.length - 1) / (most - 1);
	return Array.from({ length: most }, (_, i) => samples[Math.round(i * step)]);
}

/** The lowest and highest a series reaches, ignoring the places it says nothing. Null where it never does. */
export function extentOf(values: (number | null)[]): { min: number; max: number } | null {
	let min = Infinity;
	let max = -Infinity;
	for (const value of values) {
		if (value === null || !Number.isFinite(value)) continue;
		if (value < min) min = value;
		if (value > max) max = value;
	}
	return min === Infinity ? null : { min, max };
}

/** A stretch of a run where the clock was stopped, found by what the two clocks disagree about. */
export interface RunPause {
	/** The run's own clock where it happened, which is where a graph has to mark it. */
	seconds: number;
	distanceM: number;
	/** How long it lasted, by the world's clock. */
	forSeconds: number;
}

/** Shorter than this is a fix arriving late rather than a run being held at a crossing. */
const PAUSE_S = 10;

/**
 * Where a run was paused.
 *
 * Nothing records a pause: what records it is the gap between the two clocks. Every fix carries when
 * it was taken and where the run's own clock was, and the run's clock is the one that stops, so a
 * pause is wherever the world moved on and the run did not.
 *
 * A pause takes no room on either axis, because neither the clock nor the distance moved while it
 * lasted: it is a place on the line rather than a stretch of it, and that is how it is drawn.
 */
export function pausesOf(fixes: TrackedFix[]): RunPause[] {
	const out: RunPause[] = [];
	let state = emptyTrack();
	for (let i = 1; i < fixes.length; i++) {
		const before = fixes[i - 1];
		const fix = fixes[i];
		state = addFix(state, before, before.elapsedSeconds).state;
		const world = (fix.at - before.at) / 1000;
		const ran = fix.elapsedSeconds - before.elapsedSeconds;
		const held = world - ran;
		if (held < PAUSE_S) continue;
		out.push({
			seconds: before.elapsedSeconds,
			distanceM: state.distanceM,
			forSeconds: Math.round(held)
		});
	}
	return out;
}
