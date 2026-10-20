// @ts-nocheck: a node script, reached by the type check only through vite.config.ts.
// The corpus the /label page reads and writes, under `vite dev` only. See doc/labelling.md.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, rename, stat, writeFile, copyFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { listRecordings, motionPath } from './recordings.mjs';
import { readLabels } from './labels.mjs';
import { LABELS_FILE } from '../../src/lib/labelling/format.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');
const WORK = join(ROOT, 'test/datasets/labelling');
const BASE = '/__label/';

const readOnly = process.env.LABEL_READONLY === '1';

// Oldest first, by the moment in the name: the session uuid in front of it shuffles an afternoon.
const SHOT_AT = /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/;

/** Only names this server listed itself, so a path cannot be asked for sideways. */
async function prepared() {
	const names = [];
	for (const name of await readdir(WORK)) {
		if (existsSync(join(WORK, name, 'frames.json'))) names.push(name);
	}
	return names.sort((a, b) => (a.match(SHOT_AT)?.[1] ?? a).localeCompare(b.match(SHOT_AT)?.[1] ?? b));
}

async function entry(name) {
	const folder = join(WORK, name);
	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const samples = (await readdir(folder)).filter((f) => f.startsWith('sample-')).sort();
	return { ...meta, video: name, shotAt: name.match(SHOT_AT)?.[1] ?? null, samples, labels: readLabels(folder) };
}

async function manifest() {
	const out = [];
	for (const name of await prepared()) out.push(await entry(name));
	return out;
}

/** Recordings in the corpus whose frames have not been chosen and fitted yet. */
async function unprepared() {
	const done = new Set(await prepared());
	return (await listRecordings(VIDEOS)).map((r) => r.name).filter((name) => !done.has(name));
}

/** `label-arrows.mjs prepare` on one recording, which leaves every other recording's frames alone. */
function prepare(name) {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [join(ROOT, 'scripts/label-arrows.mjs'), 'prepare', '--video', name], {
			stdio: ['ignore', 'ignore', 'pipe']
		});
		let said = '';
		child.stderr.on('data', (chunk) => (said += chunk));
		child.on('close', (code) => (code === 0 ? done() : fail(new Error(said.slice(-2000)))));
	});
}

function send(response, status, type, body) {
	response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
	response.end(body);
}

function body(request) {
	return new Promise((done, fail) => {
		let text = '';
		request.on('data', (chunk) => (text += chunk));
		request.on('end', () => done(text));
		request.on('error', fail);
	});
}

/** In pieces when asked for them, or the timeline cannot be dragged. */
async function sendVideo(request, response, file) {
	const size = (await stat(file)).size;
	const type = extname(file).toLowerCase() === '.webm' ? 'video/webm' : 'video/mp4';
	const range = request.headers.range;
	if (!range) {
		response.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
		return createReadStream(file).pipe(response);
	}
	const [, from, to] = /bytes=(\d*)-(\d*)/.exec(range) ?? [];
	const start = from ? Number(from) : 0;
	const end = to ? Math.min(Number(to), size - 1) : size - 1;
	if (start >= size || start > end) {
		response.writeHead(416, { 'content-range': `bytes */${size}` });
		return response.end();
	}
	response.writeHead(206, {
		'content-type': type,
		'content-range': `bytes ${start}-${end}/${size}`,
		'accept-ranges': 'bytes',
		'content-length': end - start + 1
	});
	return createReadStream(file, { start, end }).pipe(response);
}

/** The measuring harness on one recording, so the page's scorecard is the overnight reports' number. */
function score(name) {
	return new Promise((done, fail) => {
		const child = spawn(
			process.execPath,
			[join(ROOT, 'scripts/eval-arrows-video.mjs'), '--video', name, '--jobs', '1', '--slower', '0', '--emit'],
			{ stdio: ['ignore', 'pipe', 'pipe'] }
		);
		let text = '';
		let said = '';
		child.stdout.on('data', (chunk) => (text += chunk));
		child.stderr.on('data', (chunk) => (said += chunk));
		child.on('close', (code) => {
			if (code !== 0) return fail(new Error(said.slice(-2000)));
			try {
				const tallies = JSON.parse(text);
				done(tallies.recs?.find((r) => r.name === name) ?? null);
			} catch (error) {
				fail(error);
			}
		});
	});
}

async function handle(request, response) {
	const url = new URL(request.url, 'http://localhost');
	const [what, rawName, file] = url.pathname.slice(BASE.length).split('/');
	const name = rawName ? decodeURIComponent(rawName) : null;
	if (what === 'prepare' && request.method === 'POST') {
		if (readOnly) return send(response, 423, 'application/json', '{"readOnly":true}');
		if (!name || !(await unprepared()).includes(name)) return send(response, 404, 'text/plain', 'not a recording waiting to be prepared');
		await prepare(name);
		return send(response, 200, 'application/json', JSON.stringify(await entry(name)));
	}

	const names = name ? await prepared() : [];
	if (name && !names.includes(name)) return send(response, 404, 'text/plain', 'no such recording');

	if (what === 'manifest') return send(response, 200, 'application/json',JSON.stringify({ readOnly, recordings: await manifest(), unprepared: await unprepared() }));

	if (what === 'image' && file && /^sample-\d+\.jpg$/.test(file)) {
		return send(response, 200, 'image/jpeg', await readFile(join(WORK, name, file)));
	}

	if (what === 'video' || what === 'motion') {
		const found = (await listRecordings(VIDEOS)).find((r) => r.name === name);
		if (!found) return send(response, 404, 'text/plain', 'recording not in the corpus');
		if (what === 'video') return sendVideo(request, response, found.path);
		const motion = motionPath(found.path);
		// Most sessions predate the phone keeping its sensors, so that is an answer, not a failure.
		return send(response, 200, 'application/json', existsSync(motion) ? await readFile(motion) : '{}');
	}

	if (what === 'labels' && request.method === 'POST') {
		if (readOnly) return send(response, 423, 'application/json', '{"readOnly":true}');
		const text = await body(request);
		const parsed = JSON.parse(text);
		if (parsed?.version !== 2) return send(response, 400, 'text/plain', 'not version 2 labels');
		const target = join(WORK, name, LABELS_FILE);
		// The first write keeps what was there, and every write lands whole or not at all.
		if (existsSync(target) && !existsSync(`${target}.first`)) await copyFile(target, `${target}.first`);
		await writeFile(`${target}.tmp`, JSON.stringify(parsed));
		await rename(`${target}.tmp`, target);
		return send(response, 200, 'application/json', '{"saved":true}');
	}

	if (what === 'score' && request.method === 'POST') {
		return send(response, 200, 'application/json', JSON.stringify(await score(name)));
	}

	send(response, 404, 'text/plain', 'not found');
}

export function labellingServer() {
	return {
		name: 'appchery-labelling',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (!request.url?.startsWith(BASE)) return next();
				handle(request, response).catch((error) => send(response, 500, 'text/plain', String(error?.stack ?? error)));
			});
		}
	};
}
