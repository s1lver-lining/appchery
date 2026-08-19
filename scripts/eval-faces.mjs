#!/usr/bin/env node
/**
 * Measures the face detector against faces fitted by hand, on the recordings it will actually run on.
 *
 * The annotated set the face stage was tuned on is 650 photographs of indoor three spots taken from
 * across a hall, and the detector scores 98% on it. None of that says anything about an archer walking
 * up to a boss, which is a different problem: the face fills the frame, it leans, and the error that
 * matters is not whether the face was found but whether the frame it defines is the right one. A label
 * placed in a frame that is a few percent off is a label a few percent off, every time.
 *
 *   node scripts/eval-faces.mjs
 *
 * Ground truth comes from scripts/label-arrows.mjs, where the four anchors are dragged onto the black
 * to white edge by hand.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');
const SCALE = 4;
const ANCHOR = 0.8;
const ANCHORS = [
	[ANCHOR, 0],
	[0, ANCHOR],
	[-ANCHOR, 0],
	[0, -ANCHOR]
];

const { locate } = await load();
const errors = [];
const lopsided = [];
const missed = [];
let frames = 0;

for (const name of (await readdir(WORK)).sort()) {
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) continue;
	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	const samples = (await readdir(folder)).filter((f) => f.startsWith('sample-')).sort();

	for (const [index, entry] of Object.entries(label.frames ?? {})) {
		// Only fits the archer actually placed: an untouched automatic seed would be measuring itself.
		if (entry.skip || !entry.handles || !(entry.touched ?? true)) continue;
		const truth = homography(entry.handles);
		if (!truth) continue;
		frames += 1;

		const pixels = await decode(join(folder, samples[Number(index)]), meta.width, meta.height);
		const found = locate({ width: meta.width, height: meta.height, data: pixels }, SCALE);
		if (!found) {
			missed.push(`${name.slice(-24)} frame ${index}`);
			continue;
		}

		/**
		 * What the labels actually assert, and nothing more: these four points lie on the edge between
		 * the black and the white, which ten equal rings put at 0.8 of the radius. So the detector is
		 * asked what radius it thinks each of them is at.
		 *
		 * Comparing whole coordinate frames instead reads in two things the labels never claimed. A
		 * target face is rotationally symmetric, so which way round the frame sits is free. And the
		 * handles are not 90 degrees apart on the face: a person places them at the top, bottom and
		 * sides of the ellipse they can see, which under perspective are different points entirely.
		 * Measuring the ring itself is blind to both.
		 */
		let sum = 0;
		let worst = 0;
		let count = 0;
		for (const [hx, hy] of entry.handles) {
			const seen = toFace(found, hx, hy);
			const off = Math.abs(Math.hypot(seen.x, seen.y) - ANCHOR);
			sum += off;
			worst = Math.max(worst, off);
			count += 1;
		}

		/**
		 * Whether the ring is merely the wrong size or is off to one side. Opposite handles landing at
		 * radii that differ is the signature of a displaced centre, which is the error that biases every
		 * arrow the same way, and it is invisible to an average over the four.
		 */
		const radii = entry.handles.map(([hx, hy]) => {
			const seen = toFace(found, hx, hy);
			return Math.hypot(seen.x, seen.y);
		});
		lopsided.push((Math.max(...radii) - Math.min(...radii)) / 2);

		errors.push({ mean: sum / count, worst, video: name.slice(-24), frame: index });
	}
}

if (frames === 0) {
	console.error('No hand fitted faces found. Label some with scripts/label-arrows.mjs first.');
	process.exit(2);
}

const means = errors.map((e) => e.mean).sort((a, b) => a - b);
const at = (share) => means[Math.min(means.length - 1, Math.floor(means.length * share))] ?? 0;
const pct = (v) => `${(v * 100).toFixed(1)}%`;

console.log(`hand fitted faces   ${frames}`);
console.log(`found by detector   ${errors.length} (${((errors.length / frames) * 100).toFixed(0)}%)`);
const skew = [...lopsided].sort((a, b) => a - b);
const sk = (share) => skew[Math.min(skew.length - 1, Math.floor(skew.length * share))] ?? 0;
console.log(`ring radius error   ${pct(at(0.5))} of face radius median, ${pct(at(0.9))} at p90`);
console.log(`                    a ring is 10% of the radius, so that is ${(at(0.5) * 10).toFixed(2)} rings median`);
console.log(`off centre by       ${pct(sk(0.5))} median, ${pct(sk(0.9))} at p90`);
if (missed.length > 0) console.log(`\nnot found:\n  ${missed.join('\n  ')}`);

const worstFew = [...errors].sort((a, b) => b.mean - a.mean).slice(0, 10);
console.log('\nworst frames:');
for (const e of worstFew) console.log(`  ${e.video} frame ${e.frame}  ${pct(e.mean)}`);

function homography(points) {
	const rows = [];
	for (let i = 0; i < 4; i++) {
		const [u, v] = ANCHORS[i];
		const [x, y] = points[i];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}
	const h = solve(rows);
	return h && [
		[h[0], h[1], h[2]],
		[h[3], h[4], h[5]],
		[h[6], h[7], 1]
	];
}

function solve(rows) {
	const n = 8;
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
		}
		if (Math.abs(rows[pivot][col]) < 1e-12) return null;
		[rows[col], rows[pivot]] = [rows[pivot], rows[col]];
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = rows[r][col] / rows[col][col];
			for (let c = col; c <= n; c++) rows[r][c] -= factor * rows[col][c];
		}
	}
	return rows.map((row, i) => row[n] / row[i]);
}

function project(h, x, y) {
	const w = h[2][0] * x + h[2][1] * y + h[2][2];
	return {
		x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
		y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w
	};
}

/** Image pixels back into the detector's face frame, the inverse of its own projection. */
function toFace(face, x, y) {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);
	const a = face.semiMajor * cos;
	const b = -face.semiMinor * sin;
	const d = face.semiMajor * sin;
	const e = face.semiMinor * cos;
	const dx = x - face.cx;
	const dy = y - face.cy;
	const g = face.perspectiveX ?? 0;
	const h = face.perspectiveY ?? 0;
	const a1 = a - dx * g;
	const b1 = b - dx * h;
	const a2 = d - dy * g;
	const b2 = e - dy * h;
	const det = a1 * b2 - b1 * a2;
	if (Math.abs(det) < 1e-9) return { x: 0, y: 0 };
	return { x: (dx * b2 - b1 * dy) / det, y: (a1 * dy - dx * a2) / det };
}

function toImage(face, x, y) {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);
	const px = x * face.semiMajor;
	const py = y * face.semiMinor;
	const depth = 1 + (face.perspectiveX ?? 0) * x + (face.perspectiveY ?? 0) * y;
	const k = Math.abs(depth) < 1e-6 ? 1 : 1 / depth;
	return { x: face.cx + (px * cos - py * sin) * k, y: face.cy + (px * sin + py * cos) * k };
}

async function load() {
	const directory = await mkdtemp(join(tmpdir(), 'appchery-vision-'));
	const outfile = join(directory, 'vision.mjs');
	await build({
		entryPoints: [join(ROOT, 'src/lib/vision/still-entry.ts')],
		bundle: true,
		format: 'esm',
		platform: 'node',
		outfile
	});
	const module = await import(outfile);
	setTimeout(() => rm(directory, { recursive: true, force: true }), 0).unref?.();
	return module;
}

function decode(file, width, height) {
	return new Promise((good, bad) => {
		const child = spawn('ffmpeg', [
			'-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
		], { stdio: ['ignore', 'pipe', 'inherit'] });
		const bits = [];
		child.stdout.on('data', (b) => bits.push(b));
		child.on('error', bad);
		child.on('close', () => {
			const buffer = Buffer.concat(bits);
			good(new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, width * height * 4));
		});
	});
}
