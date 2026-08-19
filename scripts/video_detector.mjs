#!/usr/bin/env node
/**
 * Replays a recorded scoring session through the live detector and writes the video back with the
 * overlay burnt in, exactly as the archer would have seen it through the phone.
 *
 * Driven by arrow_detector.sh, which picks this half when it is handed a video rather than a picture.
 *
 * A still is analysed on its own; a session is not. The face geometry, the settle counter and the
 * tracker's evidence are all built up over time, so the frames are fed in order through one scanner
 * at the rate the app detects at. Feeding them independently would measure a different thing.
 *
 * A recording has to replay in about the time it took to record, or it says nothing about whether the
 * detector can keep up live. So nothing here touches an image codec per frame: raw pixels come out of
 * the decoder, the overlay is drawn straight into them, and they go into the encoder as they are.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, extname } from 'node:path';
import { Canvas, TEXT_HEIGHT } from './lib/raster.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

/** How often the app runs the full search. Anything else would measure a detector it does not ship. */
const DETECT_EVERY_MS = 300;

const GREEN = [0, 230, 118];
const MAGENTA = [255, 64, 255];
const AMBER = [255, 193, 7];
const WHITE = [255, 255, 255];

/** Containers and what will actually go inside them, because h264 in a webm is a hard error. */
const CODECS = {
	'.webm': ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M'],
	'.mkv': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'],
	'.mov': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'],
	'.mp4': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
};

export async function replayVideo({ input, output, watch, model, json, limit, everyMs, arrows }) {
	const { width, height, fps } = await probe(input);
	const target = json ? null : resolve(output ?? defaultOutput(input));

	if (target && !CODECS[extname(target).toLowerCase()]) {
		throw new Error(`Cannot write ${extname(target)}. Use one of ${Object.keys(CODECS).join(', ')}.`);
	}

	const { Replay } = await load();
	const replay = new Replay(everyMs || DETECT_EVERY_MS, model ?? null);
	if (arrows) replay.setLimit(arrows);

	/**
	 * Passthrough, or ffmpeg invents frames. A MediaRecorder webm carries no sane frame rate (these
	 * report 1000fps), so the rawvideo muxer duplicates every frame until it reaches it: one recording
	 * of 419 frames came out as 8528, which is twenty times the work and makes any timing meaningless.
	 */
	const decoder = spawn('ffmpeg', [
		'-v', 'error', '-i', resolve(input),
		'-fps_mode', 'passthrough',
		'-f', 'rawvideo', '-pix_fmt', 'rgba', '-'
	], { stdio: ['ignore', 'pipe', 'inherit'] });

	const encoder = target
		? spawn('ffmpeg', [
				'-v', 'error', '-y',
				'-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(fps),
				'-i', '-',
				...CODECS[extname(target).toLowerCase()], '-pix_fmt', 'yuv420p', target
			], { stdio: ['pipe', 'inherit', 'inherit'] })
		: null;

	const states = [];
	const started = Date.now();
	/** Time inside the detector alone. Drawing the overlay and encoding it are this tool's costs, not
	 * the phone's, and counting them made the detector look slower than it is. */
	let detectorMs = 0;
	let index = 0;

	try {
		for await (const frame of frames(decoder.stdout, width * height * 4)) {
			if (limit && index >= limit) break;
			const full = { width, height, data: new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length) };
			const before = performance.now();
			const state = replay.push(full, reduce(full, replay.scaleFactor), (index / fps) * 1000);
			detectorMs += performance.now() - before;
			states.push(summarise(state));

			if (encoder) {
				paint(full, state, width);
				await write(encoder.stdin, frame);
			}
			index += 1;
			if (!json && index % 100 === 0) {
				process.stderr.write(`\r  frame ${index}  (${(index / ((Date.now() - started) / 1000)).toFixed(0)} fps)`);
			}
		}
	} finally {
		decoder.kill('SIGKILL');
	}

	if (!json) process.stderr.write(`\r  ${index} frames                    \n`);
	const dropped = replay.dropped;

	if (encoder) {
		encoder.stdin.end();
		await new Promise((good, bad) => {
			encoder.on('close', (code) => (code === 0 ? good() : bad(new Error(`ffmpeg exited ${code}`))));
			encoder.on('error', bad);
		});
	}

	report(input, states, fps, Boolean(model), json, (Date.now() - started) / 1000, index, dropped, detectorMs / 1000);

	if (target) {
		console.log(`\n  overlay written to ${target}`);
		if (watch) await play(target);
	}
}

/** Bundles the detector once and imports it, so the replay runs in this process rather than a browser. */
async function load() {
	const directory = await mkdtemp(join(tmpdir(), 'appchery-vision-'));
	const outfile = join(directory, 'vision.mjs');
	try {
		await build({
			entryPoints: [join(ROOT, 'src/lib/vision/video-entry.ts')],
			bundle: true,
			format: 'esm',
			platform: 'node',
			outfile
		});
		return await import(outfile);
	} finally {
		// The module is already loaded, so the file on disk has done its job.
		setTimeout(() => rm(directory, { recursive: true, force: true }), 0).unref?.();
	}
}

/** Splits the decoder's byte stream back into frames, which it has no framing of its own for. */
async function* frames(stream, size) {
	let held = Buffer.alloc(0);
	for await (const chunk of stream) {
		held = held.length === 0 ? chunk : Buffer.concat([held, chunk]);
		while (held.length >= size) {
			yield held.subarray(0, size);
			held = held.subarray(size);
		}
	}
}

function write(stream, buffer) {
	// Waiting for drain is what stops a fast decoder filling memory with frames the encoder has not taken.
	return stream.write(buffer) ? Promise.resolve() : new Promise((good) => stream.once('drain', good));
}

/** The frame reduced for detection, box filtered the same way the app's canvas reduces it. */
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

function summarise(state) {
	return {
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
}

function paint(frame, state, width) {
	const canvas = new Canvas(frame.data, frame.width, frame.height);
	const line = Math.max(1.5, width / 500);

	for (const face of state.faces) {
		for (const share of [0.2, 0.4, 0.6, 0.8, 1.0]) {
			// Green once the face is trusted enough to take arrows from, magenta while it is not.
			canvas.ellipse(
				face.cx, face.cy,
				face.semiMajor * share, face.semiMinor * share, face.rotation,
				state.steady ? GREEN : MAGENTA,
				share === 0.2 ? line * 1.5 : line,
				0.85
			);
		}
	}

	// Faint, because a candidate that never becomes an arrow is the thing worth watching.
	for (const candidate of state.pending) {
		canvas.circle(candidate.imageX, candidate.imageY, line * 3, AMBER, line, 0.8);
	}

	for (const arrow of state.arrows) {
		canvas.circle(arrow.imageX, arrow.imageY, line * 4, GREEN, line * 1.5);
		const text = arrow.decimal === null ? arrow.label : arrow.decimal.toFixed(1);
		const scale = Math.max(1, Math.round(width / 240));
		canvas.text(
			arrow.imageX - Canvas.textWidth(text, scale) / 2,
			arrow.imageY - line * 6 - TEXT_HEIGHT * scale,
			text, WHITE, scale
		);
	}

	/**
	 * The state panel is the point of this tool. Zero arrows on a video tells you nothing on its own:
	 * what tells you something is whether the face was found, whether it was ever trusted, and whether
	 * anything was proposed at all.
	 */
	const scale = Math.max(1, Math.round(width / 300));
	const step = (TEXT_HEIGHT + 3) * scale;
	const pad = scale * 4;
	canvas.fillRect(0, 0, frame.width, pad * 2 + step * 3, [0, 0, 0], 0.55);
	const colour = state.steady ? GREEN : AMBER;
	const lines = [
		`FACES ${state.faces.length}  SETTLED ${state.settled}  ${state.steady ? 'STEADY' : 'NOT STEADY'}`,
		`PROPOSALS ${state.detections}  PENDING ${state.pending.length}  ARROWS ${state.arrows.length}`,
		`DETECT ${state.cost.toFixed(0)}MS${state.detected ? '' : ' TRACKING'}`
	];
	lines.forEach((text, i) => canvas.text(pad, pad + i * step, text, colour, scale, false));
}

function defaultOutput(input) {
	return basename(input).replace(/\.[^.]+$/, '') + '-overlay.mp4';
}

function report(input, states, fps, learned, json, seconds, count, dropped = 0, detectorSeconds = 0) {
	const detections = states.filter((s) => s.detected);
	const cost = detections.map((s) => s.cost).sort((a, b) => a - b);

	const jumps = [];
	for (let i = 1; i < states.length; i++) {
		const before = states[i - 1];
		const now = states[i];
		if (before.cx === null || now.cx === null || !now.radius) continue;
		jumps.push(Math.hypot(now.cx - before.cx, now.cy - before.cy) / now.radius);
	}
	jumps.sort((a, b) => a - b);
	const at = (share) => (jumps.length ? jumps[Math.floor(jumps.length * share)] : 0);

	const summary = {
		video: basename(input),
		detector: learned ? 'learned' : 'classical',
		frames: count,
		fps,
		framesWithFace: states.filter((s) => s.faces > 0).length,
		framesSteady: states.filter((s) => s.steady).length,
		detectionPasses: detections.length,
		/** Passes the detector was too busy to take. On a phone these are frames it never sees. */
		passesDropped: dropped,
		proposals: detections.reduce((total, s) => total + s.detections, 0),
		arrowsConfirmed: Math.max(0, ...states.map((s) => s.arrows)),
		jitterMedian: Number((at(0.5) * 100).toFixed(2)),
		jitterP99: Number((at(0.99) * 100).toFixed(2)),
		medianDetectMs: cost.length ? Number(cost[Math.floor(cost.length / 2)].toFixed(1)) : 0,
		worstDetectMs: cost.length ? Number(cost[cost.length - 1].toFixed(1)) : 0,
		/** Above 1 the replay kept up with the recording, which is the bar for running live at all. */
		/** The detector alone against the clock. Above 1 it keeps up with the camera on this machine. */
		realtime: Number((count / fps / Math.max(detectorSeconds, 0.001)).toFixed(2)),
		/** The whole tool, which also decodes, draws and encodes. Not a number about the app. */
		toolRealtime: Number((count / fps / Math.max(seconds, 0.001)).toFixed(2))
	};

	if (json) {
		console.log(JSON.stringify(summary, null, 2));
		return;
	}

	const share = (n) => `${((n / Math.max(count, 1)) * 100).toFixed(0)}%`;
	console.log(`${summary.video}  ${count} frames at ${fps}fps  [${summary.detector}]`);
	console.log(`  face found        ${summary.framesWithFace} frames (${share(summary.framesWithFace)})`);
	console.log(`  steady enough     ${summary.framesSteady} frames (${share(summary.framesSteady)})`);
	console.log(
		`  proposals         ${summary.proposals} over ${summary.detectionPasses} detection passes` +
			(dropped > 0 ? `, ${dropped} dropped because the detector was busy` : '')
	);
	console.log(`  arrows confirmed  ${summary.arrowsConfirmed}`);
	console.log(`  fit jitter        ${summary.jitterMedian}% of radius median, ${summary.jitterP99}% at p99`);
	console.log(`  detection cost    ${summary.medianDetectMs}ms median, ${summary.worstDetectMs}ms worst`);
	console.log(
		`  detector speed    ${summary.realtime}x realtime ` +
			`(${detectorSeconds.toFixed(0)}s of detection for ${(count / fps).toFixed(0)}s of video)`
	);
	if (!json) console.log(`  tool speed        ${summary.toolRealtime}x, including drawing and encoding`);

	if (summary.framesSteady === 0 && summary.framesWithFace > 0) {
		console.log('\n  The face was found but was never trusted, so no arrow was ever looked for.');
	}
}

async function probe(input) {
	const out = await capture('ffprobe', [
		'-v', 'error', '-select_streams', 'v:0',
		'-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'csv=p=0', resolve(input)
	]);
	const [width, height, rate] = out.trim().split(',');
	const [num, den] = String(rate).split('/').map(Number);
	const fps = den ? num / den : num;
	return {
		width: Number(width),
		height: Number(height),
		// MediaRecorder webm carries no usable rate, so fall back to what a phone actually records at.
		fps: Number.isFinite(fps) && fps > 1 && fps < 240 ? Math.round(fps) : 30
	};
}

async function play(target) {
	for (const player of ['ffplay', 'mpv', 'vlc', 'xdg-open']) {
		try {
			await run(player, player === 'ffplay' ? ['-v', 'error', '-autoexit', target] : [target]);
			return;
		} catch {
			// Which player is installed is not something to make the caller solve.
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
