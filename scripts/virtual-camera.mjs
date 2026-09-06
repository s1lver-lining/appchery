#!/usr/bin/env node
/**
 * Plays a recorded session into the app's own live scoring path, in a real browser.
 *
 *   node scripts/virtual-camera.mjs <recording>            # per frame numbers
 *   node scripts/virtual-camera.mjs <recording> -o out.mp4 # and the overlay burnt in
 *   node scripts/virtual-camera.mjs --all --summary        # every recording
 *   node scripts/virtual-camera.mjs <recording> --headed   # watch it happen
 *
 * Why this exists beside arrow_detector.sh: doc/live-scoring-split.md.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { listRecordings, motionPath } from './lib/recordings.mjs';
import { cameraBundle, workerBundle, replayBundle } from './lib/bundles.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
	// Both spellings, because the overlay is asked for as `-o out.mp4` the way every other tool takes it.
	const i = Math.max(args.indexOf(`--${name}`), args.indexOf(`-${name}`));
	return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

// A server rather than a file: a module worker and a seekable video both need an origin.
export async function serve(port = 0) {
	const recordings = await listRecordings(VIDEOS);
	const server = createServer(async (request, response) => {
		const url = new URL(request.url, 'http://localhost');
		const send = (status, type, body) => {
			response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
			response.end(body);
		};
		try {
			if (url.pathname === '/') {
				return send(200, 'text/html', await readFile(join(ROOT, 'scripts/lib/camera.html')));
			}
			if (url.pathname === '/camera.js') return send(200, 'text/javascript', await cameraBundle());
			if (url.pathname === '/detector.worker.js') {
				return send(200, 'text/javascript', await workerBundle());
			}
			// The single scanner, so one harness can watch both scorers over one set of labels.
			if (url.pathname === '/replay.js') return send(200, 'text/javascript', await replayBundle());
			if (url.pathname.startsWith('/video/')) {
				const name = decodeURIComponent(url.pathname.slice('/video/'.length));
				const found = recordings.find((r) => r.name === name);
				if (!found) return send(404, 'text/plain', 'not found');
				return await sendVideo(request, response, found.path);
			}
			if (url.pathname.startsWith('/motion/')) {
				const name = decodeURIComponent(url.pathname.slice('/motion/'.length));
				const found = recordings.find((r) => r.name === name);
				const motion = found ? motionPath(found.path) : null;
				// Absent for every session recorded before the phone's sensors were kept, which is an
				// answer rather than a failure: the app runs without them on a device that has none.
				if (!motion || !existsSync(motion)) return send(200, 'application/json', '{}');
				return send(200, 'application/json', await readFile(motion));
			}
			send(404, 'text/plain', 'not found');
		} catch (error) {
			send(500, 'text/plain', String(error));
		}
	});
	await new Promise((done) => server.listen(port, done));
	return { server, port: server.address().port, recordings };
}

/** Streams a recording, in pieces when the video element asks for them. */
async function sendVideo(request, response, file) {
	const size = (await stat(file)).size;
	const type = extname(file).toLowerCase() === '.webm' ? 'video/webm' : 'video/mp4';
	const range = request.headers.range;
	const body = await readFile(file);
	if (!range) {
		response.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
		return response.end(body);
	}
	const [from, to] = range.replace('bytes=', '').split('-');
	const start = Number(from);
	const end = to ? Number(to) : size - 1;
	response.writeHead(206, {
		'content-type': type,
		'content-range': `bytes ${start}-${end}/${size}`,
		'accept-ranges': 'bytes',
		'content-length': end - start + 1
	});
	response.end(body.subarray(start, end + 1));
}

// The page is reused across recordings: the page's own script makes every counter afresh on each load.
export async function play(page, port, name, { smooth = false, arrows = null, frames = true, capture = false, replay = false } = {}) {
	const query = new URLSearchParams({
		video: name,
		smooth: smooth ? '1' : '0',
		frames: frames ? '1' : '0',
		capture: capture ? '1' : '0',
		replay: replay ? '1' : '0'
	});
	if (arrows) query.set('arrows', String(arrows));
	await page.goto(`http://localhost:${port}/?${query}`);
	await page.waitForFunction(() => window.virtualCamera?.done, null, { timeout: 180000 });
	return page.evaluate(() => window.virtualCamera);
}

/** A recording's replay as a few numbers. `rebase` is the one this harness exists for. */
export function summarise(report) {
	const frames = report.frames ?? [];
	const seen = frames.filter((f) => f.faces > 0);
	const rebases = frames.flatMap((f) => f.rebase ?? []);
	return {
		video: report.video,
		frames: frames.length,
		withFace: seen.length,
		passes: frames.at(-1)?.passes ?? 0,
		arrows: frames.at(-1)?.arrows?.length ?? 0,
		costMedian: median(frames.map((f) => f.cost).filter((c) => c > 0)),
		rebaseMedian: median(rebases),
		rebaseP90: quantile(rebases, 0.9),
		rebaseWorst: Math.max(0, ...rebases),
		// A fifth of a radius is past any honest disagreement between two fits and short of a quarter turn.
		badFrames: frames.filter((f) => (f.rebaseWorst ?? 0) > 0.2).length,
		error: report.error
	};
}

const median = (list) => quantile(list, 0.5);
function quantile(list, q) {
	if (list.length === 0) return null;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/** Writes the overlay the page drew as a video, by asking the page for the frames it composited. */
async function writeOverlay(page, output, width, height, fps) {
	const png = await page.evaluate(() => window.virtualCamera.captured ?? null);
	if (!png) throw new Error('the page kept no frames to write');
	const encoder = spawn('ffmpeg', [
		'-v', 'error', '-y',
		'-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
		'-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
		output
	]);
	for (const frame of png) encoder.stdin.write(Buffer.from(frame, 'base64'));
	encoder.stdin.end();
	await new Promise((done) => encoder.on('close', done));
}

async function main() {
	const only = args.filter(
		(a, i) => !a.startsWith('-') && !(args[i - 1] ?? '').startsWith('-')
	);
	const { server, port, recordings } = await serve();
	const wanted = flag('all')
		? recordings.map((r) => r.name)
		: recordings.filter((r) => only.some((o) => r.name.includes(o))).map((r) => r.name);

	if (wanted.length === 0) {
		console.error('No recording matched. Give part of a name, or --all.');
		server.close();
		process.exit(2);
	}

	const browser = await chromium.launch({ headless: !flag('headed') });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.on('console', (message) => {
		if (message.type() === 'error') console.error(`  page: ${message.text()}`);
	});

	const rows = [];
	for (const name of wanted) {
		const wantVideo = Boolean(option('o') ?? (flag('overlay') ? true : null));
		const report = await play(page, port, name, {
			smooth: flag('smooth'),
			arrows: option('arrows'),
			frames: true,
			capture: wantVideo
		});
		if (report.error) console.error(`  ${name}: ${report.error}`);
		const row = summarise(report);
		rows.push(row);
		if (!flag('summary')) {
			console.log(
				`${name.slice(-24)}  ${row.withFace}/${row.frames} frames with a face, ` +
					`${row.passes} passes, ${row.arrows} arrows, ` +
					`rebase ${pct(row.rebaseMedian)} median ${pct(row.rebaseP90)} p90 ${pct(row.rebaseWorst)} worst, ` +
					`${row.badFrames} frames past a fifth of a radius`
			);
		}
		const out = option('o') ?? (flag('overlay') ? defaultOutput(name) : null);
		if (out) {
			await writeOverlay(page, resolve(out), report.width, report.height, 30);
			console.log(`  overlay written to ${out}`);
		}
	}

	await browser.close();
	server.close();

	const all = rows.flatMap((r) => (r.rebaseMedian === null ? [] : [r]));
	console.log('');
	console.log(`recordings         ${rows.length}`);
	console.log(`frames with a face ${sum(rows.map((r) => r.withFace))}/${sum(rows.map((r) => r.frames))}`);
	console.log(`rebase             ${pct(median(all.map((r) => r.rebaseMedian)))} median of medians`);
	console.log(`  at p90           ${pct(median(all.map((r) => r.rebaseP90)))}`);
	console.log(`  worst seen       ${pct(Math.max(0, ...rows.map((r) => r.rebaseWorst)))}`);
	console.log(`frames past 20%    ${sum(rows.map((r) => r.badFrames))}`);
	console.log(`a pass costs       ${median(rows.map((r) => r.costMedian).filter(Boolean))?.toFixed(1)}ms median`);
}

const sum = (list) => list.reduce((a, b) => a + b, 0);
const pct = (v) => (v === null || v === undefined ? '--' : `${(v * 100).toFixed(1)}%`);
const defaultOutput = (name) => join(ROOT, basename(name).replace(/\.[^.]+$/, '') + '-live.mp4');

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
