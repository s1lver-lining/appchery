import type { RingColour } from './rings';
import { faceFromAnchors, faceFromEllipse, moveAnchor, toImageCoords } from './face';
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
	let hits = 0;
	let total = 0;

	/**
	 * Bilinear, because rounding a sample to the nearest pixel quantises the fit exactly the way
	 * counting colours does: the geometry can slide most of a pixel before any sample reads anything
	 * different.
	 */
	const at = (radius: number, angle: number, colours: RingColour[]): number | null => {
		const point = toImageCoords(face, Math.cos(angle) * radius, Math.sin(angle) * radius);
		const { x, y } = point;
		if (!(x >= 0) || !(y >= 0) || x >= frame.width - 1 || y >= frame.height - 1) return null;

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

/** The coarsest and finest a step gets when following a face already found, in face radii. */
const FOLLOW_START = 0.012;
const FOLLOW_STEP = 0.0015;

/**
 * Fits by moving the four points that describe the face, one at a time, with a shrinking step.
 *
 * The four move in the picture, where nothing about them is ambiguous. Describing the same face as a
 * centre, two axes, an angle and a lean has a case it cannot handle: seen square on the axes are equal
 * and the angle means nothing at all, so a pixel of noise sends it anywhere and the overlay lurches as
 * the archer turns the phone. It also cannot be walked downhill one number at a time, because a lean
 * and a centre are the same error twice and moving either alone always scores worse.
 *
 * A point has neither problem. Every one of the eight numbers moves the face somewhere it can be, the
 * eight together reach every view of it there is, and a small move is always a small change.
 */
/**
 * Ways to move all four points at once: where the face is, how big, which way round, how squashed.
 *
 * Tried before the points are moved singly, and that order is what keeps the fit honest. Four free
 * points can describe shapes no target face ever makes, and a greedy walk that is allowed to warp one
 * corner at a time will happily find one that scores well by accident. Moving them together can only
 * ever produce a face that could really be seen, so the fit is nearly right before it is allowed any
 * freedom to be strange, and the freedom is then only used for the little that is left: the far side
 * of a leaning boss being smaller than the near side.
 */
function together(face: FaceLocation, step: number): (FaceLocation | null)[] {
	const delta = step * face.semiMajor;
	const { cx, cy, anchors } = face;
	const shape = (move: (x: number, y: number) => [number, number]) =>
		faceFromAnchors(
			anchors.map(([x, y]) => move(x - cx, y - cy)).map(([x, y]) => [x + cx, y + cy] as [number, number]),
			face.support
		);

	const cos = Math.cos(step);
	const sin = Math.sin(step);
	return [
		shifted(face, delta, 0),
		shifted(face, -delta, 0),
		shifted(face, 0, delta),
		shifted(face, 0, -delta),
		shape((x, y) => [x * (1 + step), y * (1 + step)]),
		shape((x, y) => [x * (1 - step), y * (1 - step)]),
		shape((x, y) => [x * (1 + step), y]),
		shape((x, y) => [x * (1 - step), y]),
		shape((x, y) => [x, y * (1 + step)]),
		shape((x, y) => [x, y * (1 - step)]),
		shape((x, y) => [x * cos - y * sin, x * sin + y * cos]),
		shape((x, y) => [x * cos + y * sin, -x * sin + y * cos])
	];
}

function shifted(face: FaceLocation, dx: number, dy: number): FaceLocation | null {
	return faceFromAnchors(
		face.anchors.map(([x, y]) => [x + dx, y + dy] as [number, number]),
		face.support
	);
}

function descend(frame: Frame, start: FaceLocation, floor = 0.0075, from = 0.06): FaceLocation {
	let bestFace = start;
	let bestScore = ringAgreement(frame, start);

	const take = (candidates: (FaceLocation | null)[]) => {
		let improved = false;
		for (const candidate of candidates) {
			if (!candidate || candidate.semiMajor < 4 || candidate.semiMinor < 4) continue;
			const scored = ringAgreement(frame, candidate);
			if (scored > bestScore + 1e-4) {
				bestScore = scored;
				bestFace = candidate;
				improved = true;
			}
		}
		return improved;
	};

	for (let step = from; step >= floor; step /= 2) {
		while (take(together(bestFace, step)));

		// Then each point on its own, which is the only way the last of the perspective can be found.
		let improved = true;
		while (improved) {
			improved = false;
			const delta = step * bestFace.semiMajor;
			for (let corner = 0; corner < 4; corner++) {
				improved =
					take([
						moveAnchor(bestFace, corner, delta, 0),
						moveAnchor(bestFace, corner, -delta, 0),
						moveAnchor(bestFace, corner, 0, delta),
						moveAnchor(bestFace, corner, 0, -delta)
					]) || improved;
			}
		}
	}

	return { ...bestFace, support: bestScore };
}

/**
 * Fits a face, from the gold blob's own shape and from a circle of the same area.
 *
 * The blob's moments are the better start when the gold is whole. When an arrow splits it, they are
 * badly wrong: the largest surviving piece is a crescent, and its moments give an ellipse stretched
 * and rotated along the shaft. Local descent cannot walk back from an error like that, but it does
 * not have to, because a face photographed anywhere near square on is close to a circle. Trying both
 * and keeping the better fit costs one extra descent and rescues the case entirely.
 *
 * Following a face already found needs neither, and needs a finer step: a camera panning slowly moves
 * the face less than a pixel between frames, and a floor of a pixel cannot express that, so the fit
 * sat still and then jumped. It starts from last frame's answer, so the finer steps cost few rounds.
 */
export function refineFace(frame: Frame, start: FaceLocation, thorough = true): FaceLocation {
	// Starting fine as well as ending fine: a frame's worth of camera movement is small, and the coarse
	// rounds a search needs are pure cost when the answer is already almost right.
	if (!thorough) return descend(frame, start, FOLLOW_STEP, FOLLOW_START);

	const fitted = descend(frame, start);

	/**
	 * Also from a circle of the same area, always rather than only when the gold looks lopsided. The
	 * blob's moments are the better start when the gold is whole; when an arrow splits it they give an
	 * ellipse stretched along the shaft, and four points let a bad start settle somewhere worse than an
	 * ellipse ever could. One extra fit costs little beside a whole detection pass.
	 */
	const radius = Math.sqrt(start.semiMajor * start.semiMinor);
	const round = faceFromEllipse(start.cx, start.cy, radius, radius, 0, start.support);
	if (!round) return fitted;
	const second = descend(frame, round);
	return second.support > fitted.support ? second : fitted;
}
