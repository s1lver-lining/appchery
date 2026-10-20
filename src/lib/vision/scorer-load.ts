import { scorerOf, type LoadedScorer } from './scorers';
import type { ArrowModel } from './learned';

// Fetched only for the version chosen: a megabyte of weights has no place in the bundle of everyone else.
const weights = import.meta.glob<ArrowModel>('./scorers/*.json', { import: 'default' });

export async function loadScorer(id: string | null | undefined): Promise<LoadedScorer> {
	const scorer = scorerOf(id);
	const load = scorer.weights ? weights[`./scorers/${scorer.weights}`] : null;
	return { id: scorer.id, model: load ? await load() : null, settings: scorer.settings };
}
