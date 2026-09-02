#!/usr/bin/env node
/**
 * Replays recorded proposals through the tracker, so what it decides can be measured without paying
 * for the detector again.
 *
 * Written against the file `dump-passes.mjs` leaves behind. Everything reported here is reported the
 * same way `eval-arrows-video.mjs` reports it, and the two agree when given the same settings, which
 * is the check that this is measuring the real thing and not a convenient model of it.
 *
 *   node scripts/eval-tracker.mjs
 *   node scripts/eval-tracker.mjs --sweep '{"as it is":{}, "lower bar":{"minVotes":4}}'
 */
import { build } from 'esbuild';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const file = resolve(option('in', join(ROOT, 'test/datasets/passes.json')));
const MATCH = Number(option('match', 0.05));

const { replay } = await load();
const data = JSON.parse(await readFile(file, 'utf8'));
const recordings = data.recordings;

function score(options) {
	let found = 0;
	let wanted = 0;
	let spurious = 0;
	let sureFound = 0;
	let sureWrong = 0;
	let everFound = 0;
	let everShown = 0;
	let everRight = 0;
	let doubles = 0;
	const rows = [];

	for (const shot of recordings) {
		const targets = shot.targets.map(([x, y]) => ({ x, y }));
		const passes = shot.passes.map((pass) => pass.map(([x, y, area, face]) => ({ x, y, area, face })));
		const out = replay(passes, shot.expected, options);

		const taken = new Set();
		let hit = 0;
		for (const target of targets) {
			let best = -1;
			let near = MATCH;
			out.arrows.forEach((arrow, i) => {
				if (taken.has(i)) return;
				const d = Math.hypot(arrow.x - target.x, arrow.y - target.y);
				if (d < near) {
					near = d;
					best = i;
				}
			});
			if (best >= 0) {
				taken.add(best);
				hit += 1;
			}
		}
		found += hit;
		wanted += targets.length;
		spurious += out.arrows.length - taken.size;
		out.arrows.forEach((arrow, i) => {
			if (taken.has(i)) return;
			const onOne = out.arrows.some(
				(other, j) => taken.has(j) && Math.hypot(arrow.x - other.x, arrow.y - other.y) < 0.12
			);
			if (onOne) doubles += 1;
		});

		const sureTaken = new Set();
		for (const target of targets) {
			let best = -1;
			let near = MATCH;
			out.scored.forEach((arrow, i) => {
				if (sureTaken.has(i)) return;
				const d = Math.hypot(arrow.x - target.x, arrow.y - target.y);
				if (d < near) {
					near = d;
					best = i;
				}
			});
			if (best >= 0) {
				sureTaken.add(best);
				sureFound += 1;
			}
		}
		sureWrong += out.scored.length - sureTaken.size;

		// Every distinct place a mark was ever shown, so one mark held for thirty passes counts once.
		const places = [];
		for (const mark of out.shownEver) {
			const near = places.find((p) => Math.hypot(p.x - mark.x, p.y - mark.y) < MATCH);
			if (!near) places.push({ x: mark.x, y: mark.y });
		}
		for (const place of places) {
			everShown += 1;
			if (targets.some((t) => Math.hypot(t.x - place.x, t.y - place.y) < MATCH)) everRight += 1;
		}
		for (const target of targets) {
			if (places.some((p) => Math.hypot(p.x - target.x, p.y - target.y) < MATCH)) everFound += 1;
		}

		rows.push(`  ${shot.video}  ${hit}/${targets.length} found, ${out.arrows.length - taken.size} spurious`);
	}

	return { found, wanted, spurious, sureFound, sureWrong, everFound, everShown, everRight, doubles, rows };
}

const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(0)}%`;
const sweep = JSON.parse(option('sweep', 'null'));
const base = JSON.parse(option('tune', '{}'));

if (!sweep) {
	const r = score(base);
	if (args.includes('--verbose')) console.log(r.rows.join('\n'));
	console.log(`\ntracker over ${recordings.length} recorded sweeps, ${r.wanted} arrows`);
	console.log(`  arrows found        ${r.found}/${r.wanted} (${pct(r.found, r.wanted)})`);
	console.log(`  spurious arrows     ${r.spurious} (${(r.spurious / recordings.length).toFixed(1)} per recording)`);
	console.log(`  of those, scored    ${r.sureFound}/${r.wanted} (${pct(r.sureFound, r.wanted)}) right, ${r.sureWrong} wrong`);
	console.log(`  ever marked right   ${r.everFound}/${r.wanted} (${pct(r.everFound, r.wanted)})`);
	console.log(`  right of all shown  ${pct(r.everRight, r.everShown)}`);
	console.log(`  double marks        ${r.doubles}`);
} else {
	console.log(`${recordings.length} recorded sweeps, ${recordings.reduce((n, r) => n + r.targets.length, 0)} arrows\n`);
	console.log(`  ${'setting'.padEnd(30)} found         wrong  scored right  scored wrong  ever right  shown right  doubles`);
	for (const [label, over] of Object.entries(sweep)) {
		const r = score({ ...base, ...over });
		console.log(
			`  ${label.padEnd(30)} ${String(r.found).padStart(3)}/${r.wanted} (${pct(r.found, r.wanted).padStart(3)})` +
				`  ${String(r.spurious).padStart(5)}` +
				`  ${(String(r.sureFound) + '/' + r.wanted).padStart(12)}` +
				`  ${String(r.sureWrong).padStart(12)}` +
				`  ${pct(r.everFound, r.wanted).padStart(10)}` +
				`  ${pct(r.everRight, r.everShown).padStart(11)}` +
				`  ${String(r.doubles).padStart(7)}`
		);
	}
}

async function load() {
	const directory = await mkdtemp(join(tmpdir(), 'appchery-tracker-'));
	const outfile = join(directory, 'tracker.mjs');
	await build({
		entryPoints: [join(ROOT, 'src/lib/vision/tracker-entry.ts')],
		bundle: true,
		format: 'esm',
		platform: 'node',
		outfile
	});
	const module = await import(outfile);
	setTimeout(() => rm(directory, { recursive: true, force: true }), 0).unref?.();
	return module;
}
