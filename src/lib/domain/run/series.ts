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
		pace: paces[index],
		climbM: ground === null ? null : smoothed(taken, index) - ground,
		heartRate: one.heartRate
	}));
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
 * Evenly spaced samples, at most this many. A run is thousands of fixes and a phone screen is a few
 * hundred pixels wide: drawing every one of them is a path nobody can see the shape of, built at a
 * cost the page pays on every redraw.
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
