#!/usr/bin/env node
// Every checked frame as an image with its labels in pixels, hidden arrows flagged rather than dropped.
//   node scripts/export-frames.mjs [--out DIR] [--list names.json] [--video text]
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readLabels } from './lib/labels.mjs';
import { arrowsOn, homography, project } from '../src/lib/labelling/format.ts';

/** The ring of ten equal rings a point is in, 0 for a miss, which is all a training set needs of the score. */
const ringOf = (x, y) => Math.max(0, 10 - Math.floor(Math.hypot(x, y) * 10));

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
const args = process.argv.slice(2);
const option = (name) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? null : args[i + 1];
};
const out = resolve(option('out') ?? join(ROOT, 'test/datasets/prepared-frames'));
const listed = option('list') ? new Set(JSON.parse(await readFile(resolve(option('list')), 'utf8'))) : null;
const only = option('video');

await mkdir(join(out, 'images'), { recursive: true });
const examples = [];
for (const name of (await readdir(WORK)).sort()) {
	if (only && !name.includes(only)) continue;
	if (listed && !listed.has(name)) continue;
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'frames.json'))) continue;
	const labels = readLabels(folder);
	if (!labels) continue;
	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const samples = (await readdir(folder)).filter((f) => f.startsWith('sample-')).sort();
	for (const face of labels.faces)
	for (const [key, faces] of Object.entries(labels.frames)) {
		const here = faces[face.id];
		const frame = Number(key);
		if (here?.state !== 'ok' || !here.fit) continue;
		if (!face.empty && !here.arrowsOk && face.placedOn !== frame) continue;
		const h = homography(here.fit);
		if (!h || !samples[frame]) continue;
		const file = `${name.replace(/\.[a-z0-9]+$/i, '')}-f${String(frame + 1).padStart(2, '0')}.jpg`;
		if (!existsSync(join(out, 'images', file))) await copyFile(join(folder, samples[frame]), join(out, 'images', file));
		examples.push({
			file,
			video: name,
			frame,
			face: face.id,
			at: meta.chosen[frame],
			width: meta.width,
			height: meta.height,
			faceType: face.type,
			// Where face points (1,0), (0,1), (-1,0), (0,-1) land: the whole projection in four points.
			fit: here.fit,
			arrows: (face.empty ? [] : arrowsOn(labels, frame, face.id)).map((arrow) => {
				const p = project(h, arrow.x, arrow.y);
				return { n: arrow.n, x: p.x, y: p.y, face: { x: arrow.x, y: arrow.y }, ring: ringOf(arrow.x, arrow.y), hidden: arrow.hidden };
			}),
			nocks: Object.entries(here.nocks ?? {})
				.filter(([, point]) => point)
				.map(([n, [x, y]]) => ({ n: Number(n), x, y }))
		});
	}
}
await writeFile(join(out, 'labels.json'), JSON.stringify({ source: 'labelling', examples }, null, 1));
console.log(`${examples.length} frames written to ${out}`);
