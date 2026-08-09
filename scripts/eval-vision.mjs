#!/usr/bin/env node
/**
 * Measures face detection against annotated photographs.
 *
 * The unit tests draw synthetic faces, which proves the maths but says nothing about real light,
 * real paper and real backgrounds. This runs the same code over a labelled dataset and reports how
 * often it finds the face, how often it invents one, and how accurate the fit is.
 *
 * The imagery is not in the repository, being large and third party. Point it at a directory laid
 * out like the Pascal VOC style set used here:
 *
 *   test/datasets/DutchTargetData_Kaggle/{images,annotations}
 *
 * Usage: node scripts/eval-vision.mjs [--limit 200] [--dir <dataset>]
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const ROOT = new URL('..', import.meta.url).pathname;
const DATASET = option('dir', join(ROOT, 'test/datasets/DutchTargetData_Kaggle'));
const LIMIT = Number(option('limit', 150));
/** Threshold overrides, so the sweep does not need a code edit per run. */
const TUNE = JSON.parse(option('tune', '{"detect":{},"rings":{}}'));

if (!existsSync(DATASET)) {
	console.error(`No dataset at ${DATASET}. See the comment at the top of this script.`);
	process.exit(2);
}

// A set may be a flat directory of pictures, or images/ plus annotations/ beside it.
const imagesDir = existsSync(join(DATASET, 'images')) ? join(DATASET, 'images') : DATASET;
const annotationsDir = join(DATASET, 'annotations');
const hasAnnotations = existsSync(annotationsDir);

/** Pascal VOC boxes, which for this set outline each face and name the arrow's score. */
function parseBoxes(xml) {
	return [...xml.matchAll(/<object>([\s\S]*?)<\/object>/g)].map((match) => {
		const body = match[1];
		const get = (tag) => Number(body.match(new RegExp(`<${tag}>(-?\\d+)</${tag}>`))?.[1] ?? NaN);
		return {
			label: body.match(/<name>([^<]*)<\/name>/)?.[1] ?? '?',
			xmin: get('xmin'),
			ymin: get('ymin'),
			xmax: get('xmax'),
			ymax: get('ymax')
		};
	});
}

const bundled = await build({
	entryPoints: [join(ROOT, 'src/lib/vision/eval-entry.ts')],
	bundle: true,
	format: 'iife',
	globalName: 'VISION',
	write: false
});

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: bundled.outputFiles[0].text });

const files = (await readdir(imagesDir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).slice(0, LIMIT);

let images = 0;
let expectedTotal = 0;
let matched = 0;
let spurious = 0;
const centreErrors = [];
const radiusErrors = [];
const misses = [];
const reasons = new Map();
const nearMisses = [];
let geometryFound = 0;
let unannotated = 0;
let unannotatedFaces = 0;
const geometryErrors = [];
const supports = [];
const badSupports = [];

for (const file of files) {
	const data = await readFile(join(imagesDir, file));
	const mime = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
	const url = `data:${mime};base64,${data.toString('base64')}`;

	const faces = await page.evaluate(async ({ src, tune }) => {
		const image = new Image();
		image.src = src;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, image.width, image.height);
		return {
			width: image.width,
			height: image.height,
			faces: VISION.evaluate(
				{ width: image.width, height: image.height, data: pixels.data },
				4,
				tune.detect,
				tune.rings
			)
		};
	}, { src: url, tune: TUNE });

	images += 1;
	for (const face of faces.faces) {
		if (face.ok) continue;
		reasons.set(face.reason, (reasons.get(face.reason) ?? 0) + 1);
	}

	let expected = [];
	if (hasAnnotations) {
		const xmlPath = join(annotationsDir, `${basename(file, extname(file))}.xml`);
		if (existsSync(xmlPath)) expected = parseBoxes(await readFile(xmlPath, 'utf8'));
	}

	if (expected.length === 0) {
		// No ground truth here, so only the count of faces per image is meaningful.
		unannotated += 1;
		unannotatedFaces += faces.faces.filter((f) => f.ok).length;
		continue;
	}

	expectedTotal += expected.length;
	const taken = new Set();
	for (const box of expected) {
		const bx = (box.xmin + box.xmax) / 2;
		const by = (box.ymin + box.ymax) / 2;
		// The annotation frames the printed spot, which on a three spot reaches the 6 ring: r = 0.5.
		const boxRadius = Math.max(box.xmax - box.xmin, box.ymax - box.ymin) / 2;

		// Geometry first, over every candidate: was a face found in the right place at the right size,
		// regardless of whether the ring check then accepted it?
		const near = faces.faces
			.map((f, i) => ({ f, i, distance: Math.hypot(f.cx - bx, f.cy - by) }))
			.filter((c) => c.distance < boxRadius * 0.5)
			.sort((a, b) => a.distance - b.distance)[0];

		if (near) {
			const error = (near.f.semiMajor * 0.5) / boxRadius - 1;
			geometryErrors.push(error);
			if (Math.abs(error) < 0.15) geometryFound += 1;
			else badSupports.push(near.f.support);
		}

		const best = faces.faces
			.map((f, i) => ({ f, i, distance: Math.hypot(f.cx - bx, f.cy - by) }))
			.filter((c) => c.f.ok && !taken.has(c.i) && c.distance < boxRadius * 0.5)
			.sort((a, b) => a.distance - b.distance)[0];

		if (best) {
			taken.add(best.i);
			matched += 1;
			centreErrors.push(best.distance / boxRadius);
			radiusErrors.push((best.f.semiMajor * 0.5) / boxRadius - 1);
			supports.push(best.f.support);
		} else {
			misses.push(`${file} [${box.label}]`);
			if (near) nearMisses.push(`${near.f.reason} ${near.f.rings.join(' ')}`);
		}
	}
	spurious += faces.faces.filter((f) => f.ok).length - taken.size;
}

const median = (list) => {
	if (list.length === 0) return NaN;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};
const p90 = (list) => {
	if (list.length === 0) return NaN;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length * 0.9)];
};
const pct = (n, d) => (d === 0 ? '-' : `${((n / d) * 100).toFixed(1)}%`);

console.log(`\nimages                ${images}`);
console.log(`annotated faces       ${expectedTotal}`);
console.log(`located (geometry)    ${geometryFound}  (${pct(geometryFound, expectedTotal)} within 15% of the true size)`);
console.log(`accepted (rings)      ${matched}  (${pct(matched, expectedTotal)} recall)`);
console.log(`geometry size error   median ${(median(geometryErrors) * 100).toFixed(1)}%  p90 ${(p90(geometryErrors) * 100).toFixed(1)}%`);
console.log(`spurious faces        ${spurious}  (${(spurious / Math.max(images, 1)).toFixed(2)} per image)`);
console.log(`centre error          median ${median(centreErrors).toFixed(3)}  p90 ${p90(centreErrors).toFixed(3)}  (of spot radius)`);
console.log(
	`radius error          median ${(median(radiusErrors) * 100).toFixed(1)}%  p90 ${(p90(radiusErrors) * 100).toFixed(1)}%`
);
if (unannotated > 0) {
	console.log(
		`unannotated images    ${unannotated}, ${(unannotatedFaces / unannotated).toFixed(2)} faces accepted per image`
	);
}
const q = (list, p) => {
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length * p)] ?? NaN;
};
console.log(
	`ring agreement        good fits p10 ${q(supports, 0.1).toFixed(2)} median ${median(supports).toFixed(2)}` +
		`   bad fits median ${median(badSupports).toFixed(2)} p90 ${q(badSupports, 0.9).toFixed(2)}`
);
console.log(`\nrejected candidates   ${[...reasons].map(([r, n]) => `${r}=${n}`).join(' ') || 'none'}`);
console.log(
	`rejected in the right place   ${nearMisses.length} of ${misses.length} misses`
);
if (nearMisses.length > 0) console.log(`  ${nearMisses.slice(0, 10).join('\n  ')}`);
if (misses.length > 0) console.log(`\nfirst misses:\n  ${misses.slice(0, 8).join('\n  ')}`);

await browser.close();
