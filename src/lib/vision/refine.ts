import type { RingColour } from './rings';
import { alignFace, faceFromAnchors, faceFromEllipse, moveAnchor, pinFace } from './face';
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
 * also read, both for the colours on either side of it and for the colour change across it.
 */

/**
 * One printed layout: the colours it shows, where it changes between them, and how.
 *
 * Two of them, scored separately. A full face runs all ten rings out to the white; a three spot is
 * printed only down to the 6 ring, so everything past r = 0.5 is backing paper. Scoring a three spot
 * against the full layout dragged the fit inward by about 9%, trying to move the expected white
 * onto the real white, so the fit takes whichever layout agrees better.
 */
interface Layout {
	/** Sample radii and the colour a face shows there. Mid ring, never on a boundary. */
	bands: { radius: number; colours: RingColour[] }[];
	/** Ring boundaries, by the radius the change happens at and the colour on each side of it. */
	edges: { radius: number; inner: RingColour[]; outer: RingColour[] }[];
	/** The same boundaries again, by the move in colour crossing them makes. */
	steps: { radius: number; from: [number, number, number]; to: [number, number, number] }[];
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

/**
 * The move in colour each boundary makes, in RGB.
 *
 * Gold gives way to red, red to blue, blue to black, black to white, and each of those is a
 * particular direction that nothing else on a boss makes in the same place.
 */
const FULL_STEPS: Layout['steps'] = [
	{ radius: 0.2, from: [252, 209, 42], to: [232, 69, 60] },
	{ radius: 0.4, from: [232, 69, 60], to: [58, 160, 216] },
	{ radius: 0.6, from: [58, 160, 216], to: [35, 40, 44] },
	{ radius: 0.8, from: [35, 40, 44], to: [244, 241, 234] }
];

const SPOT_STEPS: Layout['steps'] = FULL_STEPS.slice(0, 2).concat([
	{ radius: 0.5, from: [58, 160, 216], to: [244, 241, 234] }
]);

const FULL_FACE: Layout = {
	bands: FULL_BANDS,
	edges: [
		{ radius: 0.2, inner: ['gold'], outer: ['red'] },
		{ radius: 0.4, inner: ['red'], outer: ['blue'] },
		{ radius: 0.6, inner: ['blue'], outer: ['dark'] },
		{ radius: 0.8, inner: ['dark'], outer: ['light'] }
	],
	steps: FULL_STEPS
};

const THREE_SPOT: Layout = {
	bands: SPOT_BANDS,
	edges: [
		{ radius: 0.2, inner: ['gold'], outer: ['red'] },
		{ radius: 0.4, inner: ['red'], outer: ['blue'] },
		{ radius: 0.5, inner: ['blue'], outer: ['light', 'grey'] }
	],
	steps: SPOT_STEPS
};

const LAYOUTS = [FULL_FACE, THREE_SPOT];

const ANGLES = 24;

/**
 * How many of the directions to actually read when following a face rather than searching for one.
 *
 * Every other one. All of them are needed to decide whether a thing is a target face at all, where a
 * few arrows and a shadow have to be outvoted. Following asks a much easier question: the face was
 * accepted a moment ago and the fit is already nearly right, so half the readings point the same way
 * the other half would, and following is where nearly all the time goes.
 */
const FOLLOW_STRIDE = 2;

/** The sampling directions, worked out once. Recomputing them per sample was a tenth of the fit. */
const COS = Array.from({ length: ANGLES }, (_, i) => Math.cos((i / ANGLES) * Math.PI * 2));
const SIN = Array.from({ length: ANGLES }, (_, i) => Math.sin((i / ANGLES) * Math.PI * 2));

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

/** How much a colour, already in HSV, looks like one ring colour, from 0 to 1. */
function affinity(h: number, s: number, v: number, colour: RingColour): number {
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

/**
 * Colour at a point in the picture, bilinearly, left in `red`/`green`/`blue`.
 *
 * Returning a triple would be the obvious shape, but this is called some hundreds of thousands of
 * times a second and every one of those would be an object the collector has to take back.
 */
let red = 0;
let green = 0;
let blue = 0;

function sample(frame: Frame, x: number, y: number): boolean {
	if (!(x >= 0) || !(y >= 0) || x >= frame.width - 1 || y >= frame.height - 1) return false;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const ax = x - x0;
	const ay = y - y0;
	const data = frame.data;
	const top = (y0 * frame.width + x0) * 4;
	const bottom = top + frame.width * 4;
	const w00 = (1 - ax) * (1 - ay);
	const w10 = ax * (1 - ay);
	const w01 = (1 - ax) * ay;
	const w11 = ax * ay;
	red = data[top] * w00 + data[top + 4] * w10 + data[bottom] * w01 + data[bottom + 4] * w11;
	green = data[top + 1] * w00 + data[top + 5] * w10 + data[bottom + 1] * w01 + data[bottom + 5] * w11;
	blue = data[top + 2] * w00 + data[top + 6] * w10 + data[bottom + 2] * w01 + data[bottom + 6] * w11;
	return true;
}

/**
 * Reads a point of the face straight through the projection.
 *
 * The same thing `toImageCoords` does, written out because it is the innermost line of the whole
 * detector and the point it returns would otherwise be allocated and discarded a million times a
 * frame.
 */
function readFace(frame: Frame, h: number[], x: number, y: number): boolean {
	const w = h[6] * x + h[7] * y + 1;
	return sample(frame, (h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w);
}

/** The best match among the colours a ring is allowed to show. */
function best(colours: RingColour[]): number {
	const { h, s, v } = rgbToHsv(red, green, blue);
	let most = 0;
	for (const colour of colours) most = Math.max(most, affinity(h, s, v, colour));
	return most;
}

/** How well the colours the geometry predicts are the colours that are there. */
function colours(frame: Frame, face: FaceLocation, layout: Layout, stride: number): number {
	const h = face.transform;
	let hits = 0;
	let total = 0;

	for (let i = 0; i < ANGLES; i += stride) {
		const cos = COS[i];
		const sin = SIN[i];

		for (const band of layout.bands) {
			if (!readFace(frame, h, cos * band.radius, sin * band.radius)) continue;
			total += 1;
			hits += best(band.colours);
		}

		for (const edge of layout.edges) {
			const near = edge.radius - EDGE_OFFSET;
			const far = edge.radius + EDGE_OFFSET;
			if (!readFace(frame, h, cos * near, sin * near)) continue;
			const inside = best(edge.inner);
			if (!readFace(frame, h, cos * far, sin * far)) continue;
			const outside = best(edge.outer);
			total += EDGE_WEIGHT;
			// Both sides at once: either alone is satisfied by a fit that has slid a whole ring over.
			hits += EDGE_WEIGHT * inside * outside;
		}
	}

	return total === 0 ? 0 : hits / total;
}

/**
 * How narrow a band to read the colour change across.
 *
 * Narrow on purpose. Asking whether the colour is right on each side of a boundary is a question with
 * a flat answer: the fit can sit a good fraction of a ring out and every sample still lands well
 * inside the correct colour, so there is nothing telling it which way to move. Reading the change
 * across a band barely wider than the printed line asks a sharper question instead, one that is only
 * answered well when the boundary is where the geometry says it is.
 */
const EDGE_BAND = 0.012;

/**
 * How well the geometry's ring boundaries sit on the real ones.
 *
 * Each boundary is read just inside and just outside, and what is measured is the colour *change*
 * across it, in the direction the printed face changes there. An arrow crossing the ring, a torn edge
 * or a patch of shade moves the colour some other way and simply scores nothing, rather than scoring
 * against.
 */
function steps(frame: Frame, face: FaceLocation, layout: Layout, stride: number): number {
	const h = face.transform;
	let hits = 0;
	let total = 0;

	/**
	 * Never narrower than a pixel or so. The band is set as a share of the face so it stays a fraction
	 * of a ring whatever the size, but on a face across a hall that fraction is less than a pixel, both
	 * reads land on the same pixel and the change measures nothing at all.
	 */
	const band = Math.max(EDGE_BAND, 1.2 / Math.max(face.semiMajor, 1));

	for (const edge of layout.steps) {
		const dr = edge.to[0] - edge.from[0];
		const dg = edge.to[1] - edge.from[1];
		const db = edge.to[2] - edge.from[2];
		const size = Math.hypot(dr, dg, db);
		if (size < 1e-6) continue;
		const near = edge.radius - band;
		const far = edge.radius + band;

		for (let i = 0; i < ANGLES; i += stride) {
			const cos = COS[i];
			const sin = SIN[i];
			if (!readFace(frame, h, cos * near, sin * near)) continue;
			const ir = red;
			const ig = green;
			const ib = blue;
			if (!readFace(frame, h, cos * far, sin * far)) continue;

			total += 1;
			// How much of the change across the band is the change this boundary should show.
			const along = ((red - ir) * dr + (green - ig) * dg + (blue - ib) * db) / size;
			hits += Math.min(1, Math.max(0, along / size));
		}
	}

	return total === 0 ? 0 : hits / total;
}

/** How much the boundaries count against the colours. */
const STEP_WEIGHT = 1.0;

/**
 * How well one printed layout explains the face, from both the colours it predicts and the changes it
 * puts between them.
 *
 * The colours alone say what is a target face and what is a yellow bag, but they say it over a broad
 * range of geometries that are all nearly right. The changes alone are sharp enough to say exactly
 * which of those is right, and are blind to whether the thing is a face at all. Neither is enough.
 */
function agreement(frame: Frame, face: FaceLocation, layout: Layout, stride = 1): number {
	return (
		(colours(frame, face, layout, stride) + STEP_WEIGHT * steps(frame, face, layout, stride)) /
		(1 + STEP_WEIGHT)
	);
}

/** How well a geometry explains the face, under whichever of the printed layouts suits it better. */
export function ringAgreement(frame: Frame, face: FaceLocation): number {
	return Math.max(agreement(frame, face, FULL_FACE), agreement(frame, face, THREE_SPOT));
}

/**
 * Which layout a face is printed in, decided once before the descent rather than at every step.
 *
 * A boss does not turn from a full face into a three spot while the fit is settling onto it, so
 * scoring both layouts at every one of the descent's few hundred steps was doing the same work twice
 * to reach the same answer. Deciding it up front halves the cost of a detection pass.
 */
function pickLayout(frame: Frame, face: FaceLocation): Layout {
	let chosen = LAYOUTS[0];
	let most = -Infinity;
	for (const layout of LAYOUTS) {
		const scored = agreement(frame, face, layout);
		if (scored > most) {
			most = scored;
			chosen = layout;
		}
	}
	return chosen;
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

function walk(
	frame: Frame,
	start: FaceLocation,
	floor: number,
	from: number,
	layout: Layout,
	lateSingles: boolean,
	stride: number
): FaceLocation {
	let bestFace = start;
	let bestScore = agreement(frame, start, layout, stride);
	const spot = layout === THREE_SPOT;

	const take = (candidates: (FaceLocation | null)[]) => {
		let improved = false;
		for (const candidate of candidates) {
			if (!candidate || candidate.semiMajor < 4 || candidate.semiMinor < 4) continue;
			const scored = agreement(frame, candidate, layout, stride);
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

		/**
		 * Then each point on its own, which is the only way the last of the perspective can be found.
		 *
		 * A search needs this at every step, because a seed can be the wrong shape as well as in the
		 * wrong place. Following does not: last frame's answer already has the right shape, so the
		 * coarse single point moves only ever warp the face into something no camera makes, and every
		 * one of them has to be scored to be rejected. That was most of the cost of following.
		 */
		let improved = !lateSingles || step <= floor * 1.5;
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

	return { ...bestFace, support: bestScore, spot };
}

/**
 * Walks downhill under one layout, and only reconsiders the layout once it has arrived.
 *
 * Which layout is showing cannot be read reliably off the seed, where the geometry is still a ring or
 * two out and a three spot can score as a full face. It can be read off the finished fit. So the
 * descent commits to the better of the two at the start and, if the fit it reaches disagrees, runs
 * again from there under the other one. That is the accuracy of scoring both at every step, at close
 * to the cost of scoring one, because the second walk starts from an answer and almost never happens.
 */
function descend(frame: Frame, start: FaceLocation, floor = 0.0075, from = 0.06, known?: Layout): FaceLocation {
	const layout = known ?? pickLayout(frame, start);
	const following = known !== undefined;
	const stride = following ? FOLLOW_STRIDE : 1;
	const fitted = walk(frame, start, floor, from, layout, following, stride);

	if (known) return fitted;

	const other = layout === FULL_FACE ? THREE_SPOT : FULL_FACE;
	if (agreement(frame, fitted, other) <= fitted.support) return fitted;

	const again = walk(frame, fitted, floor, from, other, following, stride);
	return again.support > fitted.support ? again : fitted;
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
export function refineFace(
	frame: Frame,
	start: FaceLocation,
	thorough = true,
	/**
	 * Which way is up in the picture, in radians, when something outside the picture can say.
	 *
	 * Given, the fit's angular origin is pinned to it outright instead of being chained to the previous
	 * frame. Only worth doing with a direction that is fixed to the boss rather than to the camera,
	 * which in practice means gravity: the picture's own vertical turns with the phone, so pinning to
	 * that trades a slow drift for the phone's own roll, and measured over eight recorded sweeps it
	 * made the steady ones worse while only half mending the bad ones.
	 */
	up: number | null = null
): FaceLocation {
	// Starting fine as well as ending fine: a frame's worth of camera movement is small, and the coarse
	// rounds a search needs are pure cost when the answer is already almost right.
	// Following, the layout is not in question: a boss does not turn from a full face into a three spot
	// between two frames, so the three scorings it takes to decide are pure cost every frame.
	if (!thorough) {
		const known = start.spot === undefined ? undefined : start.spot ? THREE_SPOT : FULL_FACE;
		const fitted = descend(frame, start, FOLLOW_STEP, FOLLOW_START, known);
		/*
		 * Pinned where there is something to pin to, and otherwise turned back onto the angle it came in
		 * at, because which way round a face is described is a free choice the descent would otherwise
		 * make differently every frame.
		 *
		 * Both keep the coordinates continuous; only the pin keeps them still. Chaining each frame to the
		 * last leaves the free choice free, and a chain of small free choices is a walk: measured over
		 * eight recorded sweeps its origin walked twenty five degrees on three of them and nearly sixty
		 * on another, which is the found arrows creeping round the gold, and worse than it looks. The
		 * tracker gathers evidence per place on the face, so an arrow whose coordinates are turning has
		 * its votes smeared over an arc instead of piling up, and never clears the bar at all.
		 */
		return up === null ? alignFace(start, fitted) : pinFace(fitted, up);
	}

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
