import type { Split } from './run/track';
import { parseWorkout, serialiseWorkout, type RunWorkout } from './run/workout';

/**
 * A run, tracked or written down.
 *
 * An archer's fitness is part of their shooting and none of their scores: a round is four hours on
 * the feet, and the legs that hold the stance are trained away from the line. So a run is an
 * activity of its own kind, with no arrows and no score, and it stays out of every arrow figure the
 * app keeps, see shootsArrows in stats.ts.
 *
 * Two ways in, and one record out. A tracked run follows the satellites and fills the same two
 * numbers a hand entered one is typed into, so everything downstream, the summary, the badges, the
 * statistics, reads one shape and never asks which kind it was looking at. What tracking adds is
 * kept beside them: the splits, the workout it was run to, and what each of its blocks came to.
 * The fixes themselves are rows in run_point, not JSON here, see doc/running.md.
 */
export const RUNNING_KIND = 'running';

/**
 * How hard it felt, which is the only measure of effort the archer always has. A heart rate needs a
 * strap and a pace means nothing without knowing the hill, but everybody knows an easy run from a
 * hard one.
 */
export const EFFORTS = ['easy', 'steady', 'tempo', 'hard', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export type RunMode = 'manual' | 'tracked';

/** Where a tracked run has got to, kept so the app being killed mid run loses the clock and nothing else. */
export interface RunLive {
	status: 'idle' | 'running' | 'paused' | 'done';
	/** When the first leg started, which is what dates the run. Null before it is ever started. */
	startedAt: number | null;
	/** Seconds banked by the legs already finished: the clock that pausing stops. */
	baseSeconds: number;
	/** When the leg now running began, or null while paused or stopped. */
	legStartedAt: number | null;
	/** The step of the workout being run, by RunStep.key. Null when running to no workout. */
	stepKey: string | null;
	/** The run's own clock when the current step was jumped to, so a step is timed from its own start. */
	stepFrom: { seconds: number; distanceM: number };
}

/** What one block of the workout actually came to, closed when the step is left rather than when it is planned to end. */
export interface StepResult {
	key: string;
	distanceM: number;
	seconds: number;
}

export interface RunRecord {
	/** Metres, the canonical unit everywhere: the display converts. Null until it is entered. */
	distanceM: number | null;
	durationSeconds: number | null;
	effort: Effort | null;
	mode: RunMode;
	/** Null on a hand entered run, which has no clock to remember. */
	live: RunLive | null;
	/** The programme this run was made of, copied in so editing the library never rewrites a run. */
	workout: RunWorkout | null;
	splits: Split[];
	steps: StepResult[];
	elevationGainM: number | null;
}

export function emptyLive(): RunLive {
	return {
		status: 'idle',
		startedAt: null,
		baseSeconds: 0,
		legStartedAt: null,
		stepKey: null,
		stepFrom: { seconds: 0, distanceM: 0 }
	};
}

/** The clock as it reads now: banked seconds plus the leg in progress, and frozen while paused. */
export function elapsed(live: RunLive | null, now = Date.now()): number {
	if (!live) return 0;
	return live.baseSeconds + (live.legStartedAt === null ? 0 : Math.max(0, (now - live.legStartedAt) / 1000));
}

export const RUN_LIMITS = {
	distanceM: { min: 100, max: 300_000 },
	durationSeconds: { min: 60, max: 24 * 3600 }
};

export function emptyRun(mode: RunMode = 'manual'): RunRecord {
	return {
		distanceM: null,
		durationSeconds: null,
		effort: null,
		mode,
		live: mode === 'tracked' ? emptyLive() : null,
		workout: null,
		splits: [],
		steps: [],
		elevationGainM: null
	};
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

/**
 * A hand entered run is finished once it has both of its numbers: there is nothing else to wait for.
 * A tracked one is finished when it is stopped, however far it got, because a run cut short is still
 * a run done and a run in progress is not one whatever its numbers say.
 */
export function isRunDone(run: RunRecord): boolean {
	if (run.mode === 'tracked') return run.live?.status === 'done';
	return run.distanceM !== null && run.durationSeconds !== null;
}

export function serialiseRun(run: RunRecord): string {
	return JSON.stringify({
		distanceM: run.distanceM,
		durationSeconds: run.durationSeconds,
		effort: run.effort,
		mode: run.mode,
		live: run.live,
		workout: run.workout ? JSON.parse(serialiseWorkout(run.workout)) : null,
		splits: run.splits,
		steps: run.steps,
		elevationGainM: run.elevationGainM
	});
}

export function parseRun(measurements: string | null): RunRecord {
	if (!measurements) return emptyRun();
	try {
		const parsed = JSON.parse(measurements) as Partial<RunRecord>;
		const finite = (value: unknown) =>
			typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
		// A run stored before tracking existed says nothing about a mode, and a run it never had is a hand entered one.
		const mode: RunMode = parsed.mode === 'tracked' ? 'tracked' : 'manual';
		return {
			distanceM: finite(parsed.distanceM),
			durationSeconds: finite(parsed.durationSeconds),
			effort: EFFORTS.includes(parsed.effort as Effort) ? (parsed.effort as Effort) : null,
			mode,
			live: parseLive(parsed.live, mode),
			workout: parsed.workout ? parseWorkout(JSON.stringify(parsed.workout)) : null,
			splits: Array.isArray(parsed.splits) ? parsed.splits : [],
			steps: Array.isArray(parsed.steps) ? parsed.steps : [],
			elevationGainM: typeof parsed.elevationGainM === 'number' ? parsed.elevationGainM : null
		};
	} catch {
		// A block written by something else is not worth failing a page over.
		return emptyRun();
	}
}

function parseLive(live: unknown, mode: RunMode): RunLive | null {
	if (mode !== 'tracked') return null;
	const base = emptyLive();
	if (!live || typeof live !== 'object') return base;
	const stored = live as Partial<RunLive>;
	const status = (['idle', 'running', 'paused', 'done'] as const).includes(stored.status as never)
		? (stored.status as RunLive['status'])
		: 'idle';
	return {
		status,
		startedAt: typeof stored.startedAt === 'number' ? stored.startedAt : null,
		baseSeconds: typeof stored.baseSeconds === 'number' ? Math.max(0, stored.baseSeconds) : 0,
		legStartedAt: typeof stored.legStartedAt === 'number' ? stored.legStartedAt : null,
		stepKey: typeof stored.stepKey === 'string' ? stored.stepKey : null,
		stepFrom:
			stored.stepFrom && typeof stored.stepFrom.seconds === 'number'
				? { seconds: stored.stepFrom.seconds, distanceM: stored.stepFrom.distanceM ?? 0 }
				: base.stepFrom
	};
}

/** Only what was typed is judged: a tracked run measured what it measured, however short. */
export function validateRun(run: RunRecord): string[] {
	const errors: string[] = [];
	if (run.mode === 'tracked') return errors;
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
/**
 * A distance as the app writes one: metres while it is under a kilometre, and kilometres to the
 * metre above it.
 *
 * Three decimals rather than two because most of what is shown is a part of a run rather than a
 * run: what is left of a block, a height gained, a split still going. Ten metres is a few strides,
 * and a figure that cannot say them is a figure that sits still while the runner moves. The run's
 * own total is the exception and asks for two, because nobody reads their evening's ten kilometres
 * to the metre.
 *
 * The unit comes back apart from the figure, because the pages draw it smaller and greyer, and the
 * watch draws it in its own words.
 */
export function distanceParts(metres: number, decimals = 3): { value: string; unit: 'km' | 'm' } {
	const safe = Number.isFinite(metres) ? Math.max(0, metres) : 0;
	if (safe < 1000) return { value: String(Math.round(safe)), unit: 'm' };
	return { value: (safe / 1000).toFixed(decimals), unit: 'km' };
}
