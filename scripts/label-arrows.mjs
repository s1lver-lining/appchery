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

/** Frames labelled per recording, spread evenly so each is a genuinely different viewpoint. */
const SAMPLES = 15;

/**
 * Frames looked at when choosing those. Labelling needs two dozen good frames, not every frame, and
 * fitting the face is the slow part: at one in eight this is a few seconds a recording rather than a
 * few minutes. Every frame does get fitted eventually, but in `export`, which nobody waits for.
 */
const STRIDE = 8;

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
		const { width, height } = await probe(file);
		const total = await countFrames(file);
		const step = Math.max(1, Math.floor(total / SAMPLES));
		const chosen = [];
		for (let i = 0; i < SAMPLES && i * step < total; i++) chosen.push(i * step);

		await mkdir(join(WORK, name), { recursive: true });
		await extract(file, chosen, join(WORK, name));

		/**
		 * The automatic fit, kept only as somewhere for the handles to start. It is often wrong, which
		 * is the whole reason this tool exists, but it is nearly always closer than a default circle and
		 * that is several seconds of dragging saved on every frame.
		 */
		const seeds = [];
		const small = { width: Math.floor(width / SCALE), height: Math.floor(height / SCALE) };
		let at = 0;
		const wanted = new Set(chosen);
		const track = new FaceTrack();
		for await (const frame of decode(file, small.width, small.height, small)) {
			if (wanted.has(at)) {
				const face = track.push({
					width: small.width,
					height: small.height,
					data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
				});
				seeds.push(face ? scaleUp(face, width, height) : null);
			}
			at += 1;
			if (seeds.length === chosen.length) break;
		}

		await writeFile(
			join(WORK, name, 'frames.json'),
			JSON.stringify({ video: name, width, height, frames: total, chosen, seeds }, null, 1)
		);
		console.log(`  ${name.slice(-24)}: ${chosen.length} frames of ${total}`);
	}

	console.log(`\nPrepared into ${WORK}`);
	console.log('Now run: node scripts/label-arrows.mjs serve');
}

async function countFrames(file) {
	const out = await capture('ffprobe', [
		'-v', 'error', '-select_streams', 'v:0', '-count_frames',
		'-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', resolve(file)
	]);
	return Number(out.trim()) || 0;
}

/** Share of the face that is actually in the picture, since a fit on a sliver tells you nothing. */
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

/** How good a frame is: fitted well, and with the face actually in the picture. */
function quality(face) {
	return face ? face.support * (face.visible ?? 1) : 0;
}

/** The fit measured on the reduced frame, put back into the video's own pixels. */
function scaleUp(face, width, height) {
	const placed = {
		cx: face.cx * SCALE,
		cy: face.cy * SCALE,
		semiMajor: face.semiMajor * SCALE,
		semiMinor: face.semiMinor * SCALE,
		rotation: face.rotation,
		support: face.support,
		perspectiveX: face.perspectiveX ?? 0,
		perspectiveY: face.perspectiveY ?? 0
	};
	placed.visible = visibility(placed, width, height);
	return placed;
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
				for (const name of (await readdir(WORK)).sort()) {
					const meta = join(WORK, name, 'frames.json');
					if (!existsSync(meta)) continue;
					const data = JSON.parse(await readFile(meta, 'utf8'));
					const labels = join(WORK, name, 'labels.json');
					videos.push({
						...data,
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
	const { FaceTrack } = await load();
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
		const { width, height } = meta;

		/**
		 * Every frame is fitted here rather than in `prepare`, which only ever needed enough frames to
		 * choose two dozen good ones. Nobody waits on this: it runs once, after the clicking is done.
		 */
		const track = new FaceTrack();
		const small = { width: Math.floor(width / SCALE), height: Math.floor(height / SCALE) };
		const kept = [];
		let index = 0;
		for await (const frame of decode(join(VIDEOS, name), small.width, small.height, small)) {
			const face = track.push({
				width: small.width,
				height: small.height,
				data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
			});
			// A label propagated through a poor fit is a wrong label, so those frames are left out.
			const placed = face ? scaleUp(face, width, height) : null;
			const near = nearestRejection(rejected, index, meta.stride ?? 1);
			if (placed && !near && quality(placed) >= (label.minQuality ?? 0.7)) kept.push({ index, face: placed });
			index += 1;
		}

		// A second pass at full resolution, because the crops the model trains on come from that.
		const wanted = new Map(kept.map((k) => [k.index, k.face]));
		let at = 0;
		let written = 0;
		for await (const frame of decode(join(VIDEOS, name), width, height)) {
			const face = wanted.get(at);
			const here = at;
			at += 1;
			if (!face) continue;
			const file = `${name.replace(/\.[^.]+$/, '')}-${String(here).padStart(6, '0')}.jpg`;
			await writeCrop(
				{ width, height, data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length) },
				face,
				join(out, 'images', file)
			);
			labels.push({ image: file, video: name, frame: here, impacts: label.arrows });
			written += 1;
		}
		console.log(`  ${name}: ${written} frames, ${label.arrows.length} arrows each`);
	}

	await writeFile(join(out, 'labels.json'), JSON.stringify(labels, null, 1));
	console.log(`\n${labels.length} labelled frames into ${out}`);
}

/** A rejected sample stands for the stretch of frames around it, since that is what it was chosen from. */
function nearestRejection(rejected, index, stride) {
	for (const frame of rejected) {
		if (Math.abs(frame - index) <= stride) return true;
	}
	return false;
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

async function* decode(file, width, height, scaleTo = null, stride = 1) {
	const filters = [];
	if (stride > 1) filters.push(`select='not(mod(n\\,${stride}))'`);
	if (scaleTo) filters.push(`scale=${scaleTo.width}:${scaleTo.height}:flags=area`);

	const child = spawn('ffmpeg', [
		'-v', 'error', '-i', resolve(file),
		...(filters.length ? ['-vf', filters.join(',')] : []),
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
