#!/usr/bin/env node
/**
 * The colour a face reads at each radius, out past its own edge.
 *
 * The ring check asks four questions at four radii. When a boss is being turned away and the four
 * answers do not explain why, what is wanted is the whole profile: where the colours change, how
 * well each ring agrees with itself, and whether there is an edge at the paper at all. That is what
 * says whether a rule can tell this face from a yellow bag on a grey wall.
 *
 *   node scripts/face-profile.mjs --dir <folder> [--limit 6]
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = option('dir', join(ROOT, 'test/pictures'));
const LIMIT = Number(option('limit', 6));
const SCALE = Number(option('scale', 4));

if (!existsSync(DIR)) {
	console.error(`No such directory: ${DIR}`);
	process.exit(2);
}

const RADII = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];

const bundled = await build({
	entryPoints: [join(ROOT, 'src/lib/vision/eval-entry.ts')],
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

const files = readdirSync(DIR)
	.filter((name) => ['.jpg', '.jpeg', '.png'].includes(extname(name).toLowerCase()))
	.sort()
	.slice(0, LIMIT);

for (const name of files) {
	const data = readFileSync(join(DIR, name)).toString('base64');
	const rows = await page.evaluate(
		async ({ data, scale, radii }) => {
			const image = new Image();
			image.src = `data:image/jpeg;base64,${data}`;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d', { willReadFrequently: true });
			context.drawImage(image, 0, 0);
			const pixels = context.getImageData(0, 0, image.width, image.height);
			const frame = { width: image.width, height: image.height, data: pixels.data };

			// Four radii at a time, which is what the ring check takes, walked over the whole list.
			const out = [];
			for (let i = 0; i < radii.length; i += 4) {
				const group = radii.slice(i, i + 4);
				const faces = VISION.evaluate(frame, scale, {}, {
					gold: group[0],
					red: group[1] ?? group[0],
					mid: group[2] ?? group[0],
					outer: group[3] ?? group[0]
				});
				if (faces.length === 0) return null;
				out.push(...faces[0].rings.slice(0, group.length));
			}
			return out;
		},
		{ data, scale: SCALE, radii: RADII }
	);

	console.log(`\n${name}`);
	if (!rows) {
		console.log('  no candidate');
		continue;
	}
	for (const row of rows) console.log(`  ${row}`);
}

await browser.close();
