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
 *   node scripts/label-arrows.mjs todo        # what is labelled so far and what is missing
 *
 * Three kinds of label, and they are not alike.
 *
 * **Arrows** are where a shaft enters the paper. One click labels the whole recording, because the
 * point does not move: it is on the paper, and the face fit gives a frame in which the camera walking
 * around changes nothing.
 *
 * **Nocks** are the far end of the shaft, and they have to be clicked again on every frame they are
 * wanted on, because the whole point of them is that they *do* move. A shaft stands out of the paper,
 * so where its nock appears depends on where the camera is standing, and that is the one thing about
 * an arrow that nothing lying flat on the paper can imitate. Five or six frames a recording, taken
 * from as far apart as the sweep goes, is what makes that measurable.
 *
 * **Not-arrows** are the creases, folds, printed lines and rim shadows that the detector keeps taking
 * for shafts. Flat on the paper, so like the arrows one click does the whole recording. A handful in
 * total is enough to test a rule against, which is not something aggregate scores can do.
 *
 * The workspace is kept outside the repository: it holds decoded frames and is large.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, appendFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');
const WORK = join(ROOT, 'test/datasets/labelling');
const SCALE = 4;

/** How much the frame the crops are cut from is reduced first. */
const CROP_SOURCE = 2;

/** The crop the model works in: gold centred, radius normalised, a little past the face edge. */
const CROP_SIZE = 128;
const CROP_SPAN = 1.2;

/** The four anchors the archer dragged, as a projection. Mirrors the labelling page exactly. */
const ANCHOR = 0.8;
const ANCHORS = [
	[ANCHOR, 0],
	[0, ANCHOR],
	[-ANCHOR, 0],
	[0, -ANCHOR]
];

/** Frames labelled per recording, spread evenly so each is a genuinely different viewpoint. */
const SAMPLES = 15;

/**
 * Frames looked at when choosing those. Labelling needs two dozen good frames, not every frame, and
 * fitting the face is the slow part: at one in eight this is a few seconds a recording rather than a
 * few minutes. Every frame does get fitted eventually, but in `export`, which nobody waits for.
 */
const STRIDE = 8;

/**
 * How often the face is followed while looking for the frames to label.
 *
 * Not about picking frames but about keeping one orientation across the recording: the fit is turned
 * back onto the previous one each time, which only works over a small turn. Every fourth frame is an
 * eighth of a second of camera movement, well inside what that can bridge.
 */
const GAUGE_STRIDE = 4;

const command = process.argv[2] ?? 'prepare';
const only = argument('--video');

if (command === 'prepare') await prepare();
else if (command === 'serve') await serve();
else if (command === 'export') await exportSet();
else if (command === 'todo') await todo();
else {
	console.error('usage: label-arrows.mjs [prepare|serve|export|todo] [--video <name>]');
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
		let held = null;
		for await (const frame of decode(file, small.width, small.height, small)) {
			/**
			 * The tracker is fed along the way, not only at the frames being kept.
			 *
			 * It holds one idea of which way round the face is by turning each fit back onto the last one,
			 * and it can only do that over a small turn — which is all a frame or two of a carried camera
			 * amounts to, and nothing like the two seconds between the frames worth labelling. Fed only
			 * those, it lost the thread every few frames and the seeds came back turned a quarter or a half
			 * from each other. In the tool that looks like the arrows rotating about the gold and swapping
			 * numbers, which is exactly what it looked like.
			 */
			if (at % GAUGE_STRIDE === 0 || wanted.has(at)) {
				held = track.push({
					width: small.width,
					height: small.height,
					data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
				});
			}
			if (wanted.has(at)) seeds.push(held ? scaleUp(held, width, height) : null);
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
		/**
		 * The four points themselves, which is what the tool actually wants.
		 *
		 * The rest of this describes the fit as a centre, two axes, an angle and a lean, and rebuilding
		 * handles from those was throwing away the very thing the fit is good at. A face seen from off to
		 * one side is a projection, with eight numbers in it; squeezed back through seven summary ones the
		 * far side of the boss comes back the same size as the near side, and the handles land a ring or
		 * two out on exactly the frames where the archer most wants them right.
		 */
		handles: face.anchors?.map(([x, y]) => [x * SCALE, y * SCALE]) ?? null,
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
	const { FaceTrack, toFace } = await load();
	const out = join(ROOT, 'test/datasets/prepared-videos');
	await mkdir(out, { recursive: true });
	/**
	 * One flat file of raw crops rather than thousands of jpegs. Encoding each through its own process
	 * cost more than everything else here put together, and a block of bytes is easier for the training
	 * script to read than a directory is.
	 */
	const blob = join(out, 'crops.raw');
	await writeFile(blob, Buffer.alloc(0));
	const every = Number(argument('--every')) || 4;
	const labels = [];

	for (const name of await recordings()) {
		const folder = join(WORK, name);
		if (!existsSync(join(folder, 'labels.json'))) continue;
		const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
		const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
		const { width, height } = meta;
		const small = { width: Math.floor(width / SCALE), height: Math.floor(height / SCALE) };
		const at = meta.chosen[label.arrowFrame ?? 0];

		/**
		 * The impacts start in the frame the archer drew them in and have to reach the one the detector
		 * works in, which is a different frame for the same face: a target is rotationally symmetric, so
		 * nothing forces the two to agree about which way round it sits. Going through the picture on the
		 * one frame that has both is what ties them together.
		 */
		const truth = label.empty ? null : homographyOf(label.frames[String(label.arrowFrame)].handles);
		if (!label.empty && !truth) {
			console.log(`  ${name.slice(-24)}: no hand fit to anchor the arrows to, skipped`);
			continue;
		}

		const track = new FaceTrack();
		let canonical = null;
		let index = 0;
		let written = 0;
		const frames = [];

		for await (const frame of decode(join(VIDEOS, name), small.width, small.height, small)) {
			const face = track.push({
				width: small.width,
				height: small.height,
				data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length)
			});
			const placed = face ? scaleUp(face, width, height) : null;
			if (placed && index === at && truth) {
				canonical = label.arrows.map((arrow) => {
					const point = project(truth, arrow.x, arrow.y);
					return toFace(placed, point.x, point.y);
				});
			}
			// Only well fitted frames, and only every few: neighbours are the same picture twice.
			if (placed && index % every === 0 && quality(placed) >= 0.7) frames.push({ index, face: placed });
			index += 1;
		}

		if (!label.empty && !canonical) {
			console.log(`  ${name.slice(-24)}: the labelled frame was not fitted, skipped`);
			continue;
		}

		const wanted = new Map(frames.map((f) => [f.index, f.face]));
		let atFrame = 0;
		for await (const frame of decode(join(VIDEOS, name), width, height)) {
			const face = wanted.get(atFrame);
			const here = atFrame;
			atFrame += 1;
			if (!face) continue;
			await appendFile(
				blob,
				cropBytes(
					{ width, height, data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length) },
					face
				)
			);
			labels.push({ video: name, frame: here, impacts: canonical ?? [] });
			written += 1;
		}
		console.log(`  ${name.slice(-24)}: ${written} crops, ${(canonical ?? []).length} arrows each`);
	}

	await writeFile(
		join(out, 'labels.json'),
		JSON.stringify({ size: CROP_SIZE, span: CROP_SPAN, examples: labels }, null, 1)
	);
	console.log(`\n${labels.length} crops into ${out}`);
}

function homographyOf(points) {
	if (!points) return null;
	const rows = [];
	for (let i = 0; i < 4; i++) {
		const [u, v] = ANCHORS[i];
		const [x, y] = points[i];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}
	const h = solveEight(rows);
	return h && [
		[h[0], h[1], h[2]],
		[h[3], h[4], h[5]],
		[h[6], h[7], 1]
	];
}

function solveEight(rows) {
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

/**
 * A rectified square of the face as raw bytes. Nearest neighbour, because that is how the training
 * crops have always been sampled and the model must be shown the picture it learnt on.
 */
function cropBytes(frame, face, size = CROP_SIZE, span = CROP_SPAN) {
	const data = Buffer.alloc(size * size * 3);
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);

	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			const fx = ((i + 0.5) / size) * 2 * span - span;
			const fy = ((j + 0.5) / size) * 2 * span - span;
			const px = fx * face.semiMajor;
			const py = fy * face.semiMinor;
			const depth = 1 + (face.perspectiveX ?? 0) * fx + (face.perspectiveY ?? 0) * fy;
			const k = Math.abs(depth) < 1e-6 ? 1 : 1 / depth;
			const x = Math.round(face.cx + (px * cos - py * sin) * k);
			const y = Math.round(face.cy + (px * sin + py * cos) * k);
			const at = (j * size + i) * 3;
			if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
			const p = (y * frame.width + x) * 4;
			data[at] = frame.data[p];
			data[at + 1] = frame.data[p + 1];
			data[at + 2] = frame.data[p + 2];
		}
	}

	return data;
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

	/**
	 * Its complaints are held rather than passed on, because most of them are ours.
	 *
	 * Every caller here stops reading as soon as it has the frames it asked for, which leaves ffmpeg
	 * writing into a pipe nobody is holding: it says the connection was reset, several times, in red.
	 * That is the expected end of a deliberate early stop and not a fault, but printed among real output
	 * it reads as one. So it is kept and only shown when the decoder failed on its own account.
	 */
	const child = spawn('ffmpeg', [
		'-v', 'error', '-i', resolve(file),
		...(filters.length ? ['-vf', filters.join(',')] : []),
		'-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
	], { stdio: ['ignore', 'pipe', 'pipe'] });

	let complaint = '';
	child.stderr.on('data', (chunk) => (complaint += chunk));

	const size = width * height * 4;
	let held = Buffer.alloc(0);
	let stopped = false;
	try {
		for await (const chunk of child.stdout) {
			held = held.length === 0 ? chunk : Buffer.concat([held, chunk]);
			while (held.length >= size) {
				yield held.subarray(0, size);
				held = held.subarray(size);
			}
		}
	} finally {
		stopped = true;
		child.kill('SIGKILL');
	}

	if (!stopped && complaint) process.stderr.write(complaint);
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

/**
 * Says what is labelled and what is not, per recording.
 *
 * Worth having because the three kinds of label are wanted in very different amounts — one arrow set
 * per recording, nocks on a handful of frames, a few not-arrows in total — and there is no way to see
 * that from the tool itself without opening every video in turn.
 */
async function todo() {
	const rows = [];
	let nockFrames = 0;
	let nocks = 0;
	let marks = 0;

	for (const name of (await readdir(WORK)).sort()) {
		if (only && !name.includes(only)) continue;
		const file = join(WORK, name, 'labels.json');
		if (!existsSync(file)) continue;
		const label = JSON.parse(await readFile(file, 'utf8'));
		const frames = Object.entries(label.nocks ?? {}).filter(([, list]) => list.length > 0);
		const here = frames.reduce((total, [, list]) => total + list.length, 0);
		nockFrames += frames.length;
		nocks += here;
		marks += (label.marks ?? []).length;
		/**
		 * Whether the frame the arrows were read through was ever fitted by hand.
		 *
		 * The arrows are one set of coordinates read through one frame's fit, so that fit decides where
		 * every one of them lands. Anchored to a frame nobody checked, all six can be out together while
		 * each looks perfectly placed on the frame it was clicked on.
		 */
		const anchor = label.arrowFrame;
		const anchorFit = anchor === null || anchor === undefined ? null : label.frames?.[anchor];
		const shaky = (label.arrows?.length ?? 0) > 0 && !anchorFit?.touched;

		rows.push(
			`${name.slice(-24)}  ${String(label.arrows?.length ?? 0).padStart(2)} arrows` +
				` on frame ${String((anchor ?? 0) + 1).padStart(2)}  ` +
				`${String(frames.length).padStart(2)} frames nocked (${here} nocks)  ` +
				`${String((label.marks ?? []).length).padStart(2)} not-arrows` +
				(shaky ? '   <- arrows read through a fit nobody checked' : '') +
				(frames.length === 0 ? '   <- no nocks yet' : '')
		);
	}

	console.log(rows.join('\n'));
	console.log(`\n${nockFrames} frames carry nocks, ${nocks} nocks in all, ${marks} not-arrows.`);
	console.log('Wanted: five or six nocked frames a recording, taken from as far apart as the sweep goes.');
}
