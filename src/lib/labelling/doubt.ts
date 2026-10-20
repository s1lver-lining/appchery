import { faceFromAnchors } from '$lib/vision/face';
import { probeRing } from '$lib/vision/rings';
import { detectArrowsInStill } from '$lib/vision/still';
import type { Frame } from '$lib/vision/types';
import { atRadius, edgeOf, type Point } from './format';
import { toFace } from './fit';

/** Frames are judged at half size, which is what the still detector is given everywhere else. */
export const DOUBT_SCALE = 2;

// The middle of the 9, 8, 6 and 4 rings and the colour each should read, as `verifyRings` probes them.
const BANDS: { r: number; colour: string }[] = [
	{ r: 0.15, colour: 'gold' },
	{ r: 0.25, colour: 'red' },
	{ r: 0.45, colour: 'blue' },
	{ r: 0.65, colour: 'dark' }
];

function located(small: Frame, fit: Point[]) {
	const handles = atRadius(fit, 1, 0.8).map(([x, y]) => [x / DOUBT_SCALE, y / DOUBT_SCALE] as [number, number]);
	return faceFromAnchors(handles, 1);
}

/** How well the fit's rings read the colours they should, 0 to 1, or null for a face without coloured rings. */
export function fitAgreement(small: Frame, fit: Point[], type: string | null | undefined): number | null {
	if (type === 'field' || type === 'other') return null;
	const face = located(small, fit);
	if (!face) return 0;
	const edge = edgeOf(type);
	const bands = BANDS.filter((band) => band.r < edge);
	let total = 0;
	let counted = 0;
	for (const band of bands) {
		const probe = probeRing(small, face, band.r, 32);
		// A band mostly out of the picture says nothing either way.
		if (probe.colour === null) continue;
		counted += 1;
		if (probe.colour === band.colour) total += probe.agreement;
	}
	return counted === 0 ? null : total / counted;
}

/** What the still detector sees on this frame, in this fit's face coordinates. */
export function seenOn(small: Frame, fit: Point[]): { x: number; y: number }[] {
	const face = located(small, fit);
	if (!face) return [];
	return detectArrowsInStill(small, face, {})
		.map((a) => toFace(fit, a.imageX * DOUBT_SCALE, a.imageY * DOUBT_SCALE))
		.filter((q): q is { x: number; y: number } => q !== null && Math.hypot(q.x, q.y) < 1.1);
}

/** How many of these arrows sit on something the detector sees. */
export function arrowsSeen(arrows: { x: number; y: number }[], seen: { x: number; y: number }[]): number {
	return arrows.filter((a) => seen.some((s) => Math.hypot(a.x - s.x, a.y - s.y) < 0.05)).length;
}
