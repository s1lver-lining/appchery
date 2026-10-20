#!/usr/bin/env node
// Writes labels-v2.json beside every old labels.json, once the old tool is retired: see doc/labelling.md.
//   node scripts/convert-labels.mjs [--write]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LABELS_FILE, LEGACY_FILE, fromLegacy } from '../src/lib/labelling/format.ts';

const WORK = new URL('../test/datasets/labelling', import.meta.url).pathname;
const write = process.argv.includes('--write');

let converted = 0;
for (const name of readdirSync(WORK).sort()) {
	const folder = join(WORK, name);
	if (!existsSync(join(folder, LEGACY_FILE)) || existsSync(join(folder, LABELS_FILE))) continue;
	const meta = JSON.parse(readFileSync(join(folder, 'frames.json'), 'utf8'));
	const labels = fromLegacy(JSON.parse(readFileSync(join(folder, LEGACY_FILE), 'utf8')), meta);
	if (write) writeFileSync(join(folder, LABELS_FILE), JSON.stringify(labels));
	converted += 1;
}
console.log(`${converted} recordings ${write ? 'converted' : 'would be converted (run with --write)'}`);
