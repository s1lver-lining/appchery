// Entry point for scripts/eval-tracker.mjs, which replays recorded proposals through a tracker without
// running the detector again. Not imported by the app.
import { SweepTracker, type SweepOptions } from './sweep';
import { EXTRA_ARROWS } from './pipeline';
import type { Impact } from './types';

export { SweepTracker };
export type { SweepOptions };

/**
 * One sweep's worth of recorded proposals, fed to a tracker the way the scanner feeds it.
 *
 * The limit is set exactly as `Scanner.setLimit` sets it, headroom included, because the limit is what
 * stops a misdetecting pass flooding the sheet and a harness that left it out would be measuring a
 * tracker the app does not run.
 */
export function replay(
	passes: { x: number; y: number; area: number; face: number }[][],
	expected: number,
	options: SweepOptions = {}
): {
	arrows: Impact[];
	scored: Impact[];
	shownEver: { x: number; y: number; pass: number }[];
	timeline: { pass: number; confirmed: { x: number; y: number }[] }[];
} {
	const tracker = new SweepTracker(options);
	tracker.setLimit(expected + EXTRA_ARROWS);
	tracker.expect(expected);

	const shownEver: { x: number; y: number; pass: number }[] = [];
	/** What was confirmed on each pass, so a harness can ask when a slot was taken and by what. */
	const timeline: { pass: number; confirmed: { x: number; y: number }[] }[] = [];
	passes.forEach((proposals, i) => {
		const ready = tracker.push(proposals);
		for (const mark of tracker.arrows) shownEver.push({ x: mark.x, y: mark.y, pass: i + 1 });
		if (ready.length > 0) {
			timeline.push({ pass: i + 1, confirmed: ready.map((r) => ({ x: r.x, y: r.y })) });
		}
	});
	return { arrows: tracker.arrows, scored: tracker.scored, shownEver, timeline };
}
