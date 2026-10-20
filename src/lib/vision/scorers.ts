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
}

export const SCORERS: readonly Scorer[] = [
	{ id: 'aphaia-1.0', name: 'Aphaia 1.0', settings: {} },
	{ id: 'aphaia-ml-1.0', name: 'Aphaia ML 1.0', weights: 'aphaia-ml-1.0.json', settings: {} },
	{ id: 'aphaia-1.1', name: 'Aphaia 1.1', settings: { paperLock: true } }
];

export const DEFAULT_SCORER = 'aphaia-1.1';

// The names the setting held before scorers had versions.
const RENAMED: Record<string, string> = { classical: 'aphaia-1.1', learned: 'aphaia-ml-1.0' };

export function scorerOf(id: string | null | undefined): Scorer {
	const wanted = (id && RENAMED[id]) ?? id ?? DEFAULT_SCORER;
	return SCORERS.find((s) => s.id === wanted) ?? SCORERS.find((s) => s.id === DEFAULT_SCORER)!;
}

/** What the scanner is handed: the same shape whichever version and wherever it was loaded. */
export interface LoadedScorer {
	id: string;
	model: ArrowModel | null;
	settings: Record<string, unknown>;
}
