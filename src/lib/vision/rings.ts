import { rgbToHsv } from './pixels';
import { toImageCoords } from './face';
import type { Frame, FaceLocation } from './types';

/**
 * Confirms that a gold blob is actually a target face, by checking what surrounds it.
 *
 * Finding yellow is not enough: a bag, a jacket, a hazard sign or a patch of sunlit grass all
 * produce a large saturated yellow region, and a false face means every blob on it is reported as
 * an arrow. A WA face is yellow *inside a specific sequence of coloured rings*, and that sequence
 * is what nothing else in a field shares.
 */

export type RingColour = 'gold' | 'red' | 'blue' | 'dark' | 'grey' | 'light' | 'other';

export function classify(r: number, g: number, b: number): RingColour {
	const { h, s, v } = rgbToHsv(r, g, b);

	/**
	 * Value first: black and white rings carry no usable hue. Mid grey is kept separate from black,
	 * because a grey wall or an overcast sky otherwise reads as the dark surround of a face and lets
	 * any yellow object through.
	 */
	if (v < 70) return 'dark';
	if (s < 0.22) return v > 150 ? 'light' : 'grey';

	if (h >= 35 && h <= 75) return 'gold';
	if (h < 20 || h >= 330) return 'red';
	if (h >= 170 && h <= 260) return 'blue';
	return 'other';
}

export interface RingProbe {
	radius: number;
	/** Colour most of the ring showed, or null when too little of it was inside the frame. */
	colour: RingColour | null;
	/** Share of sampled points that agreed, which is what a partly occluded ring loses. */
	agreement: number;
	samples: number;
}

/** Samples a circle in face coordinates, skipping points that fall outside the image. */
export function probeRing(
	frame: Frame,
	face: FaceLocation,
	radius: number,
	steps = 32
): RingProbe {
	const counts = new Map<RingColour, number>();
	let samples = 0;

	for (let i = 0; i < steps; i++) {
		const angle = (i / steps) * Math.PI * 2;
		/**
		 * Through the face's own projection, lean included. Sampling this circle as though the face were
		 * flat probes the wrong pixels on one that is not, so the better the fit describes a leaning
		 * boss the worse it does on the check that is supposed to confirm it.
		 */
		const point = toImageCoords(face, Math.cos(angle) * radius, Math.sin(angle) * radius);
		const x = Math.round(point.x);
		const y = Math.round(point.y);
		if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;

		const p = (y * frame.width + x) * 4;
		const colour = classify(frame.data[p], frame.data[p + 1], frame.data[p + 2]);
		counts.set(colour, (counts.get(colour) ?? 0) + 1);
		samples += 1;
	}

	// Too little of the ring in frame to conclude anything: reported as unknown, not as a failure.
	if (samples < steps / 4) return { radius, colour: null, agreement: 0, samples };

	let best: RingColour = 'other';
	let bestCount = 0;
	for (const [colour, count] of counts) {
		if (count > bestCount) {
			bestCount = count;
			best = colour;
		}
	}
	return { radius, colour: best, agreement: bestCount / samples, samples };
}

export interface RingCheck {
	ok: boolean;
	/** Why it failed, for the on screen hint rather than for logs. */
	reason: 'noGold' | 'noRings' | 'notConcentric' | null;
	probes: RingProbe[];
}

/**
 * Probes sit in the *middle* of a ring, never on a boundary. Ring N ends at r = (11 - N)/10, so 0.15
 * is inside the 9, 0.25 inside the 8, 0.45 inside the 6 and 0.65 inside the 4. This matters most on
 * a three spot, whose paper stops at the 6 ring: a probe at 0.5 straddled the edge of the spot and
 * sampled half blue, half backing paper, which failed nearly half of them.
 *
 * A face passes when the gold is really gold and the rings outside it follow a target pattern:
 * either the full colour face (red, then blue or black further out) or a two colour face with a
 * dark surround. An arrow shaft crossing a ring costs a few samples, hence the agreement threshold
 * rather than a demand that every point match.
 */
/**
 * How much of a field face's rings have to agree, which is less than a coloured face's.
 *
 * A field face is black rings separated by thin white lines, so a circle drawn at any one radius
 * crosses both and no radius reads as one colour the way a broad red or blue band does. The arrows
 * take their share too: they stand in the middle and cross every ring on their way out, and a field
 * boss is shot at close range where they are thick in the picture. Measured across nineteen frames
 * of one, the rings agreed between 0.44 and 0.91 where a coloured face agrees above 0.95.
 */
const FIELD_AGREEMENT = 0.45;

export function verifyRings(
	frame: Frame,
	face: FaceLocation,
	options: {
		gold?: number;
		red?: number;
		mid?: number;
		outer?: number;
		surround?: number;
		agreement?: number;
	} = {}
): RingCheck {
	/**
	 * Measured. This was 0.55 when the fit was scored on ring interiors alone. Scoring boundaries as
	 * well lands fits more squarely on the rings, which lifts every agreement figure including those of
	 * the near misses, so the bar has to rise with them or the extra accuracy is spent on false faces.
	 */
	const minAgreement = options.agreement ?? 0.7;
	const probes = [
		probeRing(frame, face, options.gold ?? 0.15),
		probeRing(frame, face, options.red ?? 0.25),
		probeRing(frame, face, options.mid ?? 0.45),
		probeRing(frame, face, options.outer ?? 0.65),
		// Outside the printed face altogether, which is what says the rings stop somewhere.
		probeRing(frame, face, options.surround ?? 1.25)
	];
	const [gold, red, mid, outer, surround] = probes;

	const is = (probe: RingProbe, ...colours: RingColour[]) =>
		probe.colour !== null && colours.includes(probe.colour) && probe.agreement >= minAgreement;

	if (!is(gold, 'gold')) return { ok: false, reason: 'noGold', probes };

	// The full colour face: red immediately outside the gold, then blue or black further out.
	const coloured = is(red, 'red') && (is(mid, 'blue', 'dark') || is(outer, 'blue', 'dark'));
	// A two colour face, where the gold sits straight inside a dark surround.
	const plain = is(red, 'dark') || (is(mid, 'dark') && red.colour === 'gold');

	/*
	 * A field face: a small gold and nothing but black rings out to the paper.
	 *
	 * Printed black comes back mid grey in anything short of full light, and grey is the reading a
	 * wall gives too, so the rings alone cannot say this is a face. What says it is that they stop.
	 * A boss has an edge and a wall does not: outside the printed face is white paper, or the butt,
	 * or the grass, and none of them is more of the same ring. Without that test this would accept
	 * every yellow bag hung on a grey wall, which is the thing the grey reading exists to refuse.
	 */
	const band = (probe: RingProbe) =>
		(probe.colour === 'dark' || probe.colour === 'grey') && probe.agreement >= FIELD_AGREEMENT;
	const edged =
		surround.colour !== null &&
		surround.colour !== 'dark' &&
		surround.colour !== 'grey' &&
		surround.agreement >= 0.5;
	const field = gold.agreement >= 0.8 && band(red) && band(mid) && band(outer) && edged;

	if (!coloured && !plain && !field) {
		// Distinguishing these two makes the hint on screen useful rather than generic.
		const anyRing = probes.slice(1).some((p) => p.colour !== null);
		return { ok: false, reason: anyRing ? 'notConcentric' : 'noRings', probes };
	}
	return { ok: true, reason: null, probes };
}
