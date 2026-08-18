#!/usr/bin/env node
/**
 * Labels the arrows in recorded scoring sessions, which is the part of a learned detector that cannot
 * be automated away.
 *
 * The trick that makes it quick is that nothing being labelled moves. An arrow stands in the boss for
 * the whole recording, and the face fit gives a coordinate frame in which the camera walking around
 * changes nothing. So an impact clicked once is an impact labelled in every frame of that video, and
 * fifteen recordings come down to about ninety clicks rather than ninety thousand.
 *
 *   node scripts/label-arrows.mjs prepare     # find the face on every frame, pick frames to label
 *   node scripts/label-arrows.mjs serve       # click the arrows, then check the propagation
 *   node scripts/label-arrows.mjs export      # write the training set
 *
 * The workspace is kept outside the repository: it holds decoded frames and is large.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');
const WORK = join(ROOT, 'test/datasets/labelling');
const SCALE = 4;

/** Frames offered for labelling and for checking the propagation, spread across the recording. */
const SAMPLES = 24;

const command = process.argv[2] ?? 'prepare';
const only = argument('--video');

if (command === 'prepare') await prepare();
else if (command === 'serve') await serve();
else if (command === 'export') await exportSet();
else {
	console.error('usage: label-arrows.mjs [prepare|serve|export] [--video <name>]');
	process.exit(2);
}

function argument(name) {
	const i = process.argv.indexOf(name);
	return i === -1 ? null : process.argv[i + 1];
}

/**
 * Runs the face fit over every frame of every recording and keeps the geometry.
 *
 * Done once, up front, because it is the slow part and because the frames worth labelling are the
 * ones where the fit is best: clicking an arrow on a frame whose rings are askew puts the label in
 * the wrong place on the face, and then every propagated copy of it is wrong too.
 */
async function prepare() {
	const { FaceTrack } = await load();
	await mkdir(WORK, { recursive: true });

	for (const name of await recordings()) {
		const file = join(VIDEOS, name);
		const { width, height, fps } = await probe(file);
		const track = new FaceTrack();
		const geometry = [];

		process.stderr.write(`${name}\n`);
		let index = 0;
		for await (const frame of decode(file, width, height)) {
			const full = { width, height, data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length) };
			const face = track.push(reduce(full, SCALE));
			const placed = face
				? {
						cx: face.cx * SCALE,
						cy: face.cy * SCALE,
						semiMajor: face.semiMajor * SCALE,
						semiMinor: face.semiMinor * SCALE,
						rotation: face.rotation,
						support: face.support
					}
				: null;
			if (placed) placed.visible = visibility(placed, width, height);
			geometry.push(placed);
			index += 1;
			if (index % 100 === 0) process.stderr.write(`\r  ${index} frames`);
		}
		process.stderr.write(`\r  ${index} frames, face on ${geometry.filter(Boolean).length}\n`);

		/**
		 * The frames to show, best fit first but spread over the whole recording: a run of neighbouring
		 * frames is the same viewpoint, and checking a propagation against one viewpoint checks nothing.
		 */
		const chosen = spread(geometry, SAMPLES);
		await mkdir(join(WORK, name), { recursive: true });
		await extract(file, chosen, join(WORK, name));
		await writeFile(
			join(WORK, name, 'frames.json'),
			JSON.stringify({ video: name, width, height, fps, frames: index, geometry, chosen }, null, 1)
		);
	}

	console.log(`\nPrepared ${(await recordings()).length} recordings into ${WORK}`);
	console.log('Now run: node scripts/label-arrows.mjs serve');
}

/**
 * Share of the face that is actually in the picture.
 *
 * Ring agreement alone is no guide to a frame worth labelling, because samples falling off the edge
 * are skipped rather than counted against the fit: a face with a corner of its gold in shot scores
 * almost perfectly on that corner. Those are the worst frames to click on and they were being offered
 * first.
 */
function visibility(face, width, height) {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);
	let inside = 0;
	let total = 0;
	for (let ring = 0.2; ring <= 1.0001; ring += 0.2) {
		for (let i = 0; i < 24; i++) {
			const angle = (i / 24) * Math.PI * 2;
			const fx = Math.cos(angle) * ring * face.semiMajor;
			const fy = Math.sin(angle) * ring * face.semiMinor;
			const x = face.cx + fx * cos - fy * sin;
			const y = face.cy + fx * sin + fy * cos;
			total += 1;
			if (x >= 0 && y >= 0 && x < width && y < height) inside += 1;
		}
	}
	return total === 0 ? 0 : inside / total;
}

/** How good a frame is to label on: fitted well, and with the face actually in the picture. */
function quality(face) {
	return face ? face.support * (face.visible ?? 1) : 0;
}

/** Picks well fitted frames spread across the recording, so the checks cover different viewpoints. */
function spread(geometry, count) {
	const usable = geometry
		.map((face, index) => ({ index, score: quality(face) }))
		.filter((f) => f.score > 0);
	if (usable.length === 0) return [];

	const buckets = Math.min(count, usable.length);
	const size = usable.length / buckets;
	const chosen = [];
	for (let i = 0; i < buckets; i++) {
		const slice = usable.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1));
		// The best frame of each stretch, so a click lands on rings that are actually right.
		chosen.push(slice.reduce((best, f) => (f.score > best.score ? f : best)).index);
	}
	return chosen;
}

async function extract(file, indices, into) {
	if (indices.length === 0) return;
	const wanted = new Set(indices);
	const select = indices.map((i) => `eq(n\\,${i})`).join('+');
	await run('ffmpeg', [
		'-v', 'error', '-y', '-i', file,
		'-vf', `select='${select}'`, '-fps_mode', 'passthrough',
		'-q:v', '3', join(into, 'sample-%03d.jpg')
	]);
	// ffmpeg numbers what it wrote from one, so the mapping back to frame numbers is kept beside it.
	await writeFile(join(into, 'order.json'), JSON.stringify([...wanted].sort((a, b) => a - b)));
}

async function recordings() {
	const all = (await readdir(VIDEOS)).filter((n) => /\.(webm|mp4|mov|mkv)$/i.test(n)).sort();
	return only ? all.filter((n) => n.includes(only)) : all;
}

/** The labelling page, served locally so clicks can be written straight back to the workspace. */
async function serve() {
	const port = Number(argument('--port')) || 8787;
	const server = createServer(async (request, response) => {
		const url = new URL(request.url, `http://localhost:${port}`);

		try {
			if (url.pathname === '/') return send(response, 200, 'text/html', await page());

			if (url.pathname === '/manifest') {
				const videos = [];
				for (const name of await readdir(WORK)) {
					const meta = join(WORK, name, 'frames.json');
					if (!existsSync(meta)) continue;
					const data = JSON.parse(await readFile(meta, 'utf8'));
					const labels = join(WORK, name, 'labels.json');
					videos.push({
						video: name,
						width: data.width,
						height: data.height,
						frames: data.frames,
						chosen: data.chosen,
						geometry: data.chosen.map((i) => data.geometry[i]),
						samples: (await readdir(join(WORK, name))).filter((f) => f.startsWith('sample-')).sort(),
						labels: existsSync(labels) ? JSON.parse(await readFile(labels, 'utf8')) : null
					});
				}
				return send(response, 200, 'application/json', JSON.stringify(videos));
			}

			if (url.pathname.startsWith('/image/')) {
				const [, , video, file] = url.pathname.split('/');
				return send(response, 200, 'image/jpeg', await readFile(join(WORK, decodeURIComponent(video), file)));
			}

			if (url.pathname.startsWith('/labels/') && request.method === 'POST') {
				const video = decodeURIComponent(url.pathname.split('/')[2]);
				const body = await text(request);
				await writeFile(join(WORK, video, 'labels.json'), body);
				return send(response, 200, 'application/json', '{"saved":true}');
			}

			send(response, 404, 'text/plain', 'not found');
		} catch (error) {
			send(response, 500, 'text/plain', String(error));
		}
	});

	server.listen(port, () => {
		console.log(`Labelling on http://localhost:${port}`);
		console.log('Click each arrow once on the first frame, then check the propagated ones.');
	});
}

function send(response, status, type, body) {
	response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
	response.end(body);
}

function text(request) {
	return new Promise((good) => {
		let body = '';
		request.on('data', (chunk) => (body += chunk));
		request.on('end', () => good(body));
	});
}

async function page() {
	return readFile(join(ROOT, 'scripts/lib/label.html'), 'utf8');
}

/**
 * Writes the training set: one crop per frame that has a face, with the impacts placed by propagating
 * the clicked face coordinates. Frames the archer rejected in the check pass are left out.
 */
async function exportSet() {
	const out = join(ROOT, 'test/datasets/prepared-videos');
	await mkdir(join(out, 'images'), { recursive: true });
	const labels = [];

	for (const name of await recordings()) {
		const folder = join(WORK, name);
		if (!existsSync(join(folder, 'labels.json'))) {
			console.log(`  ${name}: not labelled, skipped`);
			continue;
		}
		const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
		const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
		const rejected = new Set(label.rejected ?? []);

		let written = 0;
		let index = 0;
		for await (const frame of decode(join(VIDEOS, name), meta.width, meta.height)) {
			const face = meta.geometry[index];
			const at = index;
			index += 1;
			if (!face || rejected.has(at)) continue;
			// Only well fitted frames: a label propagated through a poor fit is a wrong label.
			if (quality(face) < (label.minQuality ?? 0.7)) continue;

			const file = `${name.replace(/\.[^.]+$/, '')}-${String(at).padStart(6, '0')}.jpg`;
			await writeCrop(
				{ width: meta.width, height: meta.height, data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length) },
				face,
				join(out, 'images', file)
			);
			labels.push({ image: file, video: name, frame: at, impacts: label.arrows });
			written += 1;
		}
		console.log(`  ${name}: ${written} frames, ${label.arrows.length} arrows each`);
	}

	await writeFile(join(out, 'labels.json'), JSON.stringify(labels, null, 1));
	console.log(`\n${labels.length} labelled frames into ${out}`);
}

/** A rectified square of the face, the space the model works in, written as a jpeg through ffmpeg. */
async function writeCrop(frame, face, into, size = 128, span = 1.2) {
	const data = Buffer.alloc(size * size * 3);
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);

	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			const fx = ((i + 0.5) / size) * 2 * span - span;
			const fy = ((j + 0.5) / size) * 2 * span - span;
			const px = fx * face.semiMajor;
			const py = fy * face.semiMinor;
			const x = Math.round(face.cx + px * cos - py * sin);
			const y = Math.round(face.cy + px * sin + py * cos);
			const at = (j * size + i) * 3;
			if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
			const p = (y * frame.width + x) * 4;
			data[at] = frame.data[p];
			data[at + 1] = frame.data[p + 1];
			data[at + 2] = frame.data[p + 2];
		}
	}

	await pipeTo('ffmpeg', [
		'-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
		'-s', `${size}x${size}`, '-i', '-', '-q:v', '2', into
	], data);
}

async function load() {
	const directory = await mkdtemp(join(tmpdir(), 'appchery-vision-'));
	const outfile = join(directory, 'vision.mjs');
	await build({
		entryPoints: [join(ROOT, 'src/lib/vision/video-entry.ts')],
		bundle: true,
		format: 'esm',
		platform: 'node',
		outfile
	});
	const module = await import(outfile);
	setTimeout(() => rm(directory, { recursive: true, force: true }), 0).unref?.();
	return module;
}

async function* decode(file, width, height) {
	const child = spawn('ffmpeg', [
		'-v', 'error', '-i', resolve(file),
		'-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
	], { stdio: ['ignore', 'pipe', 'inherit'] });

	const size = width * height * 4;
	let held = Buffer.alloc(0);
	try {
		for await (const chunk of child.stdout) {
			held = held.length === 0 ? chunk : Buffer.concat([held, chunk]);
			while (held.length >= size) {
				yield held.subarray(0, size);
				held = held.subarray(size);
			}
		}
	} finally {
		child.kill('SIGKILL');
	}
}

function reduce(frame, factor) {
	const width = Math.floor(frame.width / factor);
	const height = Math.floor(frame.height / factor);
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (let j = 0; j < factor; j++) {
				for (let i = 0; i < factor; i++) {
					const p = ((y * factor + j) * frame.width + (x * factor + i)) * 4;
					r += frame.data[p];
					g += frame.data[p + 1];
					b += frame.data[p + 2];
				}
			}
			const count = factor * factor;
			const at = (y * width + x) * 4;
			data[at] = r / count;
			data[at + 1] = g / count;
			data[at + 2] = b / count;
			data[at + 3] = 255;
		}
	}
	return { width, height, data };
}

async function probe(file) {
	const out = await capture('ffprobe', [
		'-v', 'error', '-select_streams', 'v:0',
		'-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'csv=p=0', resolve(file)
	]);
	const [width, height, rate] = out.trim().split(',');
	const [num, den] = String(rate).split('/').map(Number);
	const fps = den ? num / den : num;
	return {
		width: Number(width),
		height: Number(height),
		fps: Number.isFinite(fps) && fps > 1 && fps < 240 ? Math.round(fps) : 30
	};
}

function run(command, args) {
	return new Promise((good, bad) => {
		const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
		child.on('error', bad);
		child.on('close', (code) => (code === 0 ? good() : bad(new Error(`${command} exited ${code}`))));
	});
}

function pipeTo(command, args, data) {
	return new Promise((good, bad) => {
		const child = spawn(command, args, { stdio: ['pipe', 'inherit', 'inherit'] });
		child.on('error', bad);
		child.on('close', (code) => (code === 0 ? good() : bad(new Error(`${command} exited ${code}`))));
		child.stdin.end(data);
	});
}

function capture(command, args) {
	return new Promise((good, bad) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
		let out = '';
		child.stdout.on('data', (chunk) => (out += chunk));
		child.on('error', bad);
		child.on('close', () => good(out));
	});
}
