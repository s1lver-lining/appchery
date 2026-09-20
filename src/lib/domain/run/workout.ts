/**
 * A training session written before it is run: blocks in the order they are done, and repeats for
 * the ones done several times over.
 *
 * A repeat holds its own blocks rather than being a count on one, because an interval session is a
 * pair of blocks repeated, never a single one: 7 times (200 m fast then 100 m easy) is one repeat of
 * two blocks, and writing it as two repeats of one would run all the fast reps before any recovery.
 *
 * Nothing here knows about a satellite or a database: a workout is a plan, and what a run made of it
 * is lives in track.ts beside the fixes that measured it.
 */

/** What ends a block. An open block ends when the runner says so, which is what a warm up often is. */
export type RunGoal =
	| { type: 'time'; seconds: number }
	| { type: 'distance'; metres: number }
	| { type: 'open' };

/** What the block is for. It colours the block and nothing else: the goal is what actually runs it. */
export const BLOCK_KINDS = ['warmup', 'work', 'recovery', 'cooldown'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export interface RunBlock {
	id: string;
	kind: BlockKind;
	goal: RunGoal;
	/** Seconds per kilometre to hold, or null when the block asks for no particular pace. */
	targetPace: number | null;
	/** What the runner called it, or null to let the kind and the goal name it. */
	label: string | null;
}

export interface RunRepeat {
	id: string;
	times: number;
	blocks: RunBlock[];
}

export type RunItem = ({ type: 'block' } & RunBlock) | ({ type: 'repeat' } & RunRepeat);

export interface RunWorkout {
	id: string;
	name: string;
	items: RunItem[];
	/** Where it came from, so a workout run from the library can be found again. Null for an ad hoc one. */
	sourceId?: string | null;
}

export const WORKOUT_LIMITS = {
	name: { max: 60 },
	items: { max: 40 },
	blocksPerRepeat: { max: 12 },
	times: { min: 2, max: 60 },
	seconds: { min: 5, max: 6 * 3600 },
	metres: { min: 20, max: 100_000 },
	/** Seconds per kilometre. Two minutes is faster than anybody, twenty is slower than a walk. */
	pace: { min: 120, max: 1200 }
};

const id = () => crypto.randomUUID();

export function emptyWorkout(name = ''): RunWorkout {
	return { id: id(), name, items: [], sourceId: null };
}

export function newBlock(kind: BlockKind = 'work'): RunItem {
	const goal: RunGoal =
		kind === 'work' ? { type: 'distance', metres: 400 } : { type: 'time', seconds: 600 };
	return { type: 'block', id: id(), kind, goal, targetPace: null, label: null };
}

export function newRepeat(times = 6): RunItem {
	return {
		type: 'repeat',
		id: id(),
		times,
		blocks: [
			{ id: id(), kind: 'work', goal: { type: 'distance', metres: 400 }, targetPace: null, label: null },
			{ id: id(), kind: 'recovery', goal: { type: 'time', seconds: 90 }, targetPace: null, label: null }
		]
	};
}

/** A copy carrying fresh ids, so duplicating a block never leaves two of them answering to one name. */
export function duplicateItem(item: RunItem): RunItem {
	if (item.type === 'block') return { ...item, goal: { ...item.goal }, id: id() };
	return {
		...item,
		id: id(),
		blocks: item.blocks.map((block) => ({ ...block, goal: { ...block.goal }, id: id() }))
	};
}

export function duplicateWorkout(workout: RunWorkout, name = workout.name): RunWorkout {
	return { id: id(), name, items: workout.items.map(duplicateItem), sourceId: workout.sourceId ?? null };
}

/** A workout taken into a run, copied so editing the library afterwards never rewrites a run already done. */
export function snapshotWorkout(workout: RunWorkout): RunWorkout {
	const copy = duplicateWorkout(workout);
	return { ...copy, sourceId: workout.id };
}

/**
 * One block as it will actually be run, repeats unrolled.
 *
 * The step is what the live screen counts against and what a result is recorded for, so a repeat of
 * seven is seven pairs of steps here and never a single step with a counter on it.
 */
export interface RunStep {
	/** Stable across an edit of nothing: the block it came from, plus which time round it is. */
	key: string;
	blockId: string;
	kind: BlockKind;
	goal: RunGoal;
	targetPace: number | null;
	label: string | null;
	/** 1 based, and equal to repeatOf on a block outside a repeat. */
	repeat: number;
	repeatOf: number;
}

export function flatten(workout: RunWorkout): RunStep[] {
	const steps: RunStep[] = [];
	for (const item of workout.items) {
		if (item.type === 'block') {
			steps.push({
				key: item.id,
				blockId: item.id,
				kind: item.kind,
				goal: item.goal,
				targetPace: item.targetPace,
				label: item.label,
				repeat: 1,
				repeatOf: 1
			});
			continue;
		}
		for (let round = 1; round <= Math.max(1, item.times); round++) {
			for (const block of item.blocks) {
				steps.push({
					key: `${block.id}#${round}`,
					blockId: block.id,
					kind: block.kind,
					goal: block.goal,
					targetPace: block.targetPace,
					label: block.label,
					repeat: round,
					repeatOf: Math.max(1, item.times)
				});
			}
		}
	}
	return steps;
}

/**
 * What the workout asks for in total. A distance block needs its target pace to be worth any time
 * and a time block needs it to be worth any distance, so a workout with no paces still has a length.
 */
export function workoutTotals(workout: RunWorkout): { metres: number; seconds: number; open: number } {
	let metres = 0;
	let seconds = 0;
	let open = 0;
	for (const step of flatten(workout)) {
		if (step.goal.type === 'open') {
			open++;
		} else if (step.goal.type === 'distance') {
			metres += step.goal.metres;
			if (step.targetPace) seconds += (step.goal.metres / 1000) * step.targetPace;
		} else {
			seconds += step.goal.seconds;
			if (step.targetPace) metres += (step.goal.seconds / step.targetPace) * 1000;
		}
	}
	return { metres: Math.round(metres), seconds: Math.round(seconds), open };
}

/** The pace the whole programme averages out at, which is what it feels like from the outside. */
export function workoutPace(workout: RunWorkout): number | null {
	const { metres, seconds } = workoutTotals(workout);
	if (metres <= 0 || seconds <= 0) return null;
	return seconds / (metres / 1000);
}

export function validateWorkout(workout: RunWorkout): string[] {
	const errors: string[] = [];
	if (workout.name.length > WORKOUT_LIMITS.name.max) errors.push('name');
	if (workout.items.length > WORKOUT_LIMITS.items.max) errors.push('items');
	for (const item of workout.items) {
		if (item.type === 'repeat') {
			if (item.times < WORKOUT_LIMITS.times.min || item.times > WORKOUT_LIMITS.times.max)
				errors.push('times');
			if (item.blocks.length === 0) errors.push('empty');
			if (item.blocks.length > WORKOUT_LIMITS.blocksPerRepeat.max) errors.push('blocks');
		}
	}
	for (const step of flatten(workout)) {
		const { seconds, metres, pace } = WORKOUT_LIMITS;
		if (step.goal.type === 'time' && (step.goal.seconds < seconds.min || step.goal.seconds > seconds.max))
			errors.push('duration');
		if (step.goal.type === 'distance' && (step.goal.metres < metres.min || step.goal.metres > metres.max))
			errors.push('distance');
		if (step.targetPace !== null && (step.targetPace < pace.min || step.targetPace > pace.max))
			errors.push('pace');
	}
	return [...new Set(errors)];
}

/** A pace as a runner writes it, 4:35 or 4.35 or 4,35, all meaning four minutes thirty five a kilometre. */
export function parsePace(text: string): number | null {
	const trimmed = text.trim().replace(',', '.').replace('.', ':');
	if (trimmed === '') return null;
	const [minutes, seconds = '0'] = trimmed.split(':');
	const m = Number(minutes);
	const s = Number(seconds.padEnd(2, '0'));
	if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
	const total = Math.round(m * 60 + s);
	return total > 0 ? total : null;
}

export function formatPace(secondsPerKm: number | null): string {
	if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '';
	const whole = Math.round(secondsPerKm);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function parseWorkout(text: string | null): RunWorkout | null {
	if (!text) return null;
	try {
		const parsed = JSON.parse(text) as RunWorkout;
		if (!parsed || !Array.isArray(parsed.items)) return null;
		return {
			id: typeof parsed.id === 'string' ? parsed.id : id(),
			name: typeof parsed.name === 'string' ? parsed.name : '',
			sourceId: typeof parsed.sourceId === 'string' ? parsed.sourceId : null,
			items: parsed.items.filter((item) => item && (item.type === 'block' || item.type === 'repeat'))
		};
	} catch {
		// A workout written by something else is not worth failing a run over.
		return null;
	}
}

export function serialiseWorkout(workout: RunWorkout): string {
	return JSON.stringify(workout);
}
