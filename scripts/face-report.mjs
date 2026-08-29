#!/usr/bin/env node
/**
 * What the face stage makes of each picture in a directory, one line per candidate.
 *
 * eval-vision reports the set as a whole, which is what a threshold sweep needs. This reports the
 * pictures one at a time, which is what you need when a particular boss is not being found and the
 * question is why: which ring failed, what colour it read, and how much of it agreed.
 *
 *   node scripts/face-report.mjs --dir <folder of images> [--limit 40] [--scale 4]
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
const LIMIT = Number(option('limit', 40));
const SCALE = Number(option('scale', 4));

if (!existsSync(DIR)) {
	console.error(`No such directory: ${DIR}`);
	process.exit(2);
}

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

let accepted = 0;
for (const name of files) {
	const data = readFileSync(join(DIR, name)).toString('base64');
	const found = await page.evaluate(
		async ({ data, scale }) => {
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
			return {
				width: image.width,
				height: image.height,
				faces: VISION.evaluate(frame, scale)
			};
		},
		{ data, scale: SCALE }
	);

	const ok = found.faces.filter((face) => face.ok);
	if (ok.length > 0) accepted += 1;
	console.log(`\n${name}  ${found.width}x${found.height}  candidates ${found.faces.length}, accepted ${ok.length}`);
	for (const face of found.faces.slice(0, 4)) {
		console.log(
			`  ${face.ok ? 'OK ' : 'no '} centre ${face.cx.toFixed(0)},${face.cy.toFixed(0)}` +
				`  axes ${face.semiMajor.toFixed(0)}/${face.semiMinor.toFixed(0)}` +
				`  support ${face.support.toFixed(2)}` +
				`  ${face.reason ?? ''}  rings ${face.rings.join(' ')}`
		);
	}
}

console.log(`\n${accepted} of ${files.length} pictures got a face`);
await browser.close();
