#!/usr/bin/env node
/**
 * Runs the target detector over one image and prints what it found. Driven by arrow_detector.sh,
 * which is the interface worth using; this half exists because decoding and re-encoding pictures is
 * the browser's job, and the detector itself is browser free.
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, join } from 'node:path';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('-'));
const outIndex = args.findIndex((a) => a === '-o' || a === '--output');
const output = outIndex === -1 ? null : args[outIndex + 1];
const json = args.includes('--json');
const scale = Number(args[args.indexOf('--scale') + 1]) || 4;

if (!input) {
	console.error('usage: arrow_detector.sh <image> [-o overlay.png] [--json] [--scale 4]');
	process.exit(2);
}

const MIME = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.bmp': 'image/bmp',
	'.avif': 'image/avif'
};

const ROOT = new URL('..', import.meta.url).pathname;
const bundled = await build({
	entryPoints: [join(ROOT, 'src/lib/vision/still-entry.ts')],
	bundle: true,
	format: 'iife',
	globalName: 'VISION',
	write: false
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: bundled.outputFiles[0].text });

const data = await readFile(resolve(input));
const mime = MIME[extname(input).toLowerCase()] ?? 'image/jpeg';
const url = `data:${mime};base64,${data.toString('base64')}`;

const result = await page.evaluate(
	async ({ src, scale, wantOverlay }) => {
		const image = new Image();
		image.src = src;
		await image.decode();

		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		context.drawImage(image, 0, 0);

		const pixels = context.getImageData(0, 0, image.width, image.height);
		const faces = VISION.analyse(
			{ width: image.width, height: image.height, data: pixels.data },
			scale
		);

		if (!wantOverlay) return { width: image.width, height: image.height, faces, png: null };

		const line = Math.max(2, image.width / 500);
		for (const face of faces) {
			// The face, ring by ring, so a wrong fit is obvious rather than hidden behind a score.
			for (const share of [0.2, 0.4, 0.6, 0.8, 1.0]) {
				context.beginPath();
				context.ellipse(
					face.cx,
					face.cy,
					face.semiMajor * share,
					face.semiMinor * share,
					face.rotation,
					0,
					Math.PI * 2
				);
				context.lineWidth = share === 0.2 ? line * 1.5 : line;
				context.strokeStyle = share === 0.2 ? '#00e676' : 'rgba(255,0,255,0.85)';
				context.stroke();
			}

			context.font = `bold ${Math.round(image.width / 45)}px sans-serif`;
			context.textAlign = 'center';
			context.textBaseline = 'middle';

			for (const arrow of face.arrows) {
				const radius = Math.max(6, Math.sqrt(arrow.area / Math.PI) * 1.4);
				context.beginPath();
				context.arc(arrow.imageX, arrow.imageY, radius, 0, Math.PI * 2);
				context.lineWidth = line;
				context.strokeStyle = '#00e676';
				context.stroke();

				const text = arrow.decimal === null ? arrow.label : arrow.decimal.toFixed(1);
				context.lineWidth = line * 2;
				context.strokeStyle = 'rgba(0,0,0,0.85)';
				context.strokeText(text, arrow.imageX, arrow.imageY - radius - 12);
				context.fillStyle = '#ffffff';
				context.fillText(text, arrow.imageX, arrow.imageY - radius - 12);
			}
		}

		return {
			width: image.width,
			height: image.height,
			faces,
			png: canvas.toDataURL('image/png')
		};
	},
	{ src: url, scale, wantOverlay: Boolean(output) }
);

await browser.close();

if (json) {
	const { png, ...rest } = result;
	console.log(JSON.stringify(rest, null, 2));
} else {
	console.log(`${input}  ${result.width}x${result.height}`);
	if (result.faces.length === 0) {
		console.log('  no target face found');
	}
	result.faces.forEach((face, i) => {
		console.log(
			`  face ${i + 1}: centre ${face.cx.toFixed(0)},${face.cy.toFixed(0)}  ` +
				`radius ${face.semiMajor.toFixed(0)}x${face.semiMinor.toFixed(0)}  ` +
				`ring agreement ${(face.agreement * 100).toFixed(0)}%`
		);
		if (face.arrows.length === 0) console.log('    no candidates');
		for (const arrow of face.arrows.slice(0, 12)) {
			console.log(
				`    ${arrow.decimal === null ? arrow.label : arrow.decimal.toFixed(1)}` +
					`  at ${arrow.x.toFixed(2)},${arrow.y.toFixed(2)}  ${arrow.area.toFixed(0)}px`
			);
		}
	});
	console.log(
		'\n  Candidates, not scores: a still has no quiet reference frame, so every hole, tear and\n' +
			'  pencil mark is a candidate too. Use the live camera for actual scoring.'
	);
}

if (output && result.png) {
	await writeFile(resolve(output), Buffer.from(result.png.split(',')[1], 'base64'));
	console.log(`\n  overlay written to ${output}`);
}
