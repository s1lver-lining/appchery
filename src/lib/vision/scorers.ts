import type { ArrowModel } from './learned.ts';

/**
 * One version of the arrow scorer: its logic, as the scanner settings that switch it on, and its weights
 * when it is learned. A version never changes once shipped, so a score can be compared across them; a
 * change in behaviour is a new entry here. See doc/scorers.md.
 */
export interface Scorer {
	id: string;
	name: string;
	/** File under `src/lib/vision/scorers/` holding the learned weights. */
	weights?: string;
	/** Scanner options this version runs with, on top of the defaults. */
	settings: Record<string, unknown>;
	/** Still being tried: chosen only by hand, and free to change until it is renamed and shipped. */
	preview?: boolean;
}

export const SCORERS: readonly Scorer[] = [
	{ id: 'aphaia-1.0', name: 'Aphaia 1.0', settings: {} },
	{ id: 'aphaia-ml-1.0', name: 'Aphaia ML 1.0', weights: 'aphaia-ml-1.0.json', settings: {} },
	{ id: 'aphaia-1.1', name: 'Aphaia 1.1', settings: { paperLock: true } },
	{ id: 'aphaia-1.2alpha', name: 'Aphaia 1.2alpha', settings: { paperLock: true, sweep: { minShare: 0.2 } }, preview: true }
];

/** A choice that follows whichever shipped version was added last, so it moves on as new ones ship. */
export const LATEST = 'latest';
export const LATEST_SCORER: Scorer = SCORERS.filter((s) => !s.preview).at(-1)!;
export const DEFAULT_SCORER = LATEST;

// The names the setting held before scorers had versions. Classical was the default, so it follows the latest.
const RENAMED: Record<string, string> = { classical: LATEST, learned: 'aphaia-ml-1.0' };

/** The choice as stored, read back as `latest` or a version that exists. */
export function choiceOf(id: string | null | undefined): string {
	const wanted = (id && RENAMED[id]) ?? id ?? DEFAULT_SCORER;
	return wanted === LATEST || SCORERS.some((s) => s.id === wanted) ? wanted : DEFAULT_SCORER;
}

export function scorerOf(id: string | null | undefined): Scorer {
	const choice = choiceOf(id);
	return choice === LATEST ? LATEST_SCORER : SCORERS.find((s) => s.id === choice)!;
}

/** What the scanner is handed: the same shape whichever version and wherever it was loaded. */
export interface LoadedScorer {
	id: string;
	model: ArrowModel | null;
	settings: Record<string, unknown>;
}
