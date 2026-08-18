#!/usr/bin/env node
/**
 * Replays a recorded scoring session through the live detector and writes the video back with the
 * overlay burnt in, exactly as the archer would have seen it through the phone.
 *
 * Driven by arrow_detector.sh, which picks this half when it is handed a video rather than a picture.
 *
 * A still is analysed on its own; a session is not. The background reference, the settle counter and
 * the tracker's evidence are all built up over time, so the frames are fed in order through one
 * scanner at the rate the app detects at. Feeding them independently would measure a different thing.
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** How often the app runs the full search. Anything else would measure a detector it does not ship. */
const DETECT_EVERY_MS = 300;

export async function replayVideo({ input, output, watch, model, json, limit, everyMs, arrows }) {
	const fps = await probeFps(input);
	const frames = await mkdtemp(join(tmpdir(), 'appchery-frames-'));
	const painted = await mkdtemp(join(tmpdir(), 'appchery-overlay-'));

	try {
		await run('ffmpeg', ['-v', 'error', '-i', resolve(input), '-q:v', '2', join(frames, '%06d.jpg')]);
		const names = (await readdir(frames)).filter((n) => n.endsWith('.jpg')).sort();
		if (names.length === 0) throw new Error('ffmpeg decoded no frames from that video');

		const bundled = await build({
			entryPoints: [join(ROOT, 'src/lib/vision/video-entry.ts')],
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
		await page.evaluate(setup, { model: model ?? null, detectEveryMs: everyMs || DETECT_EVERY_MS, limit: arrows });

		const states = [];
		const wanted = limit ? Math.min(limit, names.length) : names.length;

		for (let i = 0; i < wanted; i++) {
			const data = await readFile(join(frames, names[i]));
			const state = await page.evaluate(step, {
				src: `data:image/jpeg;base64,${data.toString('base64')}`,
				nowMs: (i / fps) * 1000,
				want: !json
			});
			states.push(state.summary);
			if (state.png) await writeFile(join(painted, names[i]), Buffer.from(state.png.split(',')[1], 'base64'));
			if (!json && i % 50 === 0) process.stderr.write(`\r  frame ${i + 1}/${wanted}`);
		}
		if (!json) process.stderr.write(`\r  frame ${wanted}/${wanted}\n`);

		await browser.close();
		report(input, states, fps, Boolean(model), json);

		if (!json) {
			const target = resolve(output ?? defaultOutput(input));
			await run('ffmpeg', [
				'-v', 'error', '-y', '-framerate', String(fps),
				'-i', join(painted, '%06d.jpg'),
				'-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', target
			]);
			console.log(`\n  overlay written to ${target}`);
			if (watch) await play(target);
		}
	} finally {
		await rm(frames, { recursive: true, force: true });
		await rm(painted, { recursive: true, force: true });
	}
}

function defaultOutput(input) {
	return basename(input).replace(/\.[^.]+$/, '') + '-overlay.mp4';
}

/** Creates the replay in the page and keeps it there, so every frame meets the same scanner. */
function setup({ model, detectEveryMs, limit }) {
	const video = document.createElement('canvas');
	const work = document.createElement('canvas');
	const cropCanvas = document.createElement('canvas');
	window.VIDEO = video;
	window.WORK = work;

	/**
	 * The same rectified crop the app cuts for the learned detector, taken from the full resolution
	 * frame rather than the reduced one. A model shown a blurrier picture than it trained on has no
	 * way to know that is what happened.
	 */
	const crop = (face, size, span) => {
		cropCanvas.width = size;
		cropCanvas.height = size;
		const context = cropCanvas.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.imageSmoothingEnabled = false;
		const factor = window.REPLAY.scaleFactor;
		const stepSize = (2 * span) / size;
		context.save();
		context.translate(size / 2, size / 2);
		context.scale(1 / (face.semiMajor * factor * stepSize), 1 / (face.semiMinor * factor * stepSize));
		context.rotate(-face.rotation);
		context.translate(-face.cx * factor, -face.cy * factor);
		context.drawImage(video, 0, 0);
		context.restore();
		const pixels = context.getImageData(0, 0, size, size);
		return { width: size, height: size, data: pixels.data };
	};

	window.REPLAY = new VISION.Replay(detectEveryMs, model, model ? crop : null);
	if (limit) window.REPLAY.setLimit(limit);
}

/** Decodes one frame, feeds it to the replay and draws the overlay onto it. */
async function step({ src, nowMs, want }) {
	const image = new Image();
	image.src = src;
	await image.decode();

	const video = window.VIDEO;
	video.width = image.width;
	video.height = image.height;
	const full = video.getContext('2d', { willReadFrequently: true });
	full.drawImage(image, 0, 0);

	// Reduced by the canvas rather than by a loop over pixels, which is what the app does.
	const factor = window.REPLAY.scaleFactor;
	const work = window.WORK;
	work.width = Math.floor(image.width / factor);
	work.height = Math.floor(image.height / factor);
	const small = work.getContext('2d', { willReadFrequently: true });
	small.drawImage(video, 0, 0, work.width, work.height);
	const reduced = {
		width: work.width,
		height: work.height,
		data: small.getImageData(0, 0, work.width, work.height).data
	};

	const state = window.REPLAY.push(reduced, nowMs);
	const summary = {
		// Where the face landed, so the caller can measure how much the fit shakes between frames.
		cx: state.faces[0]?.cx ?? null,
		cy: state.faces[0]?.cy ?? null,
		radius: state.faces[0]?.semiMajor ?? null,
		faces: state.faces.length,
		steady: state.steady,
		settled: state.settled,
		detections: state.detections,
		arrows: state.arrows.length,
		pending: state.pending.length,
		cost: state.cost,
		detected: state.detected
	};
	if (!want) return { summary, png: null };

	const line = Math.max(2, image.width / 400);
	full.lineJoin = 'round';

	for (const face of state.faces) {
		for (const share of [0.2, 0.4, 0.6, 0.8, 1.0]) {
			full.beginPath();
			full.ellipse(face.cx, face.cy, face.semiMajor * share, face.semiMinor * share, face.rotation, 0, Math.PI * 2);
			full.lineWidth = share === 0.2 ? line * 1.5 : line;
			// Green once the face is trusted enough to take arrows from, magenta while it is not.
			full.strokeStyle = state.steady ? 'rgba(0,230,118,0.85)' : 'rgba(255,0,255,0.7)';
			full.stroke();
		}
	}

	full.font = `bold ${Math.round(image.width / 28)}px sans-serif`;
	full.textAlign = 'center';
	full.textBaseline = 'middle';

	// Faint, because a candidate that never becomes an arrow is the thing worth watching.
	for (const candidate of state.pending) {
		full.beginPath();
		full.arc(candidate.imageX, candidate.imageY, line * 3, 0, Math.PI * 2);
		full.strokeStyle = 'rgba(255,193,7,0.8)';
		full.lineWidth = line;
		full.stroke();
	}

	for (const arrow of state.arrows) {
		full.beginPath();
		full.arc(arrow.imageX, arrow.imageY, line * 4, 0, Math.PI * 2);
		full.strokeStyle = '#00e676';
		full.lineWidth = line * 1.5;
		full.stroke();
		const text = arrow.decimal === null ? arrow.label : arrow.decimal.toFixed(1);
		full.lineWidth = line * 2;
		full.strokeStyle = 'rgba(0,0,0,0.85)';
		full.strokeText(text, arrow.imageX, arrow.imageY - line * 9);
		full.fillStyle = '#ffffff';
		full.fillText(text, arrow.imageX, arrow.imageY - line * 9);
	}

	/**
	 * The state panel is the point of this tool. Zero arrows on a video tells you nothing on its own:
	 * what tells you something is whether the face was found, whether it ever held still long enough
	 * to be trusted, and whether anything was proposed at all.
	 */
	const pad = Math.round(image.width / 40);
	const size = Math.round(image.width / 36);
	full.font = `${size}px monospace`;
	full.textAlign = 'left';
	full.textBaseline = 'top';
	const lines = [
		`faces ${summary.faces}   settled ${summary.settled}   ${summary.steady ? 'STEADY' : 'not steady'}`,
		`proposals ${summary.detections}   pending ${summary.pending}   arrows ${summary.arrows}`,
		`detect ${summary.cost.toFixed(0)}ms${summary.detected ? '' : ' (tracking)'}`
	];
	full.fillStyle = 'rgba(0,0,0,0.55)';
	full.fillRect(0, 0, image.width, pad * 2 + size * 3.6);
	full.fillStyle = summary.steady ? '#00e676' : '#ffc107';
	lines.forEach((text, i) => full.fillText(text, pad, pad + i * size * 1.2));

	return { summary, png: video.toDataURL('image/jpeg', 0.9) };
}

function report(input, states, fps, learned, json) {
	const detections = states.filter((s) => s.detected);
	/**
	 * How far the fitted centre moves between consecutive frames, as a share of the face radius. This
	 * is the flicker the archer sees as the overlay jumping, and it is the only way to tell a fix from
	 * a change of mood about one.
	 */
	const jumps = [];
	const onDetect = [];
	const onTrack = [];
	for (let i = 1; i < states.length; i++) {
		const before = states[i - 1];
		const now = states[i];
		if (before.cx === null || now.cx === null || !now.radius) continue;
		const jump = Math.hypot(now.cx - before.cx, now.cy - before.cy) / now.radius;
		jumps.push(jump);
		(now.detected ? onDetect : onTrack).push(jump);
	}
	const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
	jumps.sort((a, b) => a - b);
	const at = (share) => (jumps.length ? jumps[Math.floor(jumps.length * share)] : 0);
	const cost = detections.map((s) => s.cost).sort((a, b) => a - b);
	const summary = {
		video: basename(input),
		detector: learned ? 'learned' : 'classical',
		frames: states.length,
		fps,
		framesWithFace: states.filter((s) => s.faces > 0).length,
		framesSteady: states.filter((s) => s.steady).length,
		detectionPasses: detections.length,
		proposals: detections.reduce((total, s) => total + s.detections, 0),
		arrowsConfirmed: Math.max(0, ...states.map((s) => s.arrows)),
		jitterMedian: Number((at(0.5) * 100).toFixed(2)),
		jitterP90: Number((at(0.9) * 100).toFixed(2)),
		jitterP99: Number((at(0.99) * 100).toFixed(2)),
		jitterOnDetect: Number((mean(onDetect) * 100).toFixed(2)),
		jitterOnTrack: Number((mean(onTrack) * 100).toFixed(2)),
		jitterFrozen: jumps.length ? Number(((jumps.filter((j) => j === 0).length / jumps.length) * 100).toFixed(1)) : 0,
		medianDetectMs: cost.length ? Number(cost[Math.floor(cost.length / 2)].toFixed(1)) : 0,
		worstDetectMs: cost.length ? Number(cost[cost.length - 1].toFixed(1)) : 0
	};

	if (json) {
		console.log(JSON.stringify(summary, null, 2));
		return;
	}

	const share = (n) => `${((n / states.length) * 100).toFixed(0)}%`;
	console.log(`${summary.video}  ${summary.frames} frames at ${fps}fps  [${summary.detector}]`);
	console.log(`  face found        ${summary.framesWithFace} frames (${share(summary.framesWithFace)})`);
	console.log(`  steady enough     ${summary.framesSteady} frames (${share(summary.framesSteady)})`);
	console.log(`  proposals         ${summary.proposals} over ${summary.detectionPasses} detection passes`);
	console.log(`  arrows confirmed  ${summary.arrowsConfirmed}`);
	console.log(`  fit jitter        ${summary.jitterMedian}% of radius median, ${summary.jitterP90}% at p90`);
	console.log(`  detection cost    ${summary.medianDetectMs}ms median, ${summary.worstDetectMs}ms worst`);

	// The two numbers that explain a session that found nothing, which the frame count alone cannot.
	if (summary.framesSteady === 0 && summary.framesWithFace > 0) {
		console.log('\n  The face was found but never held still long enough to be trusted, so no arrow was');
		console.log('  ever looked for. On a carried camera that is the expected outcome.');
	} else if (summary.proposals === 0 && summary.framesSteady > 0) {
		console.log('\n  Nothing was proposed on a steady face. The arrows were already in the boss when');
		console.log('  recording began, so they are part of the background reference and never look new.');
	}
}

async function probeFps(input) {
	const out = await capture('ffprobe', [
		'-v', 'error', '-select_streams', 'v:0',
		'-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', resolve(input)
	]);
	const [num, den] = out.trim().split('/').map(Number);
	const fps = den ? num / den : num;
	// MediaRecorder webm carries no usable rate, so fall back to what a phone actually records at.
	return Number.isFinite(fps) && fps > 1 && fps < 240 ? Math.round(fps) : 30;
}

async function play(target) {
	for (const player of ['ffplay', 'mpv', 'vlc', 'xdg-open']) {
		try {
			await run(player, player === 'ffplay' ? ['-v', 'error', '-autoexit', target] : [target]);
			return;
		} catch {
			// Try the next one: which player is installed is not something to make the caller solve.
		}
	}
	console.log('  no player found to watch it with. Open it yourself.');
}

function run(command, args) {
	return new Promise((good, bad) => {
		const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
		child.on('error', bad);
		child.on('close', (code) => (code === 0 ? good() : bad(new Error(`${command} exited ${code}`))));
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
