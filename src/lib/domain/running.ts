/**
 * A run, recorded by hand.
 *
 * An archer's fitness is part of their shooting and none of their scores: a round is four hours on
 * the feet, and the legs that hold the stance are trained away from the line. So a run is an
 * activity of its own kind, with no arrows and no score, and it stays out of every arrow figure the
 * app keeps, see shootsArrows in stats.ts.
 *
 * Entered rather than tracked. A watch, a treadmill and a phone all know the two numbers already,
 * and asking for them works everywhere, offline, with no permission to grant and no battery to
 * spend. Recording a route as it happens is a feature of its own and comes later.
 */
export const RUNNING_KIND = 'running';

/**
 * How hard it felt, which is the only measure of effort the archer always has. A heart rate needs a
 * strap and a pace means nothing without knowing the hill, but everybody knows an easy run from a
 * hard one.
 */
export const EFFORTS = ['easy', 'steady', 'tempo', 'hard', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface RunRecord {
	/** Metres, the canonical unit everywhere: the display converts. Null until it is entered. */
	distanceM: number | null;
	durationSeconds: number | null;
	effort: Effort | null;
}

export const RUN_LIMITS = {
	distanceM: { min: 100, max: 300_000 },
	durationSeconds: { min: 60, max: 24 * 3600 }
};

export function emptyRun(): RunRecord {
	return { distanceM: null, durationSeconds: null, effort: null };
}

/** Seconds per kilometre, the number a runner actually talks in. Null when either half is missing. */
export function pace(run: RunRecord): number | null {
	if (!run.distanceM || !run.durationSeconds || run.distanceM <= 0) return null;
	return run.durationSeconds / (run.distanceM / 1000);
}

/** Metres per second, for the times a speed is wanted rather than a pace. */
export function speed(run: RunRecord): number | null {
	if (!run.distanceM || !run.durationSeconds || run.durationSeconds <= 0) return null;
	return run.distanceM / run.durationSeconds;
}

/**
 * Minutes and seconds, and hours only once there are any: a run of forty minutes written 0:40:00
 * reads as forty seconds for a moment, and that moment is the whole cost of the extra field.
 */
export function clock(seconds: number): string {
	const whole = Math.max(0, Math.round(seconds));
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const rest = whole % 60;
	const pad = (value: number) => String(value).padStart(2, '0');
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** A run is finished once it has both of its numbers: there is nothing else to wait for. */
export function isRunDone(run: RunRecord): boolean {
	return run.distanceM !== null && run.durationSeconds !== null;
}

export function serialiseRun(run: RunRecord): string {
	return JSON.stringify({
		distanceM: run.distanceM,
		durationSeconds: run.durationSeconds,
		effort: run.effort
	});
}

export function parseRun(measurements: string | null): RunRecord {
	if (!measurements) return emptyRun();
	try {
		const parsed = JSON.parse(measurements) as Partial<RunRecord>;
		const finite = (value: unknown) =>
			typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
		return {
			distanceM: finite(parsed.distanceM),
			durationSeconds: finite(parsed.durationSeconds),
			effort: EFFORTS.includes(parsed.effort as Effort) ? (parsed.effort as Effort) : null
		};
	} catch {
		// A block written by something else is not worth failing a page over.
		return emptyRun();
	}
}

export function validateRun(run: RunRecord): string[] {
	const errors: string[] = [];
	const { distanceM, durationSeconds } = RUN_LIMITS;
	if (run.distanceM !== null && (run.distanceM < distanceM.min || run.distanceM > distanceM.max))
		errors.push('distance');
	if (
		run.durationSeconds !== null &&
		(run.durationSeconds < durationSeconds.min || run.durationSeconds > durationSeconds.max)
	)
		errors.push('duration');
	return errors;
}
