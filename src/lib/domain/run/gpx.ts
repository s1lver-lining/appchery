import type { TrackedFix } from './track';

/**
 * A run as the rest of the world writes one.
 *
 * GPX is what every watch, every website and every other running app reads and writes, so it is how
 * a run leaves this app and how somebody else's run comes into it. Nothing here touches a database
 * or a DOM: a track is a list of points, and turning one into text and back is arithmetic.
 *
 * The heart rate rides in Garmin's `TrackPointExtension`, which is not part of GPX itself but is
 * what everybody implements, including the watch this was written against.
 */

const NS = 'http://www.topografix.com/GPX/1/1';
const TPX = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1';

/** Six decimals is about a tenth of a metre, which is finer than any receiver is right to. */
const PLACES = 6;

function iso(at: number): string {
	return new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function escape(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * The track as a file. Points are written in the order they were taken, in one segment: a pause
 * leaves a gap in the times, which is what every reader expects a pause to look like.
 */
export function toGpx(fixes: TrackedFix[], name: string, startedAt: number | null): string {
	const lines: string[] = [];
	lines.push(`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>`);
	lines.push(
		`<gpx version="1.1" creator="Appchery" xmlns="${NS}" xmlns:gpxtpx="${TPX}">`
	);
	lines.push(`  <metadata><time>${iso(startedAt ?? fixes[0]?.at ?? Date.now())}</time></metadata>`);
	lines.push(`  <trk>`);
	lines.push(`    <name>${escape(name)}</name>`);
	lines.push(`    <trkseg>`);
	for (const fix of fixes) {
		lines.push(`      <trkpt lat="${fix.lat.toFixed(PLACES)}" lon="${fix.lon.toFixed(PLACES)}">`);
		if (fix.altitude !== null && fix.altitude !== undefined) {
			lines.push(`        <ele>${fix.altitude.toFixed(1)}</ele>`);
		}
		lines.push(`        <time>${iso(fix.at)}</time>`);
		if (fix.heartRate) {
			lines.push(`        <extensions>`);
			lines.push(`          <gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(fix.heartRate)}</gpxtpx:hr></gpxtpx:TrackPointExtension>`);
			lines.push(`        </extensions>`);
		}
		lines.push(`      </trkpt>`);
	}
	lines.push(`    </trkseg>`);
	lines.push(`  </trk>`);
	lines.push(`</gpx>`);
	return lines.join('\n') + '\n';
}

export interface ImportedTrack {
	/** What the file calls the run, which is rarely worth keeping but costs nothing to read. */
	name: string | null;
	startedAt: number | null;
	fixes: TrackedFix[];
}

const TRKPT = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/gi;

function attribute(attributes: string, name: string): number | null {
	const found = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attributes);
	const value = found ? Number(found[1]) : NaN;
	return Number.isFinite(value) ? value : null;
}

function inside(body: string, tag: string): string | null {
	// Namespaced or not: gpxtpx:hr and hr are the same field to every writer that emits either.
	const found = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i').exec(body);
	return found ? found[1].trim() : null;
}

/**
 * A file somebody handed us, read for the one thing it is worth reading for: where and when.
 *
 * Scanned rather than parsed into a document, because this is domain code and a DOM is a browser.
 * Anything that is not a point with a position is skipped rather than refused: half the files in
 * the world carry waypoints, routes and extensions this app has no use for.
 */
export function parseGpx(text: string): ImportedTrack {
	const fixes: TrackedFix[] = [];
	TRKPT.lastIndex = 0;
	let found: RegExpExecArray | null;
	while ((found = TRKPT.exec(text)) !== null) {
		const attributes = found[1] ?? found[3] ?? '';
		const body = found[2] ?? '';
		const lat = attribute(attributes, 'lat');
		const lon = attribute(attributes, 'lon');
		if (lat === null || lon === null) continue;
		const when = inside(body, 'time');
		const at = when ? Date.parse(when) : NaN;
		const altitude = Number(inside(body, 'ele'));
		const beat = Number(inside(body, 'hr'));
		fixes.push({
			at: Number.isFinite(at) ? at : 0,
			lat,
			lon,
			// A file says nothing about how sure its writer was, and a guess here would be a lie.
			accuracy: null,
			altitude: Number.isFinite(altitude) ? altitude : null,
			speed: null,
			heartRate: Number.isFinite(beat) && beat > 0 ? Math.round(beat) : null,
			elapsedSeconds: 0
		});
	}

	// A point with no time of its own cannot be placed on the run's clock, and neither can any after it.
	const started = fixes.find((fix) => fix.at > 0)?.at ?? null;
	for (const fix of fixes) {
		fix.elapsedSeconds = started !== null && fix.at > 0 ? Math.max(0, (fix.at - started) / 1000) : 0;
	}

	const name = inside(text, 'name');
	return { name: name ? name.slice(0, 60) : null, startedAt: started, fixes };
}
