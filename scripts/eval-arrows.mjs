#!/usr/bin/env node
/**
 * Scores the still image arrow detector against the labelled 60cm set, which carries one keypoint per
 * arrow with the value the archer wrote down.
 *
 *   node scripts/eval-arrows.mjs [--limit 100] [--tune '{"darkness":0.8}'] [--dir test/datasets/60cm]
 *
 * Detection is a whole pipeline, so a single number hides which stage lost the arrow. Faces found,
 * arrows recalled and values agreed are reported apart, because that is what says where to look next.
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};
const dir = flag('--dir', 'test/datasets/60cm');
const limit = Number(flag('--limit', '0')) || Infinity;
const tune = JSON.parse(flag('--tune', '{}'));
const scale = Number(flag('--scale', '2'));

const ROOT = new URL('..', import.meta.url).pathname;
const tasks = JSON.parse(await readFile(join(ROOT, dir, 'annotation.json'), 'utf8'));

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

const totals = {
	images: 0,
	faces: 0,
	truth: 0,
	found: 0,
	matched: 0,
	valueAgreed: 0,
	offset: []
};

for (const task of tasks) {
	if (totals.images >= limit) break;

	const result = task.annotations?.[0]?.result ?? task.drafts?.[0]?.result ?? [];
	// Misses land off the face, so they are not something the detector is asked to place.
	const truth = result
		.filter((r) => r.value?.keypointlabels?.[0] && r.value.keypointlabels[0] !== 'Miss')
		.map((r) => ({
			x: (r.value.x / 100) * r.original_width,
			y: (r.value.y / 100) * r.original_height,
			value: r.value.keypointlabels[0] === 'X' ? 10 : Number(r.value.keypointlabels[0])
		}));
	if (truth.length === 0) continue;

	const name = (task.file_upload ?? '').replace(/^[0-9a-f]+-/, '');
	let bytes;
	try {
		bytes = await readFile(join(ROOT, dir, name));
	} catch {
		continue;
	}

	totals.images++;
	totals.truth += truth.length;

	const url = `data:image/jpeg;base64,${bytes.toString('base64')}`;
	const faces = await page.evaluate(
		async ({ src, scale, tune }) => {
			const image = new Image();
			image.src = src;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d', { willReadFrequently: true });
			context.drawImage(image, 0, 0);
			const pixels = context.getImageData(0, 0, image.width, image.height);
			return VISION.analyse(
				{ width: image.width, height: image.height, data: pixels.data },
				scale,
				tune
			);
		},
		{ src: url, scale, tune }
	);

	if (faces.length === 0) continue;
	// The labels belong to one face, so the biggest one is the one they describe.
	const face = faces.sort((a, b) => b.semiMajor - a.semiMajor)[0];
	totals.faces++;
	totals.found += face.arrows.length;

	const claimed = new Set();
	const tolerance = face.semiMajor * 0.08;
	for (const arrow of face.arrows) {
		let best = -1;
		let bestGap = Infinity;
		truth.forEach((t, i) => {
			if (claimed.has(i)) return;
			const gap = Math.hypot(t.x - arrow.imageX, t.y - arrow.imageY);
			if (gap < bestGap) {
				bestGap = gap;
				best = i;
			}
		});
		if (best === -1 || bestGap > tolerance) continue;
		claimed.add(best);
		totals.matched++;
		totals.offset.push(bestGap / face.semiMajor);
		const said = arrow.decimal === null ? 0 : Math.floor(arrow.decimal);
		if (said === truth[best].value) totals.valueAgreed++;
	}
}

await browser.close();

const pct = (n, d) => (d === 0 ? '0.0' : ((n / d) * 100).toFixed(1));
totals.offset.sort((a, b) => a - b);
const median = totals.offset[Math.floor(totals.offset.length / 2)] ?? 0;

console.log(`images with labels   ${totals.images}`);
console.log(`face found           ${pct(totals.faces, totals.images)}%`);
console.log(`arrows labelled      ${totals.truth}`);
console.log(`arrows reported      ${totals.found}`);
console.log(`recall               ${pct(totals.matched, totals.truth)}%`);
console.log(`precision            ${pct(totals.matched, totals.found)}%`);
console.log(`value agreed         ${pct(totals.valueAgreed, totals.matched)}% of matched`);
console.log(`median offset        ${(median * 100).toFixed(1)}% of face radius`);
