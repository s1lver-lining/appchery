import { rgbToHsv } from './pixels';
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

	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);

	for (let i = 0; i < steps; i++) {
		const angle = (i / steps) * Math.PI * 2;
		const fx = Math.cos(angle) * radius * face.semiMajor;
		const fy = Math.sin(angle) * radius * face.semiMinor;
		const x = Math.round(face.cx + fx * cos - fy * sin);
		const y = Math.round(face.cy + fx * sin + fy * cos);
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
 * A face passes when the gold is really gold and the rings outside it follow a target pattern:
 * either the full colour face (red, then blue or black further out) or a two colour face with a
 * dark surround. An arrow shaft crossing a ring costs a few samples, hence the agreement threshold
 * rather than a demand that every point match.
 */
export function verifyRings(
	frame: Frame,
	face: FaceLocation,
	options: { gold?: number; red?: number; mid?: number; outer?: number; agreement?: number } = {}
): RingCheck {
	const minAgreement = options.agreement ?? 0.62;
	const probes = [
		probeRing(frame, face, options.gold ?? 0.13),
		probeRing(frame, face, options.red ?? 0.3),
		probeRing(frame, face, options.mid ?? 0.5),
		probeRing(frame, face, options.outer ?? 0.7)
	];
	const [gold, red, mid, outer] = probes;

	const is = (probe: RingProbe, ...colours: RingColour[]) =>
		probe.colour !== null && colours.includes(probe.colour) && probe.agreement >= minAgreement;

	if (!is(gold, 'gold')) return { ok: false, reason: 'noGold', probes };

	// The full colour face: red immediately outside the gold, then blue or black further out.
	const coloured = is(red, 'red') && (is(mid, 'blue', 'dark') || is(outer, 'blue', 'dark'));
	// A two colour face, where the gold sits straight inside a dark surround.
	const plain = is(red, 'dark') || (is(mid, 'dark') && red.colour === 'gold');

	if (!coloured && !plain) {
		// Distinguishing these two makes the hint on screen useful rather than generic.
		const anyRing = probes.slice(1).some((p) => p.colour !== null);
		return { ok: false, reason: anyRing ? 'notConcentric' : 'noRings', probes };
	}
	return { ok: true, reason: null, probes };
}
