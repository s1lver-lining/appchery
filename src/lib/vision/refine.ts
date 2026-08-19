import type { RingColour } from './rings';
import { linearPart } from './face';
import { rgbToHsv } from './pixels';
import type { Frame, FaceLocation } from './types';

/**
 * Refines a face by fitting it to the whole ring structure, not just the gold.
 *
 * The gold blob alone is fragile: arrows standing in the ten split it into pieces, and torn paper
 * eats its edge, so its centroid and area both drift. Overlaying the detected geometry on real
 * photographs made this obvious in a way the aggregate numbers did not, because a face can be
 * "within 15% of the true size" and still visibly off centre.
 *
 * A target face is far more than its gold though. It is a known sequence of coloured annuli, so the
 * fit can be scored directly against that: sample many rings, count how many samples show the
 * colour the geometry predicts, and move the estimate to maximise it. A few arrows only cost a few
 * samples, which is what makes this robust where a blob measurement is not.
 *
 * Sampling ring interiors alone is not enough to pin the geometry down. A ring is a tenth of the
 * radius wide, so a fit can be out by nearly half a ring and still land every sample in the right
 * colour, and the error is free to grow with radius: the gold sits perfectly while the blue and the
 * black creep outwards. What actually fixes a circle in place is its edges, so every ring boundary is
 * also checked, by sampling just inside and just outside it and asking for both colours at once.
 */

/**
 * Sample radii and the colour a face shows there. Mid ring, never on a boundary.
 *
 * Two layouts, scored separately. A full face runs all ten rings out to the white; a three spot is
 * printed only down to the 6 ring, so everything past r = 0.5 is backing paper. Scoring a three spot
 * against the full layout dragged the fit inward by about 9%, trying to move the expected white
 * onto the real white, so the fit takes whichever layout agrees better.
 */
interface Layout {
	bands: { radius: number; colours: RingColour[] }[];
	/** Ring boundaries, by the radius the change happens at and the colour on each side of it. */
	edges: { radius: number; inner: RingColour[]; outer: RingColour[] }[];
}

const FULL_BANDS: { radius: number; colours: RingColour[] }[] = [
	{ radius: 0.15, colours: ['gold'] },
	{ radius: 0.25, colours: ['red'] },
	{ radius: 0.35, colours: ['red'] },
	{ radius: 0.45, colours: ['blue'] },
	{ radius: 0.55, colours: ['blue'] },
	{ radius: 0.65, colours: ['dark'] },
	{ radius: 0.75, colours: ['dark'] },
	{ radius: 0.85, colours: ['light'] }
];

/**
 * A three spot: printed to the 6 ring, so the blue is the outermost colour and the paper takes over
 * beyond it. The band at 0.55 is what pins the scale. Without it the model only constrained the
 * inner rings, and a fit a seventh too large still scored perfectly, because every sample it took
 * still landed in the right colour.
 */
const SPOT_BANDS: { radius: number; colours: RingColour[] }[] = [
	{ radius: 0.15, colours: ['gold'] },
	{ radius: 0.25, colours: ['red'] },
	{ radius: 0.35, colours: ['red'] },
	{ radius: 0.45, colours: ['blue'] },
	// Brackets the edge of the printed spot at r = 0.5 from both sides, which is what fixes the
	// scale. A single band outside it left about 7% of slack, and the fit settled at the small end.
	{ radius: 0.48, colours: ['blue'] },
	{ radius: 0.54, colours: ['light', 'grey'] },
	{ radius: 0.7, colours: ['light', 'grey'] }
];

/**
 * How far either side of a boundary to sample. Wide enough to clear the printed line and the blur of
 * a phone camera, narrow enough that being half a ring out fails the check rather than passing it.
 */
const EDGE_OFFSET = 0.035;

const FULL_FACE: Layout = {
	bands: FULL_BANDS,
	edges: [
		{ radius: 0.2, inner: ['gold'], outer: ['red'] },
		{ radius: 0.4, inner: ['red'], outer: ['blue'] },
		{ radius: 0.6, inner: ['blue'], outer: ['dark'] },
		{ radius: 0.8, inner: ['dark'], outer: ['light'] }
	]
};

const THREE_SPOT: Layout = {
	bands: SPOT_BANDS,
	edges: [
		{ radius: 0.2, inner: ['gold'], outer: ['red'] },
		{ radius: 0.4, inner: ['red'], outer: ['blue'] },
		{ radius: 0.5, inner: ['blue'], outer: ['light', 'grey'] }
	]
};

const ANGLES = 24;

/**
 * Boundaries count for more than interiors because they are what actually locate the face. Scored
 * with interiors alone the fit drifts outwards; this is the weight that stops it.
 */
const EDGE_WEIGHT = 3;

/**
 * How wide the soft edge of a colour decision is, in the units each test uses.
 *
 * The fit is found by walking downhill, so the thing being walked on has to have a slope. Counting
 * samples that land in the right colour does not: a move smaller than the blur between two rings
 * flips no sample at all, the score comes back identical, and the descent concludes it is already at
 * the best place it can reach. That deadband is about a ring wide, which is why the overlay used to
 * sit still for a third of a second and then jump. Scoring each sample by how well it matches instead
 * of whether it matches gives every small move somewhere to go.
 */
const VALUE_SOFT = 25;
const SATURATION_SOFT = 0.12;
const HUE_SOFT = 14;

/** Rises from 0 to 1 across a band of width `soft` centred on `edge`. */
function ramp(value: number, edge: number, soft: number): number {
	return Math.min(1, Math.max(0, (value - edge) / soft + 0.5));
}

/** How far into a hue window a hue sits, softly, measured the short way round the circle. */
function inHue(h: number, low: number, high: number): number {
	const centre = (low + high) / 2;
	const half = (high - low) / 2;
	const away = Math.abs(((h - centre + 540) % 360) - 180);
	return 1 - ramp(away, half, HUE_SOFT);
}

/** How much a pixel looks like one target colour, from 0 to 1, with no hard decision anywhere. */
function affinity(r: number, g: number, b: number, colour: RingColour): number {
	const { h, s, v } = rgbToHsv(r, g, b);
	const bright = ramp(v, 70, VALUE_SOFT);
	const colourful = ramp(s, 0.22, SATURATION_SOFT);

	switch (colour) {
		case 'dark':
			return 1 - bright;
		case 'light':
			return bright * (1 - colourful) * ramp(v, 150, VALUE_SOFT);
		case 'grey':
			return bright * (1 - colourful) * (1 - ramp(v, 150, VALUE_SOFT));
		case 'gold':
			return bright * colourful * inHue(h, 35, 75);
		case 'red':
			return bright * colourful * inHue(h, -30, 20);
		case 'blue':
			return bright * colourful * inHue(h, 170, 260);
		default:
			return 0;
	}
}

/** The best match among the colours a ring is allowed to show. */
function best(r: number, g: number, b: number, colours: RingColour[]): number {
	let most = 0;
	for (const colour of colours) most = Math.max(most, affinity(r, g, b, colour));
	return most;
}

function score(frame: Frame, face: FaceLocation, layout: Layout): number {
	const { a: m00, b: m01, d: m10, e: m11 } = linearPart(face);
	let hits = 0;
	let total = 0;

	/**
	 * Bilinear, because rounding a sample to the nearest pixel quantises the fit exactly the way
	 * counting colours does: the geometry can slide most of a pixel before any sample reads anything
	 * different.
	 */
	const at = (radius: number, angle: number, colours: RingColour[]): number | null => {
		const ux = Math.cos(angle) * radius;
		const uy = Math.sin(angle) * radius;
		// The far side of a leaning face is smaller, which is what an ellipse alone cannot express.
		const depth = 1 + (face.perspectiveX ?? 0) * ux + (face.perspectiveY ?? 0) * uy;
		if (Math.abs(depth) < 1e-6) return null;
		const x = face.cx + (m00 * ux + m01 * uy) / depth;
		const y = face.cy + (m10 * ux + m11 * uy) / depth;
		if (x < 0 || y < 0 || x >= frame.width - 1 || y >= frame.height - 1) return null;

		const x0 = Math.floor(x);
		const y0 = Math.floor(y);
		const ax = x - x0;
		const ay = y - y0;
		let r = 0;
		let g = 0;
		let b = 0;
		for (let j = 0; j <= 1; j++) {
			for (let i = 0; i <= 1; i++) {
				const weight = (i ? ax : 1 - ax) * (j ? ay : 1 - ay);
				const p = ((y0 + j) * frame.width + (x0 + i)) * 4;
				r += frame.data[p] * weight;
				g += frame.data[p + 1] * weight;
				b += frame.data[p + 2] * weight;
			}
		}
		return best(r, g, b, colours);
	};

	for (let i = 0; i < ANGLES; i++) {
		const angle = (i / ANGLES) * Math.PI * 2;

		for (const band of layout.bands) {
			const match = at(band.radius, angle, band.colours);
			if (match === null) continue;
			total += 1;
			hits += match;
		}

		for (const edge of layout.edges) {
			const inside = at(edge.radius - EDGE_OFFSET, angle, edge.inner);
			const outside = at(edge.radius + EDGE_OFFSET, angle, edge.outer);
			if (inside === null || outside === null) continue;
			total += EDGE_WEIGHT;
			// Both sides at once: either alone is satisfied by a fit that has slid a whole ring over.
			hits += EDGE_WEIGHT * inside * outside;
		}
	}

	return total === 0 ? 0 : hits / total;
}

/**
 * Share of sampled points whose colour matches the ring the geometry puts them in, under whichever
 * face layout fits better. Samples off the frame are not counted either way, so a face running off
 * the edge is judged on what is visible.
 */
export function ringAgreement(frame: Frame, face: FaceLocation): number {
	return Math.max(score(frame, face, FULL_FACE), score(frame, face, THREE_SPOT));
}

/**
 * Coordinate descent over centre, axes and tilt, with a shrinking step. Deliberately local: the
 * estimate from the gold blob is usually close, and a global search would cost far more than a video
 * frame can afford.
 */
/**
 * How much better the ring agreement must get before a lean is believed.
 *
 * Perspective is only there to be measured when the camera is close enough for near and far rings to
 * differ in scale. A face across the range is very nearly an orthographic projection, and asking for
 * two more numbers from it does not find a lean that is not there: it finds whichever lean best
 * absorbs the noise, and drags the centre off by more than any real perspective would have.
 *
 * Face size looks like the way to tell those apart and is not: measured against faces fitted by hand,
 * a size threshold loose enough to help an archer walking up to a boss was also loose enough to hurt
 * a three spot across a hall. So the fit is done twice, flat and leaning, and the lean is kept only
 * when it pays for itself. Noise buys very little agreement; a boss genuinely leaning back buys a lot.
 */
const LEAN_MUST_EARN = 0.01;

/**
 * How well the flat fit must already explain the paper for the lean search to be skipped.
 *
 * Face size is the obvious way to decide and does not work: a three spot across a hall fills as much
 * of the frame as a boss up close. What does separate them is how well a face with no lean in it
 * explains what is there. A three spot photographed square on is explained almost perfectly, and
 * searching for a lean it does not have finds one fitted to noise. A boss leaning back cannot be
 * explained flat at all, and that shortfall is the signal worth spending eight extra fits on.
 */
const LEAN_WORTH_TRYING = 0.9;

/**
 * How much of the frame the face must fill as well. Neither test is enough alone: a three spot across
 * a hall can fill the frame, and a face can fit poorly for reasons that have nothing to do with lean.
 * Perspective needs the camera close, so a small face with a mediocre fit has some other problem and
 * eight more fits will not find it.
 */
const LEAN_NEEDS_SIZE = 0.25;

function judge(frame: Frame, face: FaceLocation): number {
	return ringAgreement(frame, face);
}

function descend(frame: Frame, start: FaceLocation, lean = false, from = 0.06): FaceLocation {
	let best = start;
	let bestScore = judge(frame, start);

	// Steps as a share of the face radius, halving each round.
	for (let step = from; step >= 0.0075; step /= 2) {
		let improved = true;
		while (improved) {
			improved = false;
			const delta = step * best.semiMajor;

			const candidates: FaceLocation[] = [
				{ ...best, cx: best.cx + delta },
				{ ...best, cx: best.cx - delta },
				{ ...best, cy: best.cy + delta },
				{ ...best, cy: best.cy - delta },
				// Scale both axes together, then each alone, so a tilted face can still square up.
				{
					...best,
					semiMajor: best.semiMajor * (1 + step),
					semiMinor: best.semiMinor * (1 + step)
				},
				{
					...best,
					semiMajor: best.semiMajor * (1 - step),
					semiMinor: best.semiMinor * (1 - step)
				},
				{ ...best, semiMajor: best.semiMajor * (1 + step) },
				{ ...best, semiMajor: best.semiMajor * (1 - step) },
				{ ...best, semiMinor: best.semiMinor * (1 + step) },
				{ ...best, semiMinor: best.semiMinor * (1 - step) }
			];

			if (lean) {
				/**
				 * How far the face leans. Two more numbers turn the fit from an ellipse into a full
				 * projection, which is what a boss on its stand actually presents to an archer standing
				 * close to it. Without them the fit is not merely imprecise, it is biased: the centre
				 * settles towards the far side of the face and every arrow is read a little off centre
				 * in the same direction.
				 */
				candidates.push(
					{ ...best, perspectiveX: (best.perspectiveX ?? 0) + step / 2 },
					{ ...best, perspectiveX: (best.perspectiveX ?? 0) - step / 2 },
					{ ...best, perspectiveY: (best.perspectiveY ?? 0) + step / 2 },
					{ ...best, perspectiveY: (best.perspectiveY ?? 0) - step / 2 },
				);
			}

			for (const candidate of candidates) {
				if (candidate.semiMinor < 4 || candidate.semiMajor < 4) continue;
				/**
				 * A lean this far is not a boss on a stand, and letting it go further opens a hole in the
				 * fit: a strong lean shrinks the far side, so a face half again too big can still land its
				 * samples on the right colours. That reads as a confident fit at the wrong scale.
				 */
				if (Math.hypot(candidate.perspectiveX ?? 0, candidate.perspectiveY ?? 0) > 0.35) continue;
				const score = judge(frame, candidate);
				if (score > bestScore + 1e-4) {
					bestScore = score;
					best = candidate;
					improved = true;
				}
			}
		}
	}

	return { ...best, support: bestScore };
}

/** Leans to try before fitting anything else, as a share of the face radius per radius of offset. */
const LEAN_STARTS = [-0.24, -0.12, 0, 0.12, 0.24];

/**
 * The fit, tried from several leans and kept at whichever the paper actually supports.
 *
 * Walking downhill one number at a time cannot find the lean, because the lean and the centre are the
 * same error seen twice: tilting the face about a fixed centre moves every ring at once and always
 * scores worse, so the descent puts the lean back and stays where it was. Both have to move together
 * or neither can. Starting from a handful of fixed leans and letting the centre settle under each one
 * walks across that valley instead of along it, and costs a few hundred pixel reads.
 */
function fit(frame: Frame, start: FaceLocation, thorough: boolean): FaceLocation {
	/**
	 * Following a face already found needs none of this. The lean it is carrying was searched for when
	 * it was acquired and the camera has moved a frame's worth since, so polishing every number together
	 * from where they already are is both quicker and better than starting the hunt again.
	 */
	if (!thorough) return descend(frame, start, true, 0.03);

	const flat = descend(frame, { ...start, perspectiveX: 0, perspectiveY: 0 }, false);
	/**
	 * Skipped when a flat face already explains the paper. Searching for a lean that is not there costs
	 * eight extra fits and buys one fitted to noise, which on 938 annotated three spots multiplied the
	 * false faces by six and made the centre worse.
	 */
	if (flat.support > LEAN_WORTH_TRYING || flat.semiMajor < frame.width * LEAN_NEEDS_SIZE) return flat;
	let best = flat;

	for (const perspectiveX of LEAN_STARTS) {
		for (const perspectiveY of LEAN_STARTS) {
			if (perspectiveX === 0 && perspectiveY === 0) continue;
			/**
			 * Centre and size only: the lean is being proposed, not searched, so it is held still here.
			 * The steps start fine because the flat fit is already close, and the probe only has to say
			 * whether this lean suits the paper better, not find the whole face again.
			 */
			const settled = descend(frame, { ...flat, perspectiveX, perspectiveY }, false, 0.03);
			if (settled.support > best.support) best = settled;
		}
	}

	if (best === flat) return flat;
	// Now that both are roughly right they can be polished together without falling back down the valley.
	const polished = descend(frame, best, true);
	return polished.support > flat.support + LEAN_MUST_EARN ? polished : flat;
}

/**
 * Fits a face, from the gold blob's own shape and from a circle of the same area.
 *
 * The blob's moments are the better start when the gold is whole. When an arrow splits it, they are
 * badly wrong: the largest surviving piece is a crescent, and its moments give an ellipse stretched
 * and rotated along the shaft. Local descent cannot walk back from an error like that, but it does
 * not have to, because a face photographed anywhere near square on is close to a circle. Trying both
 * and keeping the better fit costs one extra descent and rescues the case entirely.
 */
export function refineFace(frame: Frame, start: FaceLocation, thorough = true): FaceLocation {
	const fitted = fit(frame, start, thorough);
	const lopsided = Math.abs(start.semiMajor - start.semiMinor) / Math.max(start.semiMajor, 1);
	if (!thorough || lopsided < 0.08) return fitted;

	const radius = Math.sqrt(start.semiMajor * start.semiMinor);
	const round = fit(frame, { ...start, semiMajor: radius, semiMinor: radius, rotation: 0 }, true);
	return round.support > fitted.support ? round : fitted;
}
