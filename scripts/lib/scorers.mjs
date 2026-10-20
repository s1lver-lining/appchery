// @ts-nocheck
// The app's scorer versions, loaded from disk for the harnesses. See doc/scorers.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scorerOf } from '../../src/lib/vision/scorers.ts';

const ROOT = new URL('../..', import.meta.url).pathname;

export function weightsPath(file) {
	return join(ROOT, 'src/lib/vision/scorers', file);
}

/** The version named, as the scanner takes it: `{ id, name, model, settings }`. */
export function loadScorer(id) {
	const scorer = scorerOf(id);
	const model = scorer.weights ? JSON.parse(readFileSync(weightsPath(scorer.weights), 'utf8')) : null;
	return { id: scorer.id, name: scorer.name, model, settings: scorer.settings };
}
