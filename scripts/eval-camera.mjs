#!/usr/bin/env node
/**
 * Measures the app's live scoring path against the impacts placed by hand.
 *
 *   node scripts/eval-camera.mjs                  # every labelled recording
 *   node scripts/eval-camera.mjs --video 17-51    # one of them
 *   node scripts/eval-camera.mjs --replay         # the single scanner, same metric
 *   node scripts/eval-camera.mjs --motion         # only sessions whose sensors were saved
 *
 * Everything is compared in the video's own pixels, so a fit turned a quarter is not counted as error.
 * What the numbers mean: doc/live-scoring-split.md.
 */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { serve, play } from './virtual-camera.mjs';
import { motionPath } from './lib/recordings.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const WORK = join(ROOT, 'test/datasets/labelling');

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

/** The ring between black and white, which is where the four handles sit. */
const ANCHOR = 0.8;
const ANCHOR_RADII = { '5-ring': 0.6 };

/** How near a mark must land to be the same arrow, in face radii. Half a ring on a ten ring face. */
const NEAR = 0.05;

async function main() {
	const only = option('video');
	const { server, port, recordings } = await serve();
	const browser = await chromium.launch({ headless: !args.includes('--headed') });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.on('console', (m) => m.type() === 'error' && console.error(`  page: ${m.text()}`));

	// A subset, for when the question is whether one change moved the numbers rather than what they are.
	const first = Number(option('first', 0));
	const rows = [];
	/** Every mark that matched no impact, by how far out it sat. See `ringReport`. */
	const stray = [];
	/** How far the nearest mark sat from each impact, near enough to count or not. */
	const misses = [];
	for (const { name, path } of recordings) {
		if (only && !name.includes(only)) continue;
		// Gravity cannot help a recording that never saved any, so mixing them only buries the effect.
		if (args.includes('--motion') && !existsSync(motionPath(path))) continue;
		if (first > 0 && rows.length >= first) break;
		const truth = await groundTruth(name, path);
		if (!truth) continue;

		const report = await play(page, port, name, { frames: true, replay: args.includes('--replay') });
		if (report.error) {
			console.error(`  ${name}: ${report.error}`);
			continue;
		}
		const row = judge(name, report, truth, stray, misses);
		rows.push(row);
		console.log(
			`${name.slice(-24)}  ${row.found}/${row.arrows} found, ${row.everFound}/${row.arrows} ever, ` +
				`${row.spurious} spurious, error ${pct(row.errorMedian)}`
		);
	}

	await browser.close();
	server.close();
	report(rows);
	// The shape of the miss, not just the count over the bar.
	const bands = [0.05, 0.1, 0.2, 0.5, 1];
	console.log('');
	console.log('how near the nearest mark got to each impact');
	let last = 0;
	for (const band of bands) {
		const n = misses.filter((m) => m > last && m <= band).length;
		console.log(`  ${(last * 100).toFixed(0)}% to ${(band * 100).toFixed(0)}% of a radius   ${n}`);
		last = band;
	}
	console.log(`  further, or no mark at all    ${misses.filter((m) => m > 1).length}`);
	ringReport(stray);
	if (option('json')) await writeFile(option('json'), JSON.stringify(rows, null, '\t'));
}

/** The impacts placed by hand, in the video's own pixels, on each frame somebody vouched for. */
async function groundTruth(name, path) {
	const folder = join(WORK, name);
	if (!existsSync(join(folder, 'labels.json'))) return null;
	const label = JSON.parse(await readFile(join(folder, 'labels.json'), 'utf8'));
	/*
	 * A recording with no arrows written down yet is not a recording with no arrows in the paper. The
	 * fits can be filled in automatically and the arrows cannot, so a workspace part way through
	 * labelling is full of recordings that would otherwise be scored as six false marks out of nothing.
	 */
	if (label.empty || !(label.arrows?.length > 0)) return null;
	const meta = JSON.parse(await readFile(join(folder, 'frames.json'), 'utf8'));
	const fps = await frameRate(path);
	if (!fps) return null;

	const radius = ANCHOR_RADII[label.faceType] ?? ANCHOR;
	const own = label.frameArrows ?? {};
	// Only frames whose arrows were clicked on them. An automatic fit picks its own angle, which would
	// turn the arrows on every frame and call the result truth.
	const vouched = new Set([String(label.arrowFrame ?? 0), ...Object.keys(own)]);
	const at = [];
	for (const sample of vouched) {
		const frame = label.frames?.[sample];
		if (!frame || frame.skip || !frame.handles) continue;
		const arrows = own[sample]?.length >= label.arrows.length ? own[sample] : label.arrows;
		const h = homographyOf(frame.handles, radius);
		if (!h) continue;
		const index = meta.chosen[Number(sample)];
		if (index === undefined) continue;
		at.push({
			time: index / fps,
			// The face radius in this frame's pixels, so an error can be reported as a share of it.
			radius: faceRadius(h, radius),
			points: arrows.map((a) => project(h, a.x, a.y))
		});
	}
	at.sort((a, b) => a.time - b.time);
	return at.length > 0 ? { at, count: label.arrows.length } : null;
}

/** The face radius in this frame's pixels, meaned over the four handles because a seen face is oval. */
function faceRadius(h, r) {
	const middle = project(h, 0, 0);
	const points = [
		project(h, r, 0),
		project(h, 0, r),
		project(h, -r, 0),
		project(h, 0, -r)
	];
	const mean = points.reduce((sum, p) => sum + Math.hypot(p.x - middle.x, p.y - middle.y), 0) / 4;
	// Back out to the printed edge, since the handles sit at `r` of it and errors are quoted against it.
	return mean / r;
}

/** Judged at the labelled moments, and again at the last of them, which is the score being offered. */
function judge(name, report, truth, stray, misses) {
	const frames = report.frames ?? [];
	const last = frames.at(-1);
	const errors = [];
	let everFound = 0;
	let spuriousEver = 0;

	// A labelled moment, not the last frame: the comparison is in pixels and the camera keeps moving.
	const closing = truth.at.at(-1);
	const closingFrame = nearest(frames, closing.time) ?? last;
	const final = matchup(closingFrame?.arrows ?? [], closing, errors);
	// Where every mark that matched nothing sat on the face, for the ring frontier question.
	for (const mark of closingFrame?.arrows ?? []) {
		if (!final.claimed.has(mark)) stray.push(Math.hypot(mark.x, mark.y));
	}

	// And over the sweep, so an arrow that was right at some point counts as having been seen.
	const seen = new Array(truth.count).fill(false);
	for (const moment of truth.at) {
		const frame = nearest(frames, moment.time);
		if (!frame) continue;
		const pass = matchup(frame.arrows ?? [], moment, errors);
		pass.hit.forEach((got, i) => (seen[i] ||= got));
		spuriousEver = Math.max(spuriousEver, pass.spurious);
	}
	everFound = seen.filter(Boolean).length;

	// Pass or fail at one bar cannot tell a mark just outside it from one on the wrong side of the boss.
	for (const point of closing.points) {
		let best = Infinity;
		for (const mark of closingFrame?.arrows ?? []) {
			best = Math.min(best, Math.hypot(mark.imageX - point.x, mark.imageY - point.y) / closing.radius);
		}
		misses.push(best);
	}
	if (process.env.TRACE) {
		for (const moment of truth.at) {
			const frame = nearest(frames, moment.time);
			const pass = frame ? matchup(frame.arrows ?? [], moment, []) : null;
			console.log(
				`   t=${moment.time.toFixed(2)} r=${moment.radius.toFixed(0)}px truth=${moment.points.length} ` +
					`marks=${frame?.arrows.length ?? '-'} found=${pass?.found ?? '-'} ` +
					`truth0=${moment.points[0].x.toFixed(0)},${moment.points[0].y.toFixed(0)} ` +
					`mark0=${frame?.arrows[0] ? `${frame.arrows[0].imageX.toFixed(0)},${frame.arrows[0].imageY.toFixed(0)}` : '-'}`
			);
		}
	}

	return {
		video: name,
		arrows: truth.count,
		found: final.found,
		everFound,
		spurious: final.spurious,
		spuriousEver,
		errorMedian: median(errors),
		errorP90: quantile(errors, 0.9),
		rebaseMedian: median(frames.flatMap((f) => f.rebase ?? [])),
		passes: last?.passes ?? 0,
		frames: frames.length
	};
}

/** Pairs marks with impacts, nearest first, each impact claimed at most once. */
function matchup(marks, moment, errors) {
	const hit = new Array(moment.points.length).fill(false);
	const taken = new Set();
	const pairs = [];
	for (let m = 0; m < marks.length; m++) {
		for (let t = 0; t < moment.points.length; t++) {
			const d = Math.hypot(marks[m].imageX - moment.points[t].x, marks[m].imageY - moment.points[t].y);
			pairs.push({ m, t, d: d / moment.radius });
		}
	}
	pairs.sort((a, b) => a.d - b.d);
	let found = 0;
	for (const pair of pairs) {
		if (pair.d > NEAR || hit[pair.t] || taken.has(pair.m)) continue;
		hit[pair.t] = true;
		taken.add(pair.m);
		found += 1;
		errors.push(pair.d);
	}
	return { found, hit, spurious: marks.length - taken.size, claimed: new Set([...taken].map((i) => marks[i])) };
}

/** The replayed frame nearest a moment of the recording. */
function nearest(frames, time) {
	let best = null;
	let gap = Infinity;
	for (const frame of frames) {
		const d = Math.abs((frame.videoTime ?? 0) - time);
		if (d < gap) {
			gap = d;
			best = frame;
		}
	}
	// Nothing within a tenth of a second is not the same moment, whatever the nearest frame is.
	return gap <= 0.1 ? best : null;
}

/** Whether wrong marks pile up on the ring frontiers, as the archer reads it. See the doc. */
function ringReport(radii) {
	if (radii.length === 0) return;
	const frontiers = [0.2, 0.4, 0.6, 0.8];
	const near = (r, band) => frontiers.some((f) => Math.abs(r - f) <= band);
	const bands = [0.025, 0.05];
	console.log('');
	console.log('where the wrong marks sit');
	console.log(`wrong marks         ${radii.length}`);
	for (const band of bands) {
		const on = radii.filter((r) => near(r, band)).length;
		// What scattering would give: the share of the face's area within `band` of a frontier.
		let area = 0;
		for (const f of frontiers) area += Math.max(0, (f + band) ** 2 - Math.max(0, f - band) ** 2);
		const expected = area / 1.05 ** 2;
		console.log(
			`  within ${(band * 100).toFixed(1)}% of a ring  ${on} (${share(on, radii.length)}), ` +
				`scattered would give ${Math.round(expected * 100)}%`
		);
	}
	const outside = radii.filter((r) => {
		const f = frontiers.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
		return Math.abs(r - f) <= 0.05 && r > f;
	}).length;
	const inside = radii.filter((r) => {
		const f = frontiers.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
		return Math.abs(r - f) <= 0.05 && r < f;
	}).length;
	console.log(`  of those, outward ${outside} against ${inside} inward`);
}

function report(rows) {
	const arrows = sum(rows.map((r) => r.arrows));
	const errors = rows.map((r) => r.errorMedian).filter((e) => e !== null);
	console.log('');
	console.log(
		args.includes('--replay')
			? 'the single scanner, which is what the labelling tool and the offline harnesses watch'
			: 'the live path, page and worker, as the archer has it'
	);
	console.log(`recordings          ${rows.length}`);
	console.log(`arrows found        ${sum(rows.map((r) => r.found))}/${arrows} (${share(sum(rows.map((r) => r.found)), arrows)})`);
	console.log(`ever right          ${sum(rows.map((r) => r.everFound))}/${arrows} (${share(sum(rows.map((r) => r.everFound)), arrows)})`);
	console.log(`spurious at the end ${sum(rows.map((r) => r.spurious))} (${(sum(rows.map((r) => r.spurious)) / Math.max(1, rows.length)).toFixed(1)} per recording)`);
	console.log(`impact error        ${pct(median(errors))} median, ${pct(quantile(rows.map((r) => r.errorP90).filter(Boolean), 0.5))} at p90`);
	console.log(`detection passes    ${Math.round(sum(rows.map((r) => r.passes)) / Math.max(1, rows.length))} per recording`);
	console.log(`rebase moved arrows ${pct(median(rows.map((r) => r.rebaseMedian).filter((v) => v !== null)))} median`);
}

function homographyOf(points, r) {
	const rows = [];
	const anchors = [
		[r, 0],
		[0, r],
		[-r, 0],
		[0, -r]
	];
	for (let i = 0; i < 4; i++) {
		const [u, v] = anchors[i];
		const [x, y] = points[i];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}
	const h = solveEight(rows);
	return (
		h && [
			[h[0], h[1], h[2]],
			[h[3], h[4], h[5]],
			[h[6], h[7], 1]
		]
	);
}

/** Gaussian elimination on the eight rows four point correspondences give. */
function solveEight(rows) {
	const n = 8;
	const m = rows.map((row) => [...row]);
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
		if (Math.abs(m[pivot][col]) < 1e-12) return null;
		[m[col], m[pivot]] = [m[pivot], m[col]];
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = m[r][col] / m[col][col];
			for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
		}
	}
	return m.map((row, i) => row[n] / row[i]);
}

function project(h, x, y) {
	const w = h[2][0] * x + h[2][1] * y + h[2][2];
	return {
		x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
		y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w
	};
}

/** The recording's real frame rate, read off the packets, because the header says a thousand. */
const rates = new Map();
async function frameRate(file) {
	if (rates.has(file)) return rates.get(file);
	const text = await new Promise((done) => {
		const child = spawn('ffprobe', [
			'-v', 'error', '-select_streams', 'v:0',
			'-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file
		]);
		let out = '';
		child.stdout.on('data', (c) => (out += c));
		child.on('close', () => done(out));
	});
	const times = text.trim().split('\n').map(Number).filter(Number.isFinite);
	const fps = times.length > 1 ? (times.length - 1) / (times.at(-1) - times[0]) : null;
	rates.set(file, fps);
	return fps;
}

const sum = (list) => list.reduce((a, b) => a + b, 0);
const median = (list) => quantile(list, 0.5);
function quantile(list, q) {
	if (!list || list.length === 0) return null;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}
const pct = (v) => (v === null || v === undefined ? '--' : `${(v * 100).toFixed(1)}%`);
const share = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '--');

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
