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
/**
 * How far out from the face's centre the paper is modelled and dark runs are traced, in face radii.
 *
 * Past the printed face, because an arrow in the backing paper is still an arrow of the end. Stopping
 * at the edge of the printing meant the detector could not see one there at all: not a low score for
 * it, no proposal of any kind, and the end then came up short and had its gap filled with something
 * worse. Reaching past it lifted the share of arrows ever proposed from 85% to 94%, which is most of
 * what was left of that ceiling.
 */
const REACH = 1.3;

/**
 * How far past the face a shaft is followed once one has been found, in face radii.
 *
 * The paper is modelled and searched only as far as the printing plus a little, because that is where
 * an arrow can land and where the colours mean anything. But an arrow does not stop where it lands: it
 * stands out of the boss towards the archer, and on a face filled by a phone screen the nock projects a
 * long way outside the target. Measured against nocks placed by hand, seventy eight of eighty three lay
 * beyond the search box, at three face radii typically and seven at the worst.
 *
 * That cost more than a truncated drawing. What the detector reported as the far end of a shaft was the
 * point where its own box stopped, a quarter of the way along, and the direction of a quarter length
 * segment carries several times the angular error of the whole. Everything that reasons about how an
 * arrow leans was being fed that.
 */
const FOLLOW_OUT = 6;

export interface StillOptions {
	/** How much darker than the surrounding paper a pixel must be to count as part of a shaft. */
	darkness?: number;
	/** Shortest streak worth reporting, as a share of the face radius. */
	minLength?: number;
	/** Longest streak worth reporting, so a shadow across the whole boss is not an arrow. */
	maxLength?: number;
	/**
	 * How many times longer than wide a streak must be.
	 *
	 * Four rather than three. A shaft seen from anywhere is far longer than it is wide; most of what
	 * came in at three and not four was a fold in the paper or a patch of rim shadow, and dropping
	 * those cost no arrow on the labelled recordings.
	 */
	minElongation?: number;
	/** Widest a shaft may be, as a share of the face radius. */
	maxWidth?: number;
	/** How much of a streak's length must be spent crossing rings rather than following one. */
	radialLean?: number;
	/**
	 * Share of a streak that must be darker than the paper on both sides rather than just one.
	 *
	 * A shaft stands proud of the paper and is dark against it on both sides. A crease, a printed ring
	 * line and the shadow under the boss rim are dark against one side and go on being paper on the
	 * other, so this is the question that tells them apart. Raised from 0.6 across fourteen labelled
	 * recordings: the arrows found in three seconds held at 51 of 84 while the wrong marks fell from
	 * 17 to 13, and in two seconds the marks put twice on one shaft fell from 9 to 2.
	 *
	 * Not raised further, though 0.75 gives 6 wrong marks and 1 double. It also drops the arrows found
	 * in three seconds from 51 to 41, because a shaft crossing a black ring is a ridge on one side only
	 * for as far as the ring is wide.
	 */
	minRidge?: number;
	/** Share of a streak that must be unbroken, so a line bridged across noise is not a shaft. */
	minFill?: number;
	/** How far past the face to follow a shaft, in face radii. */
	reach?: number;
	/** How far off a kept shaft's line another run may sit before it counts as a separate arrow. */
	mergeDistance?: number;
	/** How far a shaft may lean from where the camera says a standing shaft must, in radians. */
	standTolerance?: number;
	/** How far out an impact may be read, in face radii. */
	maxRadius?: number;
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
	/**
	 * Collects the runs that were turned away and why, for a harness asking what became of an arrow.
	 *
	 * A recall figure says how many arrows were missed and nothing about why, and the answers want
	 * completely different work: a shaft no run was ever found along is a failure of the search, and one
	 * found and then dropped for having no ridge is a failure of a threshold.
	 */
	turnedAway?: { x: number; y: number; why: string }[];
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
	/**
	 * The far end again, followed out past the face for as long as the picture keeps showing a shaft.
	 *
	 * Kept apart from `tailX`/`tailY` because the two answer different questions. The run's own end is
	 * where the evidence inside the search box stopped, and that is the right thing to ask when deciding
	 * whether two readings are the same shaft. This one is where the arrow actually appears to reach,
	 * which is the right thing to ask about how it leans, and the only one accurate enough to be worth
	 * asking: measured against nocks placed by hand, the run's own end gives a bearing a third of a right
	 * angle out, and this one gives it to a degree.
	 */
	leanX: number;
	leanY: number;
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
	const minElongation = options.minElongation ?? 4;
	const maxWidth = options.maxWidth ?? 0.08;
	const radialLean = options.radialLean ?? 0.2;
	const minRidge = options.minRidge ?? 0.6;
	const minFill = options.minFill ?? 0.85;
	const reach = options.reach ?? REACH;
	const bridge = options.bridge ?? 0.08;
	const mergeDistance = options.mergeDistance ?? 0.03;
	/** How far a shaft may lean from where a shaft standing in the paper has to, in radians. */
	const standTolerance = options.standTolerance ?? 0.35;
	/**
	 * How far out an impact may be read, in face radii.
	 *
	 * Not the same as how far out a run may be traced, and the difference is the point. A shaft in the
	 * backing paper has to be followed out to its nock to be recognised as a shaft at all, so the tracing
	 * reaches well past the printing; but the further out an impact is read, the more of what is read is
	 * the boss rim, the pins holding the face on and the shadow the rim throws. So runs are followed far
	 * and impacts are only believed near.
	 */
	const maxRadius = options.maxRadius ?? 1.1;

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
	const turnedAway = options.turnedAway;
	/** Notes why a run was dropped, and where it was, for a harness asking what became of an arrow. */
	const drop = (segment: Segment, why: string) => {
		if (!turnedAway) return;
		const a = toFaceCoords(face, segment.ax, segment.ay);
		const b = toFaceCoords(face, segment.bx, segment.by);
		const inner = Math.hypot(a.x, a.y) <= Math.hypot(b.x, b.y) ? a : b;
		turnedAway.push({ x: inner.x, y: inner.y, why });
	};
	for (const segment of straightRuns(frame, mask, box, minLength * radius, face, bridge * radius)) {
		if (segment.length < minLength * radius || segment.length > maxLength * radius) {
			drop(segment, segment.length < minLength * radius ? 'too short' : 'too long');
			continue;
		}
		if (segment.width > maxWidth * radius) {
			drop(segment, 'too wide');
			continue;
		}
		if (segment.length < minElongation * Math.max(segment.width, 1)) {
			drop(segment, 'not long for its width');
			continue;
		}
		/**
		 * A shaft is a dark line with lighter paper on both sides. The edge of a scoreboard graphic, the
		 * rim of the boss and the shadow it throws are all dark on one side only, and they were what
		 * survived every test based on shape alone.
		 */
		if (segment.ridge < minRidge) {
			drop(segment, 'no ridge');
			continue;
		}
		// A shaft is one unbroken stroke, not a line drawn through scattered marks on the same bearing.
		if (segment.fill < minFill) {
			drop(segment, 'broken');
			continue;
		}

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
		if (Math.hypot(point.x, point.y) >= maxRadius) {
			drop(segment, 'off the face');
			continue;
		}

		/**
		 * The printed ring lines are long thin dark streaks too, and they were most of what the shape
		 * test let through. What separates them is bearing: a ring line keeps its radius along its whole
		 * length, while a shaft crosses rings on its way out to the nock.
		 */
		const span = Math.hypot(far.x - point.x, far.y - point.y);
		const climb = Math.hypot(far.x, far.y) - Math.hypot(point.x, point.y);
		if (span <= 0 || climb < radialLean * span) {
			drop(segment, 'follows a ring');
			continue;
		}

		const reach = followOut(frame, segment, inner, entry, maxWidth * radius, radius * FOLLOW_OUT);

		found.push({
			x: point.x,
			y: point.y,
			imageX: entry.x,
			imageY: entry.y,
			tailX: tail.x,
			tailY: tail.y,
			leanX: reach.x,
			leanY: reach.y,
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

	/*
	 * Every run that got this far, judged on its own merits and against no other.
	 *
	 * There used to be one more test here: each candidate's thickness was compared against the longest
	 * run in the frame and anything much thicker or thinner was thrown out, on the argument that the
	 * arrows in one picture are the same physical shafts and so the same thickness. A bearing test went
	 * the same way before it, for the same reason, and this one had the same fault written into it. It
	 * hangs the whole frame on one anchor: the longest run is not always a shaft, and when it is a
	 * shadow or the boss rim every real arrow in the picture is measured against the wrong thing.
	 *
	 * Measured on the frames the archer labelled outright, with the fit they drew on those same frames
	 * so that nothing but the proposer is in the answer, it was costing 44 arrows of 374 — one in eight
	 * of every arrow present — and buying no precision at all: half the proposals were right with it and
	 * half without. End to end it is worth more than that, because a proposal the tracker never sees is
	 * one no amount of agreement across a sweep can recover: the arrows an accepted end writes down went
	 * from 48 of 146 to 65, and the marks put twice on one shaft fell from 6 to 2.
	 */
	return standingTogether(kept, face, standTolerance);
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

/** Brightness at or below which paper is the black ring rather than paper, on the same scale as luma. */
const BLACK_RING = 70;

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
		/*
		 * Where both flanks are as dark as the shaft there is no ridge to see, either way.
		 *
		 * That is the shaft crossing the black ring, and counting it as a place the shaft failed to be
		 * a ridge is what tied the bar to the ring: set high enough to turn away a crease, it turned
		 * away the arrow that crosses the black along with it. Left out of the count instead, so the
		 * share is read over the places where the question could be answered.
		 */
		if (left < BLACK_RING && right < BLACK_RING) continue;
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

/**
 * Follows a shaft outwards from the impact, past everything the search box covers.
 *
 * Only ever an extension of a run already found, never a way to find one: outside the boss there is no
 * paper to compare against and no telling what the background will do, so nothing here may propose an
 * arrow. What it may do is keep walking one, which is safe because it only continues while the picture
 * goes on showing the same thing — a dark line with lighter surroundings on both sides.
 *
 * It tracks rather than extrapolates, and that is the whole point of it. Walking on in the direction the
 * short run happened to have only moves the far end further along a line that was already off; the
 * direction is what is wanted and the direction is what a short run is worst at. So at every step the
 * shaft is looked for a pixel or two either side of where it was expected, and the bearing is re-read
 * from the whole length walked so far, which is what turns a quarter of a shaft into all of it.
 */
function followOut(
	frame: Frame,
	segment: Segment,
	innerIsFrom: boolean,
	entry: { x: number; y: number },
	maxWidth: number,
	limit: number
): { x: number; y: number } {
	const originX = segment.rho * segment.cos;
	const originY = segment.rho * segment.sin;
	const nock = innerIsFrom ? segment.to : segment.from;
	const head = innerIsFrom ? segment.from : segment.to;
	const outward = nock > head ? 1 : -1;

	let x = originX - segment.sin * nock;
	let y = originY + segment.cos * nock;
	let ux = -segment.sin * outward;
	let uy = segment.cos * outward;
	let last = { x, y };
	let missed = 0;
	const flank = maxWidth / 2 + 2;

	for (let step = 1; step <= limit; step++) {
		// A pixel on, and up to two either side of it, because a shaft is not exactly where it was.
		const px = -uy;
		const py = ux;
		let bestScore = 0;
		let bestX = x + ux;
		let bestY = y + uy;

		for (let off = -2; off <= 2; off += 0.5) {
			const cx = x + ux + px * off;
			const cy = y + uy + py * off;
			const centre = sample(frame, cx, cy);
			if (centre < 0) continue;
			const left = sample(frame, cx - px * flank, cy - py * flank);
			const right = sample(frame, cx + px * flank, cy + py * flank);
			if (left < 0 || right < 0) continue;
			// How much of a ridge it is: dark here and lighter on both sides, by the weaker of the two.
			const ridge = Math.min(left - centre, right - centre);
			if (ridge > bestScore) {
				bestScore = ridge;
				bestX = cx;
				bestY = cy;
			}
		}

		x = bestX;
		y = bestY;
		if (bestScore > 8) {
			last = { x, y };
			missed = 0;
			// The bearing re-read over everything walked, which is a far longer baseline than one step.
			const dx = x - entry.x;
			const dy = y - entry.y;
			const span = Math.hypot(dx, dy);
			if (span > 1e-6) {
				ux = dx / span;
				uy = dy / span;
			}
		} else if (++missed > 6) {
			// A few pixels of doubt is a ring line or a shadow crossing it; more than that is the end.
			break;
		}
	}

	return last;
}

/**
 * Keeps the marks that lean the way a thing standing in the paper has to lean from where the camera is.
 *
 * This is the one property an arrow has and a crease, a printed line, a tear or a rim shadow does not:
 * it comes out of the paper. Everything else the detector measures — dark, thin, straight, unbroken,
 * lighter on both sides — a fold in the face has too.
 *
 * What makes it checkable without knowing anything about the camera is that the face already says where
 * the camera is. A point at height h above the face images at `H(x, y, 1) + h·v`, where H is the fit and
 * v is where the plane's normal vanishes; read back through the fit into face coordinates, the far end
 * of a standing shaft therefore lies on the line from its own impact towards one single point, and that
 * point is the same for every arrow in the picture. It is where the camera is standing, written in the
 * face's own coordinates.
 *
 * So the arrows in one frame do not lean in random directions, and they do not lean in parallel either:
 * their lines meet. Parallel is the far field, true of a boss photographed from across a field and false
 * of one the archer is standing in front of, where the six shafts fan out.
 *
 * The meeting place is fitted from the marks themselves rather than derived from the fit, which needs no
 * lens calibration and no motion sensor. It is a two by two least squares with the outliers weighted
 * down, so the very marks being judged cannot define the answer.
 */
function standingTogether(arrows: StillArrow[], face: FaceLocation, tolerance: number): StillArrow[] {
	// Three lines is the fewest that can disagree; a meeting place fitted to two is no evidence at all.
	if (arrows.length < 4 || tolerance >= Math.PI) return arrows;

	const lines = arrows.map((arrow) => {
		const lean = toFaceCoords(face, arrow.leanX, arrow.leanY);
		const dx = lean.x - arrow.x;
		const dy = lean.y - arrow.y;
		const span = Math.hypot(dx, dy);
		return { ax: arrow.x, ay: arrow.y, ux: dx / span, uy: dy / span, span };
	});

	let ex = 0;
	let ey = 0;
	const weights = lines.map(() => 1);

	// Reweighted least squares: fit, see which disagree, believe them less, fit again.
	for (let round = 0; round < 4; round++) {
		let a = 0;
		let b = 0;
		let c = 0;
		let px = 0;
		let py = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!(line.span > 0)) continue;
			// The direction across the line, which is what the meeting place must not be off along.
			const nx = -line.uy;
			const ny = line.ux;
			const d = nx * line.ax + ny * line.ay;
			const w = weights[i];
			a += w * nx * nx;
			b += w * nx * ny;
			c += w * ny * ny;
			px += w * nx * d;
			py += w * ny * d;
		}
		const determinant = a * c - b * b;
		// Every line pointing the same way, so they meet nowhere in particular and this says nothing.
		if (Math.abs(determinant) < 1e-9) return arrows;
		ex = (c * px - b * py) / determinant;
		ey = (a * py - b * px) / determinant;

		for (let i = 0; i < lines.length; i++) {
			weights[i] = 1 / (1 + (leansAway(lines[i], ex, ey) / tolerance) ** 2);
		}
	}

	const kept = arrows.filter((_, i) => leansAway(lines[i], ex, ey) <= tolerance);
	// If most of the picture disagrees, the meeting place was fitted to disagreement and means nothing.
	return kept.length >= 3 ? kept : arrows;
}

/** How far a mark's lean is from pointing at the meeting place, as an angle, either way along it. */
function leansAway(
	line: { ax: number; ay: number; ux: number; uy: number; span: number },
	ex: number,
	ey: number
): number {
	const tx = ex - line.ax;
	const ty = ey - line.ay;
	const reach = Math.hypot(tx, ty);
	if (reach < 1e-6 || !(line.span > 0)) return 0;
	// Undirected: which end of a shaft the run stopped at is not something to judge an arrow by.
	return Math.acos(Math.min(1, Math.abs((line.ux * tx + line.uy * ty) / reach)));
}
