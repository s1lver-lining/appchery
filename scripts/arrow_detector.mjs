#!/usr/bin/env node
/**
 * Runs the target detector over one image and prints what it found. Driven by arrow_detector.sh,
 * which is the interface worth using; this half exists because decoding and re-encoding pictures is
 * the browser's job, and the detector itself is browser free.
 *
 * Either detector can be asked for. They answer in the same coordinates and are drawn the same way, so
 * running one after the other over the same picture is the quickest way to see where they differ.
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, join } from 'node:path';

const args = process.argv.slice(2);

/** Flags that take a value, so the value is never mistaken for the file name. */
const TAKES_VALUE = new Set(['-o', '--output', '--scale', '--tune', '--threshold', '--limit', '--every', '--arrows', '-a']);

const flags = new Map();
const loose = [];
for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (!arg.startsWith('-')) {
		loose.push(arg);
	} else if (TAKES_VALUE.has(arg)) {
		flags.set(arg, args[++i]);
	} else {
		flags.set(arg, true);
	}
}

const input = loose[0];
const output = flags.get('-o') ?? flags.get('--output') ?? null;
const json = flags.has('--json');
const learned = flags.has('--ml');
const tune = flags.has('--tune') ? JSON.parse(flags.get('--tune')) : {};
const scale = Number(flags.get('--scale')) || 2;
const threshold = Number(flags.get('--threshold')) || undefined;

if (!input) {
	console.error(
		'usage: arrow_detector.sh <image|video> [--ml] [-o out] [--json] [--scale 2] [--threshold 0.4]'
	);
	process.exit(2);
}

/** Anything ffmpeg will decode as a session recording, which is a different job from a photograph. */
const VIDEO = new Set(['.webm', '.mp4', '.mov', '.mkv', '.avi', '.m4v']);

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

let model = null;
if (learned) {
	try {
		model = JSON.parse(await readFile(join(ROOT, 'src/lib/vision/arrow-model.json'), 'utf8'));
	} catch {
		console.error('No learned model at src/lib/vision/arrow-model.json. Train one first:');
		console.error('  node scripts/prepare-arrows.mjs && .venv-ml/bin/python scripts/train-arrows.py');
		process.exit(1);
	}
}

if (VIDEO.has(extname(input).toLowerCase())) {
	const { replayVideo } = await import('./video_detector.mjs');
	await replayVideo({
		input,
		output,
		watch: flags.has('--watch'),
		model,
		json,
		limit: Number(flags.get('--limit')) || 0,
		everyMs: Number(flags.get('--every')) || 0,
		arrows: Number(flags.get('--arrows') ?? flags.get('-a')) || 0,
		pretty: flags.has('--pretty'),
		sharp: flags.has('--sharp')
	});
	process.exit(0);
}

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
	async ({ src, scale, wantOverlay, tune, model, threshold }) => {
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
		const faces = model
			? VISION.analyseLearned(frame, scale, model, threshold)
			: VISION.analyse(frame, scale, tune);

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
				/**
				 * The streak that was found, so a mistaken shadow shows up as the wrong shape rather than
				 * a score. The learned detector has no streak to show: it answers with a point, so there
				 * is nothing to draw and the circle stands alone.
				 */
				if (arrow.length > 0) {
					context.beginPath();
					context.moveTo(arrow.tailX, arrow.tailY);
					context.lineTo(arrow.imageX, arrow.imageY);
					context.lineWidth = line;
					context.strokeStyle = 'rgba(0,230,118,0.7)';
					context.stroke();
				}

				context.beginPath();
				context.arc(arrow.imageX, arrow.imageY, line * 4, 0, Math.PI * 2);
				context.strokeStyle = '#00e676';
				context.stroke();

				const text = arrow.decimal === null ? arrow.label : arrow.decimal.toFixed(1);
				context.lineWidth = line * 2;
				context.strokeStyle = 'rgba(0,0,0,0.85)';
				context.strokeText(text, arrow.imageX, arrow.imageY - line * 10);
				context.fillStyle = '#ffffff';
				context.fillText(text, arrow.imageX, arrow.imageY - line * 10);
			}
		}

		return {
			width: image.width,
			height: image.height,
			faces,
			png: canvas.toDataURL('image/png')
		};
	},
	{ src: url, scale, wantOverlay: Boolean(output), tune, model, threshold }
);

await browser.close();

if (json) {
	const { png, ...rest } = result;
	console.log(JSON.stringify(rest, null, 2));
} else {
	console.log(`${input}  ${result.width}x${result.height}  [${learned ? 'learned' : 'classical'}]`);
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
			// Each detector has its own evidence to show: a shaft length, or a confidence.
			const evidence =
				arrow.confidence === undefined
					? `shaft ${arrow.length.toFixed(0)}px`
					: `confidence ${(arrow.confidence * 100).toFixed(0)}%`;
			console.log(
				`    ${arrow.decimal === null ? arrow.label : arrow.decimal.toFixed(1)}` +
					`  at ${arrow.x.toFixed(2)},${arrow.y.toFixed(2)}  ${evidence}`
			);
		}
	});
	console.log(
		learned
			? '\n  Candidates, not scores. Trained on one hall and one phone, so it reads pictures like\n' +
					'  those far better than it reads anything else. Use the live camera for actual scoring.'
			: '\n  Candidates, not scores: a still has no quiet reference frame, so every hole, tear and\n' +
					'  pencil mark is a candidate too. Use the live camera for actual scoring.'
	);
}

if (output && result.png) {
	await writeFile(resolve(output), Buffer.from(result.png.split(',')[1], 'base64'));
	console.log(`\n  overlay written to ${output}`);
}
