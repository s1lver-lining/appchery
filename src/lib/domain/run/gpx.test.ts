import { describe, expect, it } from 'vitest';
import { parseGpx, toGpx } from './gpx';
import { replayTracked } from './track';
import type { TrackedFix } from './track';

const point = (at: number, lat: number, lon: number, extra: Partial<TrackedFix> = {}): TrackedFix => ({
	at,
	lat,
	lon,
	accuracy: 5,
	altitude: 70,
	speed: 3,
	elapsedSeconds: 0,
	...extra
});

describe('toGpx', () => {
	it('writes a point per fix, with its height and its beat', () => {
		const text = toGpx(
			[point(1_700_000_000_000, 48.111_97, -1.678_377, { heartRate: 142 })],
			'Tuesday intervals',
			1_700_000_000_000
		);
		expect(text).toContain('<trkpt lat="48.111970" lon="-1.678377">');
		expect(text).toContain('<ele>70.0</ele>');
		expect(text).toContain('<time>2023-11-14T22:13:20Z</time>');
		expect(text).toContain('<gpxtpx:hr>142</gpxtpx:hr>');
		expect(text).toContain('<name>Tuesday intervals</name>');
	});

	it('leaves the extension out where nothing measured a beat', () => {
		const text = toGpx([point(1_700_000_000_000, 48, -1)], 'Run', null);
		expect(text).not.toContain('extensions');
	});

	// A track with no sport on it is read as a workout, and a workout is shown without a pace.
	it('says it is a run', () => {
		expect(toGpx([], 'Run', null)).toContain('<type>running</type>');
	});

	it('escapes a name that would otherwise break the file', () => {
		expect(toGpx([], 'Rain & <wind>', null)).toContain('<name>Rain &amp; &lt;wind&gt;</name>');
	});
});

describe('parseGpx', () => {
	it('reads back what it wrote', () => {
		const written = toGpx(
			[
				point(1_700_000_000_000, 48.111_97, -1.678_377, { heartRate: 142 }),
				point(1_700_000_004_000, 48.112_07, -1.678_384, { altitude: 74, heartRate: 148 })
			],
			'Tuesday',
			1_700_000_000_000
		);
		const read = parseGpx(written);
		expect(read.name).toBe('Tuesday');
		expect(read.startedAt).toBe(1_700_000_000_000);
		expect(read.fixes).toHaveLength(2);
		expect(read.fixes[1].heartRate).toBe(148);
		expect(read.fixes[1].altitude).toBe(74);
		expect(read.fixes[1].elapsedSeconds).toBe(4);
	});

	it('reads a file written by somebody else, extensions and all', () => {
		const read = parseGpx(`<?xml version='1.0'?>
<gpx version="1.1" creator="Ghostracer">
  <metadata><time>2026-09-20T15:55:18Z</time></metadata>
  <trk><name>Ghostracer</name><trkseg>
    <trkpt lon="-1.678377" lat="48.11197"><ele>75</ele><time>2026-09-20T15:55:19Z</time></trkpt>
    <trkpt lon="-1.6783837" lat="48.11207"><ele>75</ele><time>2026-09-20T15:55:44Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>151</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`);
		expect(read.name).toBe('Ghostracer');
		expect(read.fixes).toHaveLength(2);
		expect(read.fixes[0].lat).toBeCloseTo(48.11197);
		expect(read.fixes[0].heartRate).toBeNull();
		expect(read.fixes[1].heartRate).toBe(151);
		expect(read.fixes[1].elapsedSeconds).toBe(25);
	});

	it('keeps nothing from a file that holds no track', () => {
		expect(parseGpx('<gpx></gpx>').fixes).toEqual([]);
		expect(parseGpx('not xml at all').fixes).toEqual([]);
	});

	/** A file read back has to add up to the run it came from, which is the whole point of reading it. */
	it('replays into the distance the track covers', () => {
		const fixes = parseGpx(
			toGpx(
				Array.from({ length: 20 }, (_, i) =>
					point(1_700_000_000_000 + i * 4000, 48.1 + i * 0.000_09, -1.6)
				),
				'Run',
				null
			)
		).fixes;
		// Twenty points a hundredth of a minute of latitude apart: a shade under two hundred metres.
		expect(replayTracked(fixes).distanceM).toBeGreaterThan(180);
		expect(replayTracked(fixes).distanceM).toBeLessThan(200);
	});
});
