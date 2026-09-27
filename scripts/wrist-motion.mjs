#!/usr/bin/env node
/**
 * Turns a wrist motion export from the app's settings into CSV: one file per recording, and an index
 * saying what was scored in each end, or how many training arrows were counted. See
 * doc/llm-memory/wrist-motion.md.
 *
 *   node scripts/wrist-motion.mjs appchery-wrist-motion-2026-09-27.json out/
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [input, out = 'wrist-motion'] = process.argv.slice(2);
if (!input) {
	console.error('usage: node scripts/wrist-motion.mjs <export.json> [out dir]');
	process.exit(1);
}

// The app's own decoder, so the script cannot drift from the format.
const built = await build({
	entryPoints: [new URL('../src/lib/watch/motion.ts', import.meta.url).pathname],
	bundle: true,
	format: 'esm',
	write: false
});
const { decode } = await import(
	'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);

const file = JSON.parse(await readFile(input, 'utf8'));
if (file.format !== 'appchery-wrist-motion') throw new Error(`${input} is not a wrist motion export`);
await mkdir(out, { recursive: true });

const rounds = new Map(file.activities.map((activity) => [activity.id, activity]));
const index = ['file,kind,activity,round,stage,end,arm,started_at,duration_ms,shot,ended_on_shot,score,arrows,arrows_before,arrows_after,gyro_n,accel_n'];
for (const recording of file.recordings) {
	const samples = await decode(Buffer.from(recording.data, 'base64'));
	const training = recording.kind === 'training';
	const name = training
		? `training-${recording.startedAt}.csv`
		: `${recording.activityId.slice(0, 8)}-${recording.stageIndex}-${String(recording.endNo).padStart(2, '0')}-${recording.shotOrdinal ?? 0}-${recording.startedAt}.csv`;
	const lines = ['sensor,t_ms,x,y,z'];
	for (const [sensor, axes] of [['gyro', samples.gyro], ['accel', samples.accel]]) {
		for (let i = 0; i < axes.t.length; i++) {
			lines.push(`${sensor},${axes.t[i]},${axes.x[i]},${axes.y[i]},${axes.z[i]}`);
		}
	}
	await writeFile(join(out, name), lines.join('\n') + '\n');
	const round = training ? recording.session ?? '' : rounds.get(recording.activityId)?.round ?? '';
	index.push([
		name,
		training ? 'training' : 'end',
		training ? recording.sessionId ?? '' : recording.activityId,
		JSON.stringify(round),
		recording.stageIndex ?? '',
		recording.endNo ?? '',
		recording.arm ?? '',
		new Date(recording.startedAt).toISOString(),
		recording.durationMs,
		recording.shotOrdinal ?? '',
		recording.endedOnShot ? 1 : '',
		recording.score ?? '',
		(recording.arrows ?? []).join(' '),
		recording.arrowsBefore ?? '',
		recording.arrowsAfter ?? '',
		samples.gyro.t.length,
		samples.accel.t.length
	].join(','));
}
await writeFile(join(out, 'index.csv'), index.join('\n') + '\n');
console.log(`${file.recordings.length} recordings written to ${out}`);
