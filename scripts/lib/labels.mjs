// @ts-nocheck: a node script, reached by the type check only through vite.config.ts.
// A recording's labels for the measuring scripts, from either file, in the old shape. See doc/labelling.md.
// Arrow numbers are not the same shaft from frame to frame: compare arrows across frames as sets, never by number.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LABELS_FILE, LEGACY_FILE, fromLegacy, toLegacy } from '../../src/lib/labelling/format.ts';

/** Whether the recording in this folder has been labelled in either format. */
export function hasLabel(folder) {
	return existsSync(join(folder, LABELS_FILE)) || existsSync(join(folder, LEGACY_FILE));
}

/** The new format itself, converted from the old file when that is all there is. Null when unlabelled. */
export function readLabels(folder) {
	const file = join(folder, LABELS_FILE);
	if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
	const legacy = join(folder, LEGACY_FILE);
	if (!existsSync(legacy)) return null;
	const meta = JSON.parse(readFileSync(join(folder, 'frames.json'), 'utf8'));
	return fromLegacy(JSON.parse(readFileSync(legacy, 'utf8')), meta);
}

/** The labels in the old shape, plus `frameHidden`, or null when unlabelled. */
export function readLabel(folder) {
	const labels = readLabels(folder);
	return labels && toLegacy(labels);
}
