import { exercise, type Exercise } from './exercises';

/**
 * A session of strength work, done set by set.
 *
 * It is an activity like a round is, and it lives in a session for the same reason: it is one thing
 * done on one afternoon. What it is not is shooting. It has no arrows, no score and no round, which
 * is what keeps it out of volume, averages and personal bests, see shootsArrows in stats.ts.
 *
 * What is stored is what was actually done rather than what was planned: a set carries the moment it
 * was ticked off, so a session abandoned halfway is honestly half a session and not a failed one.
 */
export const STRENGTH_KIND = 'strength';

export interface StrengthSet {
	/** Set on a counted exercise, null on a held one. */
	reps: number | null;
	/** Set on a held exercise, null on a counted one. */
	holdSeconds: number | null;
	/** When it was ticked off, or null while it is still to do. */
	doneAt: number | null;
}

export interface StrengthEntry {
	/** The catalogue key, so the instructions and the muscles come from one place, not a copy. */
	exerciseKey: string;
	sets: StrengthSet[];
	restSeconds: number;
}

export interface StrengthPlan {
	entries: StrengthEntry[];
}

export const STRENGTH_LIMITS = {
	entries: { min: 1, max: 12 },
	sets: { min: 1, max: 12 },
	reps: { min: 1, max: 100 },
	hold: { min: 1, max: 600 },
	rest: { min: 0, max: 600 }
};

export function emptyStrengthPlan(): StrengthPlan {
	return { entries: [] };
}

/** An exercise added to a session, filled in from what the catalogue says to start with. */
export function entryFor(entry: Exercise): StrengthEntry {
	const set: StrengthSet = {
		reps: entry.measure === 'reps' ? (entry.defaults.reps ?? null) : null,
		holdSeconds: entry.measure === 'hold' ? (entry.defaults.holdSeconds ?? null) : null,
		doneAt: null
	};
	return {
		exerciseKey: entry.key,
		sets: Array.from({ length: Math.max(1, entry.defaults.sets) }, () => ({ ...set })),
		restSeconds: entry.defaults.restSeconds ?? 60
	};
}

/** Every set of every exercise, which is the unit the whole activity is counted in. */
export function allSets(plan: StrengthPlan): StrengthSet[] {
	return plan.entries.flatMap((entry) => entry.sets);
}

export function setsPlanned(plan: StrengthPlan): number {
	return allSets(plan).length;
}

export function setsDone(plan: StrengthPlan): number {
	return allSets(plan).filter((set) => set.doneAt !== null).length;
}

/** Finished once every set has been ticked, and never before: an empty plan has finished nothing. */
export function isStrengthDone(plan: StrengthPlan): boolean {
	return setsPlanned(plan) > 0 && setsDone(plan) === setsPlanned(plan);
}

/** The set the archer is on: the first one not yet done, or null when there is nothing left. */
export function nextSet(plan: StrengthPlan): { entry: number; set: number } | null {
	for (let entry = 0; entry < plan.entries.length; entry++) {
		const set = plan.entries[entry].sets.findIndex((one) => one.doneAt === null);
		if (set >= 0) return { entry, set };
	}
	return null;
}

/**
 * Seconds of rest still owed after the last set was ticked, counted from the stamp on it rather than
 * ticked up: a phone that slept through the rest comes back knowing the rest is over.
 */
export function restLeft(plan: StrengthPlan, now: number): number {
	let latest: { at: number; rest: number } | null = null;
	for (const entry of plan.entries) {
		for (const set of entry.sets) {
			if (set.doneAt === null) continue;
			if (!latest || set.doneAt > latest.at) latest = { at: set.doneAt, rest: entry.restSeconds };
		}
	}
	if (!latest || isStrengthDone(plan)) return 0;
	return Math.max(0, latest.rest - Math.floor((now - latest.at) / 1000));
}

/** How hard the whole session worked each muscle: the hardest any one exercise in it worked it. */
export function planLoad(plan: StrengthPlan): Record<string, number> {
	const load: Record<string, number> = {};
	for (const entry of plan.entries) {
		const known = exercise(entry.exerciseKey);
		if (!known) continue;
		for (const [id, level] of Object.entries(known.load)) {
			if ((load[id] ?? 0) < level) load[id] = level;
		}
	}
	return load;
}

export function serialiseStrength(plan: StrengthPlan): string {
	return JSON.stringify({
		entries: plan.entries.map((entry) => ({
			exerciseKey: entry.exerciseKey,
			restSeconds: entry.restSeconds,
			sets: entry.sets.map((set) => ({
				reps: set.reps,
				holdSeconds: set.holdSeconds,
				doneAt: set.doneAt
			}))
		}))
	});
}

const number = (value: unknown, fallback: number | null): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Anything unreadable comes back as an empty session rather than throwing. A block written by a
 * newer version of the app is not worth losing the page over, and an archer can see it is empty.
 */
export function parseStrength(measurements: string | null): StrengthPlan {
	if (!measurements) return emptyStrengthPlan();
	try {
		const parsed = JSON.parse(measurements) as { entries?: unknown };
		if (!Array.isArray(parsed.entries)) return emptyStrengthPlan();
		return {
			entries: parsed.entries.flatMap((raw) => {
				const entry = raw as Partial<StrengthEntry>;
				if (typeof entry.exerciseKey !== 'string' || !Array.isArray(entry.sets)) return [];
				return [
					{
						exerciseKey: entry.exerciseKey,
						restSeconds: number(entry.restSeconds, 60) ?? 60,
						sets: entry.sets.map((one) => {
							const set = one as Partial<StrengthSet>;
							return {
								reps: number(set.reps, null),
								holdSeconds: number(set.holdSeconds, null),
								doneAt: number(set.doneAt, null)
							};
						})
					}
				];
			})
		};
	} catch {
		return emptyStrengthPlan();
	}
}

export function validateStrengthPlan(plan: StrengthPlan): string[] {
	const errors: string[] = [];
	const { entries, sets, reps, hold, rest } = STRENGTH_LIMITS;
	if (plan.entries.length > entries.max) errors.push('entries');
	for (const entry of plan.entries) {
		if (entry.sets.length < sets.min || entry.sets.length > sets.max) errors.push('sets');
		if (entry.restSeconds < rest.min || entry.restSeconds > rest.max) errors.push('rest');
		for (const set of entry.sets) {
			if (set.reps !== null && (set.reps < reps.min || set.reps > reps.max)) errors.push('reps');
			if (set.holdSeconds !== null && (set.holdSeconds < hold.min || set.holdSeconds > hold.max))
				errors.push('hold');
		}
	}
	return [...new Set(errors)];
}
