#!/usr/bin/env node
/**
 * A generalisation test, on a dataset neither detector has ever been trained on.
 *
 * The trispot set labels each *spot* with the score of the arrow that landed in it, not with where the
 * arrow is, so it cannot measure how precisely an impact is placed. What it can measure is the thing
 * that matters most and is hardest to check any other way: whether a detector, taken to a different
 * venue and pointed at pictures from eight different cameras, still finds an arrow at all and still
 * calls it the right ring.
 *
 * The learned detector was trained on one hall, one phone, one archer. Everything reported elsewhere
 * is in domain. This is the out of domain number.
 *
 *   node scripts/eval-trispot.mjs [--detector classical|learned] [--limit 200]
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};
const detector = flag('--detector', 'classical');
const limit = Number(flag('--limit', '0')) || Infinity;
const threshold = Number(flag('--threshold', '0')) || undefined;

const ROOT = new URL('..', import.meta.url).pathname;
const DATASET = join(ROOT, flag('--dir', 'test/datasets/DutchTargetData_Kaggle'));

const model =
	detector === 'learned'
		? JSON.parse(await readFile(join(ROOT, 'src/lib/vision/arrow-model.json'), 'utf8'))
		: null;

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

/** Pulls the labelled spots out of one Pascal VOC file: a box and the score shot into it. */
function spotsFrom(xml) {
	const spots = [];
	for (const block of xml.split('<object>').slice(1)) {
		const name = /<name>([^<]*)<\/name>/.exec(block)?.[1];
		const box = ['xmin', 'ymin', 'xmax', 'ymax'].map(
			(tag) => Number(new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block)?.[1])
		);
		if (!name || box.some((v) => !Number.isFinite(v))) continue;
		spots.push({ value: name === 'M' ? 0 : Number(name), box });
	}
	return spots;
}

const files = (await readdir(join(DATASET, 'annotations'))).filter((f) => f.endsWith('.xml'));
const images = await readdir(join(DATASET, 'images'));
const byStem = new Map(images.map((f) => [basename(f, extname(f)), f]));

const totals = { images: 0, spots: 0, faced: 0, answered: 0, agreed: 0, within: 0 };

for (const file of files) {
	if (totals.images >= limit) break;
	const stem = basename(file, '.xml');
	const image = byStem.get(stem);
	if (!image) continue;

	const spots = spotsFrom(await readFile(join(DATASET, 'annotations', file), 'utf8'));
	// Misses tell us nothing about reading a ring, and the labels do not say where they landed.
	const scored = spots.filter((s) => s.value > 0);
	if (scored.length === 0) continue;

	const bytes = await readFile(join(DATASET, 'images', image));
	totals.images++;
	totals.spots += scored.length;

	const found = await page.evaluate(
		async ({ src, model, threshold }) => {
			const picture = new Image();
			picture.src = src;
			await picture.decode();
			const canvas = document.createElement('canvas');
			canvas.width = picture.width;
			canvas.height = picture.height;
			const context = canvas.getContext('2d', { willReadFrequently: true });
			context.drawImage(picture, 0, 0);
			const pixels = context.getImageData(0, 0, picture.width, picture.height);
			const frame = { width: picture.width, height: picture.height, data: pixels.data };
			return model
				? VISION.analyseLearned(frame, 2, model, threshold)
				: VISION.analyse(frame, 2);
		},
		{ src: `data:image/jpeg;base64,${bytes.toString('base64')}`, model, threshold }
	);

	for (const spot of scored) {
		const [xmin, ymin, xmax, ymax] = spot.box;
		const cx = (xmin + xmax) / 2;
		const cy = (ymin + ymax) / 2;
		// The detected face whose centre sits closest to this labelled spot, if any is near enough.
		const face = found
			.map((f) => ({ f, d: Math.hypot(f.cx - cx, f.cy - cy) }))
			.filter((m) => m.d < (xmax - xmin) / 2)
			.sort((a, b) => a.d - b.d)[0]?.f;
		if (!face) continue;
		totals.faced++;

		// The strongest arrow it offers for this spot, since the label says exactly one landed here.
		const best = face.arrows[0];
		if (!best) continue;
		totals.answered++;

		const said = best.decimal === null ? 0 : Math.floor(best.decimal);
		if (said === spot.value) totals.agreed++;
		if (Math.abs(said - spot.value) <= 1) totals.within++;
	}
}

await browser.close();

const pct = (n, d) => (d === 0 ? '0.0' : ((n / d) * 100).toFixed(1));
console.log(`detector             ${detector}`);
console.log(`images               ${totals.images}`);
console.log(`labelled spots       ${totals.spots}`);
console.log(`spot located         ${pct(totals.faced, totals.spots)}%`);
console.log(`arrow offered        ${pct(totals.answered, totals.faced)}% of located spots`);
console.log(`ring exactly right   ${pct(totals.agreed, totals.answered)}% of those answered`);
console.log(`ring within one      ${pct(totals.within, totals.answered)}% of those answered`);
console.log(`end to end           ${pct(totals.agreed, totals.spots)}% of labelled spots`);
