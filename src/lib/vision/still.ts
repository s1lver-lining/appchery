import { rgbToHsv, luma } from './pixels';
import { toFaceCoords } from './face';
import type { Frame, FaceLocation } from './types';

/**
 * Finding arrows in a single photograph.
 *
 * The live scanner recognises an arrow by it being *new*, which needs a reference frame of the quiet
 * boss. A still has no such reference, so the signal has to come from the arrow's own shape: a shaft
 * sticking out of a face is a long, thin, dark streak, and nothing printed on a face looks like that.
 * The ring numbers are compact, the printed lines are circles, and paper creases are faint.
 *
 * The impact is not the middle of that streak, it is the end of it that touches the paper, which is the
 * inner end: an arrow leans out of the face towards the lens.
 */

/**
 * Angular resolution of the paper model, and the finest radial resolution it will use. The radial
 * bins are capped to the face's own size in pixels: a bin thinner than a pixel holds so little that
 * its median becomes whatever happens to lie there, which on a face with an arrow in it is the arrow.
 */
const MAX_RADIAL_BINS = 288;
const SECTORS = 12;

/** Default for how far past the face the search runs, in face radii. */
const REACH = 1.0;

export interface StillOptions {
	/** How much darker than the surrounding paper a pixel must be to count as part of a shaft. */
	darkness?: number;
	/** Shortest streak worth reporting, as a share of the face radius. */
	minLength?: number;
	/** Longest streak worth reporting, so a shadow across the whole boss is not an arrow. */
	maxLength?: number;
	/** How many times longer than wide a streak must be. */
	minElongation?: number;
	/** Widest a shaft may be, as a share of the face radius. */
	maxWidth?: number;
	/** How much of a streak's length must be spent crossing rings rather than following one. */
	radialLean?: number;
	/** Share of a streak that must be darker than the paper on both sides rather than just one. */
	minRidge?: number;
	/** Share of a streak that must be unbroken, so a line bridged across noise is not a shaft. */
	minFill?: number;
	/** How far past the face to follow a shaft, in face radii. */
	reach?: number;
	/** How far off a kept shaft's line another run may sit before it counts as a separate arrow. */
	mergeDistance?: number;
	/**
	 * Gap a run may bridge, as a share of the face radius.
	 *
	 * A shaft is broken up by the ring lines it crosses and by its own highlight, and bridging those
	 * gives longer, truer runs, which is worth a lot: on the labelled set, going from a few pixels to
	 * 0.08 gave up three points of recall for seven of precision.
	 *
	 * It does not reach far enough to cross the black ring, where a dark shaft leaves no trace at all.
	 * That needs about 0.22, a whole ring's width, and it was measured: precision reaches 60% but recall
	 * falls to 23%, because a gap that size also joins marks that have nothing to do with each other.
	 * The arrow that crosses the black therefore still ends at its edge, and that is a known limit
	 * rather than an oversight.
	 */
	bridge?: number;
	/** How far a shaft's bearing may differ from the best one found, in radians. */
	bearingTolerance?: number;
	/** How much thicker or thinner than the best shaft another may be, as a factor. */
	widthRatio?: number;
}

export interface StillArrow {
	/** Where the shaft meets the paper, in face coordinates. */
	x: number;
	y: number;
	/** The same point in the frame's pixels, so it can be drawn back onto the picture. */
	imageX: number;
	imageY: number;
	/** The far end of the shaft, for drawing the line that was actually found. */
	tailX: number;
	tailY: number;
	area: number;
	length: number;
	/** Thickness of the shaft in pixels, which every arrow in one picture shares. */
	width: number;
}

/**
 * What the paper looks like at each radius and bearing, taken as a median so the arrows lying on it
 * cannot drag their own baseline down. Per sector as well as per radius because one side of a boss is
 * almost always better lit than the other, and a flat per ring average turns that gradient into arrows.
 */
function paperModel(frame: Frame, face: FaceLocation, reach: number, bins: number): Float32Array {
	const buckets: number[][] = Array.from({ length: bins * SECTORS }, () => []);
	const box = bounds(frame, face, reach);

	for (let y = box.top; y <= box.bottom; y++) {
		for (let x = box.left; x <= box.right; x++) {
			const cell = cellOf(face, x, y, reach, bins);
			if (cell < 0) continue;
			const p = (y * frame.width + x) * 4;
			buckets[cell].push(rgbToHsv(frame.data[p], frame.data[p + 1], frame.data[p + 2]).v);
		}
	}

	const model = new Float32Array(bins * SECTORS);
	for (let r = 0; r < bins; r++) {
		for (let s = 0; s < SECTORS; s++) {
			// Pooled with the neighbouring bearings: one sector of one thin ring holds too few pixels.
			const values = [
				...buckets[r * SECTORS + ((s + SECTORS - 1) % SECTORS)],
				...buckets[r * SECTORS + s],
				...buckets[r * SECTORS + ((s + 1) % SECTORS)]
			];
			if (values.length === 0) {
				model[r * SECTORS + s] = -1;
				continue;
			}
			values.sort((a, b) => a - b);
			model[r * SECTORS + s] = values[Math.floor(values.length / 2)];
		}
	}
	return model;
}

function bounds(frame: Frame, face: FaceLocation, reach: number) {
	return {
		left: Math.max(0, Math.floor(face.cx - face.semiMajor * reach)),
		right: Math.min(frame.width - 1, Math.ceil(face.cx + face.semiMajor * reach)),
		top: Math.max(0, Math.floor(face.cy - face.semiMajor * reach)),
		bottom: Math.min(frame.height - 1, Math.ceil(face.cy + face.semiMajor * reach))
	};
}

/** Index into the model for an image pixel, or -1 when it falls beyond the searched area. */
function cellOf(face: FaceLocation, x: number, y: number, reach: number, bins: number): number {
	const point = toFaceCoords(face, x, y);
	const radius = Math.hypot(point.x, point.y);
	if (radius >= reach) return -1;
	const bin = Math.min(bins - 1, Math.floor((radius / reach) * bins));
	const bearing = Math.atan2(point.y, point.x) + Math.PI;
	const sector = Math.min(SECTORS - 1, Math.floor((bearing / (Math.PI * 2)) * SECTORS));
	return bin * SECTORS + sector;
}

/** Shafts found in the picture, longest first. */
export function detectArrowsInStill(
	frame: Frame,
	face: FaceLocation,
	options: StillOptions = {}
): StillArrow[] {
	const darkness = options.darkness ?? 0.75;
	const minLength = options.minLength ?? 0.09;
	const maxLength = options.maxLength ?? 3;
	const minElongation = options.minElongation ?? 3;
	const maxWidth = options.maxWidth ?? 0.08;
	const radialLean = options.radialLean ?? 0.2;
	const minRidge = options.minRidge ?? 0.6;
	const minFill = options.minFill ?? 0.85;
	const reach = options.reach ?? REACH;
	const bridge = options.bridge ?? 0.08;
	const bearingTolerance = options.bearingTolerance ?? 0.6;
	const widthRatio = options.widthRatio ?? 1.7;
	const mergeDistance = options.mergeDistance ?? 0.03;

	const radius = (face.semiMajor + face.semiMinor) / 2;
	// One bin per pixel of face radius at most, so every bin holds a ring of real paper to take a median of.
	const bins = Math.max(24, Math.min(MAX_RADIAL_BINS, Math.round(radius)));
	const model = paperModel(frame, face, reach, bins);

	const box = bounds(frame, face, reach);

	const mask = new Uint8Array(frame.width * frame.height);
	for (let y = box.top; y <= box.bottom; y++) {
		for (let x = box.left; x <= box.right; x++) {
			const cell = cellOf(face, x, y, reach, bins);
			if (cell < 0) continue;
			const reference = model[cell];
			if (reference < 0) continue;

			const p = (y * frame.width + x) * 4;
			const value = rgbToHsv(frame.data[p], frame.data[p + 1], frame.data[p + 2]).v;
			if (value < reference * darkness) mask[y * frame.width + x] = 1;
		}
	}

	const found: StillArrow[] = [];
	for (const segment of straightRuns(frame, mask, box, minLength * radius, face, bridge * radius)) {
		if (segment.length < minLength * radius || segment.length > maxLength * radius) continue;
		if (segment.width > maxWidth * radius) continue;
		if (segment.length < minElongation * Math.max(segment.width, 1)) continue;
		/**
		 * A shaft is a dark line with lighter paper on both sides. The edge of a scoreboard graphic, the
		 * rim of the boss and the shadow it throws are all dark on one side only, and they were what
		 * survived every test based on shape alone.
		 */
		if (segment.ridge < minRidge) continue;
		// A shaft is one unbroken stroke, not a line drawn through scattered marks on the same bearing.
		if (segment.fill < minFill) continue;

		// The buried end is the inner one: an arrow leans out of the face towards the lens.
		const inner =
			Math.hypot(toFaceCoords(face, segment.ax, segment.ay).x, toFaceCoords(face, segment.ax, segment.ay).y) <=
			Math.hypot(toFaceCoords(face, segment.bx, segment.by).x, toFaceCoords(face, segment.bx, segment.by).y);

		/**
		 * The end of the dark run is not the impact. Past the hole the run keeps going through the black
		 * ring, an old shot or a neighbouring shaft, and every one of those pulls the score inwards. The
		 * shaft stops being a ridge the moment it enters the paper, so that is where the arrow is read.
		 */
		const entry = enterPoint(frame, mask, segment, inner, maxWidth * radius);
		const point = toFaceCoords(face, entry.x, entry.y);
		const tail = inner ? { x: segment.bx, y: segment.by } : { x: segment.ax, y: segment.ay };
		const far = toFaceCoords(face, tail.x, tail.y);
		if (Math.hypot(point.x, point.y) >= 1) continue;

		/**
		 * The printed ring lines are long thin dark streaks too, and they were most of what the shape
		 * test let through. What separates them is bearing: a ring line keeps its radius along its whole
		 * length, while a shaft crosses rings on its way out to the nock.
		 */
		const span = Math.hypot(far.x - point.x, far.y - point.y);
		const climb = Math.hypot(far.x, far.y) - Math.hypot(point.x, point.y);
		if (span <= 0 || climb < radialLean * span) continue;

		found.push({
			x: point.x,
			y: point.y,
			imageX: entry.x,
			imageY: entry.y,
			tailX: tail.x,
			tailY: tail.y,
			area: segment.length * segment.width,
			length: segment.length,
			width: segment.width
		});
	}

	found.sort((a, b) => b.length - a.length);

	/**
	 * One arrow answers several times: the two edges of the shaft are separate lines, a ring crossing
	 * splits it into fragments, and the run often carries on past the hole to the far side of the face.
	 * Every one of those repeats sits on the arrow's own line, so the test is collinearity rather than
	 * distance, and the longest run wins because it is the one with the most evidence behind it.
	 */
	const gap = mergeDistance * radius;
	const kept: StillArrow[] = [];
	for (const arrow of found) {
		const dx = arrow.tailX - arrow.imageX;
		const dy = arrow.tailY - arrow.imageY;
		const span = Math.hypot(dx, dy);
		if (span <= 0) continue;

		const repeat = kept.some((other) => {
			const ox = other.tailX - other.imageX;
			const oy = other.tailY - other.imageY;
			const length = Math.hypot(ox, oy);
			if (length <= 0) return false;
			// Bearings within about ten degrees, measured without caring which way each one points.
			if (Math.abs((dx * ox + dy * oy) / (span * length)) < 0.985) return false;
			const offset = Math.abs((arrow.imageX - other.imageX) * oy - (arrow.imageY - other.imageY) * ox) / length;
			return offset < gap;
		});
		if (repeat) continue;
		kept.push(arrow);
	}

	return likeTheBest(kept, bearingTolerance, widthRatio);
}

/**
 * Judges the weaker candidates against the strongest one.
 *
 * The arrows in a photograph are the same physical objects shot from the same place: the same shaft,
 * the same thickness, and all of them leaning towards the same lens, so their bearings on the image
 * are close to parallel. Nothing forces that on a crease, a shadow or an old hole. So once one arrow
 * is found convincingly, it says what the rest should look like, and anything that does not resemble
 * it has to be much better evidence than it would otherwise need.
 *
 * The longest run is the anchor because length is the measure least confused by clutter.
 */
function likeTheBest(arrows: StillArrow[], bearingTolerance: number, widthRatio: number): StillArrow[] {
	const anchor = arrows[0];
	if (!anchor) return arrows;

	const bearing = (arrow: StillArrow) => Math.atan2(arrow.tailY - arrow.imageY, arrow.tailX - arrow.imageX);
	const reference = bearing(anchor);
	const limit = Math.cos(bearingTolerance);

	return arrows.filter((arrow, index) => {
		if (index === 0) return true;
		const apart = bearing(arrow) - reference;
		if (Math.cos(apart) < limit) return false;
		const ratio = arrow.width / Math.max(anchor.width, 0.5);
		return ratio >= 1 / widthRatio && ratio <= widthRatio;
	});
}

interface Segment {
	ax: number;
	ay: number;
	bx: number;
	by: number;
	length: number;
	width: number;
	/** Share of the run that has lighter paper on both flanks. */
	ridge: number;
	/** Share of the run actually covered by dark pixels rather than bridged across a gap. */
	fill: number;
	/** The line the run sits on, kept so the buried end can be walked back to the paper. */
	cos: number;
	sin: number;
	rho: number;
	from: number;
	to: number;
}

/**
 * Where the shaft goes into the paper: the innermost point that still looks like a shaft. Past the
 * hole the dark run usually keeps going, through the black ring, an old shot or a neighbouring arrow,
 * and every one of those pulls the score inwards, so the run has to be read rather than trusted.
 *
 * Judged over a window rather than point by point. A single hard stop was tried and was much worse:
 * the flank test fails wherever the shaft crosses a ring line or another arrow, and the walk gave up
 * at the first of them, out beyond the paper.
 */
function enterPoint(
	frame: Frame,
	mask: Uint8Array,
	segment: Segment,
	innerIsFrom: boolean,
	maxWidth: number
): { x: number; y: number } {
	const { width, height } = frame;
	const dx = -segment.sin;
	const dy = segment.cos;
	const originX = segment.rho * segment.cos;
	const originY = segment.rho * segment.sin;

	const head = innerIsFrom ? segment.from : segment.to;
	const nock = innerIsFrom ? segment.to : segment.from;
	const step = head < nock ? -1 : 1;
	const count = Math.abs(head - nock) + 1;

	/** 1 is shaft, 0 is not, and -1 is paper too dark to tell either way. */
	const good: number[] = [];
	for (let i = 0; i < count; i++) {
		const t = nock + step * i;
		const x = originX + dx * t;
		const y = originY + dy * t;

		let thickness = 0;
		for (let k = -14; k <= 14; k++) {
			const px = Math.round(x + segment.cos * k);
			const py = Math.round(y + segment.sin * k);
			if (px < 0 || py < 0 || px >= width || py >= height) continue;
			if (mask[py * width + px]) thickness++;
		}

		const reach = thickness / 2 + 2;
		const centre = sample(frame, x, y);
		const left = sample(frame, x - segment.cos * reach, y - segment.sin * reach);
		const right = sample(frame, x + segment.cos * reach, y + segment.sin * reach);

		if (centre < 0 || left < 0 || right < 0) {
			good.push(-1);
			continue;
		}

		good.push(
			thickness >= 1 && thickness <= maxWidth * 2 && left > centre + 8 && right > centre + 8 ? 1 : 0
		);
	}

	const window = 5;
	let last = 0;
	for (let i = 0; i < count; i++) {
		let hits = 0;
		let judged = 0;
		for (let k = Math.max(0, i - window + 1); k <= i; k++) {
			if (good[k] < 0) continue;
			judged++;
			if (good[k] > 0) hits++;
		}
		// A window with nothing to go on keeps the walk moving rather than ending the shaft there.
		if (judged === 0 || hits * 3 >= judged * 2) last = i;
	}

	const t = nock + step * last;
	return { x: originX + dx * t, y: originY + dy * t };
}

/**
 * Whether the mask is set within a pixel or two of a point. A line walked at an angle never lands on
 * the exact pixels it passes through, and a shaft is only a few pixels across to begin with.
 */
function near(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const px = x + dx;
			const py = y + dy;
			if (px < 0 || py < 0 || px >= width || py >= height) continue;
			if (mask[py * width + px]) return true;
		}
	}
	return false;
}

function sample(frame: Frame, x: number, y: number): number {
	const px = Math.round(x);
	const py = Math.round(y);
	if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) return -1;
	const p = (py * frame.width + px) * 4;
	return luma(frame.data[p], frame.data[p + 1], frame.data[p + 2]);
}

/**
 * Half a degree of bearing. One degree was not enough: over the length of a shaft a half degree error
 * walks the line several pixels sideways, off a shaft only a few pixels wide, and the run came back
 * cut into pieces with its ends in the wrong place.
 */
const ANGLE_STEPS = 360;

/**
 * Straight runs of set pixels, longest first, found by voting for lines rather than by growing regions.
 *
 * Region growing was the obvious approach and it fails on exactly the picture that matters: arrows in a
 * group cross each other on their way out of the boss, so three shafts come back as one blob with an
 * axis belonging to none of them. A vote over bearings separates crossing lines by construction, since
 * each shaft puts its pixels in a different bearing.
 */
function straightRuns(
	frame: Frame,
	mask: Uint8Array,
	box: { left: number; right: number; top: number; bottom: number },
	minVotes: number,
	face: FaceLocation,
	gapTolerance: number
): Segment[] {
	const { width, height } = frame;
	const points: number[] = [];
	for (let y = box.top; y <= box.bottom; y++) {
		for (let x = box.left; x <= box.right; x++) {
			if (mask[y * width + x]) points.push(y * width + x);
		}
	}
	if (points.length === 0) return [];

	const cos = new Float32Array(ANGLE_STEPS);
	const sin = new Float32Array(ANGLE_STEPS);
	for (let a = 0; a < ANGLE_STEPS; a++) {
		cos[a] = Math.cos((a * Math.PI) / ANGLE_STEPS);
		sin[a] = Math.sin((a * Math.PI) / ANGLE_STEPS);
	}

	const reach = Math.ceil(Math.hypot(width, height));
	const rhoBins = reach * 2 + 1;
	const votes = new Int32Array(ANGLE_STEPS * rhoBins);
	for (const index of points) {
		const x = index % width;
		const y = (index - x) / width;
		for (let a = 0; a < ANGLE_STEPS; a++) {
			const rho = Math.round(x * cos[a] + y * sin[a]) + reach;
			votes[a * rhoBins + rho]++;
		}
	}

	// A bearing worth walking has to hold a run, not a scatter, so the bar is the shortest useful shaft.
	const floor = Math.max(12, Math.round(minVotes));
	const peaks: { angle: number; rho: number; votes: number }[] = [];
	for (let a = 0; a < ANGLE_STEPS; a++) {
		for (let r = 1; r < rhoBins - 1; r++) {
			const n = votes[a * rhoBins + r];
			if (n < floor) continue;
			if (n < votes[a * rhoBins + r - 1] || n < votes[a * rhoBins + r + 1]) continue;
			const rho = r - reach;
			/**
			 * The impact is on the paper, so a shaft's line has to cross the face. Without this the search
			 * spends itself on the plank edges and mat seams around the boss, which are longer and
			 * straighter than any arrow and were crowding every real shaft out of the running.
			 */
			if (Math.abs(face.cx * cos[a] + face.cy * sin[a] - rho) > face.semiMajor) continue;
			peaks.push({ angle: a, rho, votes: n });
		}
	}
	peaks.sort((p, q) => q.votes - p.votes);

	const segments: Segment[] = [];
	const taken: { angle: number; rho: number }[] = [];
	for (const peak of peaks) {
		// Neighbouring bins describe the same line, so one accepted peak silences the ones beside it.
		const close = taken.some(
			(other) =>
				Math.min(
					Math.abs(other.angle - peak.angle),
					ANGLE_STEPS - Math.abs(other.angle - peak.angle)
				) <= 6 && Math.abs(other.rho - peak.rho) <= 6
		);
		if (close) continue;
		taken.push(peak);
		if (taken.length > 90) break;

		const run = walk(frame, mask, cos[peak.angle], sin[peak.angle], peak.rho, gapTolerance);
		if (run) segments.push(run);
	}

	return segments.sort((a, b) => b.length - a.length);
}

/** The longest unbroken stretch of mask along one line, and how thick the mask is across it. */
function walk(
	frame: Frame,
	mask: Uint8Array,
	cos: number,
	sin: number,
	rho: number,
	gapTolerance: number
): Segment | null {
	const { width, height } = frame;
	const dx = -sin;
	const dy = cos;
	const originX = rho * cos;
	const originY = rho * sin;

	/**
	 * A shaft is cut by ring lines, by its own highlight, and above all by the black ring, where a dark
	 * shaft on dark paper leaves no trace at all. Bridging only a few pixels ended every run that
	 * crossed the black at the white boundary, and planted an impact there.
	 */
	const limit = Math.ceil(Math.hypot(width, height));

	let best: { from: number; to: number } | null = null;
	let start: number | null = null;
	let last = 0;
	let gap = 0;

	for (let t = -limit; t <= limit; t++) {
		const x = Math.round(originX + dx * t);
		const y = Math.round(originY + dy * t);
		if (x < 0 || y < 0 || x >= width || y >= height) continue;

		const hit = near(mask, width, height, x, y);

		if (hit) {
			if (start === null) start = t;
			last = t;
			gap = 0;
		} else if (start !== null && ++gap > gapTolerance) {
			if (!best || last - start > best.to - best.from) best = { from: start, to: last };
			start = null;
		}
	}
	if (start !== null && (!best || last - start > best.to - best.from)) {
		best = { from: start, to: last };
	}
	if (!best) return null;

	let covered = 0;
	for (let t = best.from; t <= best.to; t++) {
		const x = Math.round(originX + dx * t);
		const y = Math.round(originY + dy * t);
		if (x < 0 || y < 0 || x >= width || y >= height) continue;
		if (near(mask, width, height, x, y)) covered++;
	}

	const widths: number[] = [];
	let flanked = 0;
	let sampled = 0;
	for (let i = 1; i < 12; i++) {
		const t = best.from + ((best.to - best.from) * i) / 12;
		const x = originX + dx * t;
		const y = originY + dy * t;
		let thickness = 0;
		for (let k = -12; k <= 12; k++) {
			const px = Math.round(x + cos * k);
			const py = Math.round(y + sin * k);
			if (px < 0 || py < 0 || px >= width || py >= height) continue;
			if (mask[py * width + px]) thickness++;
		}
		widths.push(thickness);

		const step = thickness / 2 + 2;
		const centre = sample(frame, x, y);
		const left = sample(frame, x - cos * step, y - sin * step);
		const right = sample(frame, x + cos * step, y + sin * step);
		if (centre < 0 || left < 0 || right < 0) continue;
		sampled++;
		if (left > centre + 8 && right > centre + 8) flanked++;
	}
	widths.sort((a, b) => a - b);

	return {
		cos,
		sin,
		rho,
		from: best.from,
		to: best.to,
		ridge: sampled === 0 ? 0 : flanked / sampled,
		fill: covered / Math.max(1, best.to - best.from + 1),
		ax: originX + dx * best.from,
		ay: originY + dy * best.from,
		bx: originX + dx * best.to,
		by: originY + dy * best.to,
		length: best.to - best.from,
		width: Math.max(1, widths[Math.floor(widths.length / 2)])
	};
}
