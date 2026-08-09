#!/usr/bin/env node
/**
 * Turns aimify's labelled photographs into training examples in the same form as our own.
 *
 * Their labels are segmentation polygons: the ten rings, plus one polygon per arrow covering the whole
 * shaft. We need the impact, which is a point, so it is taken as the polygon vertex nearest the middle
 * of the face. An arrow leans out of the paper towards the lens, so its buried end is its innermost
 * point, which is the same reasoning the classical detector uses.
 *
 * That derivation is approximate and the reason this set is kept apart in the reporting: it is a
 * different label from a hand placed keypoint, and it should not be quietly mixed into an accuracy
 * figure measured against hand placed keypoints.
 *
 *   node scripts/prepare-aimify.mjs [--out test/datasets/prepared-aimify]
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};

const ROOT = new URL('..', import.meta.url).pathname;
const dir = join(ROOT, flag('--dir', 'scripts/aimify/ML/arrowV1-dataset'));
const out = join(ROOT, flag('--out', 'test/datasets/prepared-aimify'));
const SIZE = Number(flag('--size', '128'));
const SPAN = Number(flag('--span', '1.2'));
/** Class 10 in their data.yaml is `Arrow`; the rest are rings. */
const ARROW_CLASS = 10;

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'images'), { recursive: true });

const bundled = await build({
	entryPoints: [join(ROOT, 'src/lib/vision/still-entry.ts')],
	bundle: true,
	format: 'iife',
	globalName: 'VISION',
	write: false
});

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium'
});
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: bundled.outputFiles[0].text });

const examples = [];
let noFace = 0;
let noArrows = 0;
let covered = [];

for (const split of ['train', 'valid', 'test']) {
	let names;
	try {
		names = await readdir(join(dir, split, 'images'));
	} catch {
		continue;
	}

	for (const name of names) {
		const label = name.replace(/\.[^.]+$/, '.txt');
		let text;
		try {
			text = await readFile(join(dir, split, 'labels', label), 'utf8');
		} catch {
			continue;
		}

		// Each line is a class followed by polygon points, normalised to the image.
		const arrows = text
			.split('\n')
			.map((line) => line.trim().split(/\s+/).map(Number))
			.filter((parts) => parts.length > 6 && parts[0] === ARROW_CLASS)
			.map((parts) => {
				const points = [];
				for (let i = 1; i + 1 < parts.length; i += 2) points.push([parts[i], parts[i + 1]]);
				return points;
			});
		if (arrows.length === 0) {
			noArrows++;
			continue;
		}

		const bytes = await readFile(join(dir, split, 'images', name));
		const prepared = await page.evaluate(
			async ({ src, arrows, size, span }) => {
				const image = new Image();
				image.src = src;
				await image.decode();

				const canvas = document.createElement('canvas');
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext('2d', { willReadFrequently: true });
				context.drawImage(image, 0, 0);
				const pixels = context.getImageData(0, 0, image.width, image.height);
				const frame = { width: image.width, height: image.height, data: pixels.data };

				const face = VISION.locate(frame, 2);
				if (!face) return null;

				const crop = document.createElement('canvas');
				crop.width = size;
				crop.height = size;
				const target = crop.getContext('2d');
				const scene = target.createImageData(size, size);

				const cos = Math.cos(face.rotation);
				const sin = Math.sin(face.rotation);
				let inside = 0;
				for (let j = 0; j < size; j++) {
					for (let i = 0; i < size; i++) {
						const fx = ((i + 0.5) / size) * 2 * span - span;
						const fy = ((j + 0.5) / size) * 2 * span - span;
						const px = fx * face.semiMajor;
						const py = fy * face.semiMinor;
						const x = Math.round(face.cx + px * cos - py * sin);
						const y = Math.round(face.cy + px * sin + py * cos);
						const q = (j * size + i) * 4;
						if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
						scene.data[q + 3] = 255;
						inside++;
						const p = (y * frame.width + x) * 4;
						scene.data[q] = frame.data[p];
						scene.data[q + 1] = frame.data[p + 1];
						scene.data[q + 2] = frame.data[p + 2];
					}
				}
				target.putImageData(scene, 0, 0);

				// The impact is the end of the arrow that is in the paper, which is its innermost point.
				const points = arrows
					.map((polygon) => {
						let best = null;
						let bestRadius = Infinity;
						for (const [nx, ny] of polygon) {
							const point = VISION.toFace(face, nx * image.width, ny * image.height);
							const radius = Math.hypot(point.x, point.y);
							if (radius < bestRadius) {
								bestRadius = radius;
								best = point;
							}
						}
						return best;
					})
					.filter(Boolean);

				return { png: crop.toDataURL('image/png'), points, coverage: inside / (size * size) };
			},
			{ src: `data:image/jpeg;base64,${bytes.toString('base64')}`, arrows, size: SIZE, span: SPAN }
		);

		if (!prepared) {
			noFace++;
			continue;
		}
		covered.push(prepared.coverage);

		const file = `${split}-${name.replace(/\.[^.]+$/, '')}.png`;
		await writeFile(join(out, 'images', file), Buffer.from(prepared.png.split(',')[1], 'base64'));
		examples.push({
			file,
			source: name,
			coverage: Number(prepared.coverage.toFixed(3)),
			points: prepared.points.filter((p) => Math.abs(p.x) < SPAN && Math.abs(p.y) < SPAN)
		});
	}
}

await browser.close();
await writeFile(join(out, 'labels.json'), JSON.stringify({ size: SIZE, span: SPAN, examples }, null, 1));

covered.sort((a, b) => a - b);
const arrows = examples.reduce((sum, e) => sum + e.points.length, 0);
console.log(`prepared    ${examples.length} crops, ${arrows} arrows`);
console.log(`no face     ${noFace}`);
console.log(`no arrows   ${noArrows}`);
console.log(
	`crop covered by the picture: median ${(covered[Math.floor(covered.length / 2)] * 100).toFixed(0)}%` +
		`  worst ${(covered[0] * 100).toFixed(0)}%  best ${(covered[covered.length - 1] * 100).toFixed(0)}%`
);
