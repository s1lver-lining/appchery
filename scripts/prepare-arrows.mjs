#!/usr/bin/env node
/**
 * Turns the labelled 60cm photographs into training examples for a learned arrow detector.
 *
 * The model is never asked to find the target. The classical face detector locates and rectifies it,
 * and what comes out of here is a square crop in face coordinates: gold centred, radius normalised,
 * tilt undone. That removes scale, rotation, position and most of the perspective from the problem
 * before training starts, which is worth a great deal when the whole dataset is a few hundred
 * photographs. The labels come out in the same coordinates, so a prediction is a score directly.
 *
 *   node scripts/prepare-arrows.mjs [--dir test/datasets/60cm] [--out test/datasets/prepared]
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};

const ROOT = new URL('..', import.meta.url).pathname;
const dir = join(ROOT, flag('--dir', 'test/datasets/60cm'));
const out = join(ROOT, flag('--out', 'test/datasets/prepared'));
/** Pixels across the crop, and how far past the face edge it reaches. */
const SIZE = Number(flag('--size', '128'));
const SPAN = Number(flag('--span', '1.2'));

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'images'), { recursive: true });

const tasks = JSON.parse(await readFile(join(dir, 'annotation.json'), 'utf8'));

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
let skipped = 0;

for (const task of tasks) {
	const result = task.annotations?.[0]?.result ?? task.drafts?.[0]?.result ?? [];
	const truth = result
		.filter((r) => r.value?.keypointlabels?.[0] && r.value.keypointlabels[0] !== 'Miss')
		.map((r) => ({
			x: (r.value.x / 100) * r.original_width,
			y: (r.value.y / 100) * r.original_height
		}));
	if (truth.length === 0) continue;

	const name = (task.file_upload ?? '').replace(/^[0-9a-f]+-/, '');
	let bytes;
	try {
		bytes = await readFile(join(dir, name));
	} catch {
		continue;
	}

	const prepared = await page.evaluate(
		async ({ src, truth, size, span }) => {
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

			// Face coordinates to crop pixels, and back, so labels and image agree by construction.
			const crop = document.createElement('canvas');
			crop.width = size;
			crop.height = size;
			const target = crop.getContext('2d');
			const scene = target.createImageData(size, size);

			for (let j = 0; j < size; j++) {
				for (let i = 0; i < size; i++) {
					const fx = ((i + 0.5) / size) * 2 * span - span;
					const fy = ((j + 0.5) / size) * 2 * span - span;
					// The app's own sampler, so a training crop and a crop cut at the range are the
					// same picture of the same place. Cutting them two ways is what once left the
					// labels describing a face the crop was not showing.
					const sample = VISION.cropPixel(face, fx, fy);
					const x = Math.round(sample.x);
					const y = Math.round(sample.y);
					const q = (j * size + i) * 4;
					// Alpha marks what the photograph actually covers, so the loss can skip the rest.
					if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
					scene.data[q + 3] = 255;
					const p = (y * frame.width + x) * 4;
					scene.data[q] = frame.data[p];
					scene.data[q + 1] = frame.data[p + 1];
					scene.data[q + 2] = frame.data[p + 2];
					scene.data[q + 3] = 255;
				}
			}
			target.putImageData(scene, 0, 0);

			const points = truth.map((point) => VISION.toFace(face, point.x, point.y));
			return { png: crop.toDataURL('image/png'), points, face };
		},
		{
			src: `data:image/jpeg;base64,${bytes.toString('base64')}`,
			truth,
			size: SIZE,
			span: SPAN
		}
	);

	if (!prepared) {
		skipped++;
		continue;
	}

	const file = name.replace(/\.[^.]+$/, '.png');
	await writeFile(
		join(out, 'images', file),
		Buffer.from(prepared.png.split(',')[1], 'base64')
	);
	// Labels off the crop are arrows the face fit could not cover, and would teach the model nothing.
	examples.push({
		file,
		source: name,
		points: prepared.points.filter((p) => Math.abs(p.x) < SPAN && Math.abs(p.y) < SPAN)
	});
}

await browser.close();

await writeFile(
	join(out, 'labels.json'),
	JSON.stringify({ size: SIZE, span: SPAN, examples }, null, 1)
);

const arrows = examples.reduce((sum, e) => sum + e.points.length, 0);
console.log(`prepared   ${examples.length} crops, ${arrows} arrows`);
console.log(`skipped    ${skipped} (no face found)`);
console.log(`written to ${out}`);
