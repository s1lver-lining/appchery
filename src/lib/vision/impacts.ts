import { luma } from './pixels';
import { toFaceCoords } from './face';
import type { StillArrow } from './still';
import type { Frame, FaceLocation } from './types';

/**
 * Finding arrows from their impacts outwards.
 *
 * The shape detector in `still.ts` finds a shaft first and then asks where it ended, and the second
 * half is where it loses most of what it finds: measured on the frames the archer labelled outright,
 * a run whose line passes through the impact exists for 90% of the arrows, and only 39% of them come
 * back placed on it. The extent of a run is decided by grouping, and grouping is the fragile part.
 *
 * So this asks the other question first. Along a shaft the ridge reads about twenty luma and about
 * minus three one step inside the impact: a shaft does not fade into the paper, it stops. That step is
 * the sharpest thing in the picture and it sits exactly where the answer is wanted, so it is what the
 * arrow is proposed from, and the shaft grown out of it is what confirms the proposal.
 *
 * Not what runs: it sees more than the shape detector and is noisier, and the numbers either way are
 * in doc/camera-scoring.md. Turned on with `proposer` on the scanner.
 */

/** Bearings the line filter is tried at, over half a turn, since a line has no way round. */
const ORIENTS = 16;

/** Brightness at or below which the paper is too dark for a shaft to show against it either way. */
const BLACK_RING = 80;

export interface ImpactOptions {
	/** How far out from the centre arrows are looked for, in face radii. */
	reach?: number;
	/** How much darker than its own flanks a point must be to be part of a shaft, in luma. */
	minRidge?: number;
	/** How far off a shaft its flanks are read, as a share of the face radius. */
	flankShare?: number;
	/** How far either side of a candidate the step in the ridge is read, in face radii. */
	window?: number;
	/** How much the ridge must step up on the way out for a place to be called an impact. */
	step?: number;
	/** How long a shaft grown out of a candidate must be, in face radii. */
	minLength?: number;
	/** How far a shaft is followed out past its impact, in face radii. */
	follow?: number;
	/** How much of a shaft's length must be spent crossing rings rather than following one. */
	radialLean?: number;
	/** How far out an impact may be read, in face radii. */
	maxRadius?: number;
	/** How far off a kept shaft's line another reading may sit before it is a separate arrow. */
	mergeDistance?: number;
	/** How far apart two readings of one shaft may sit along it, in face radii. */
	mergeAlong?: number;
	/** Share of the stretch between two readings that must be shaft, or paper too dark to show one. */
	buriedShare?: number;
	/** Candidate impacts examined at most, strongest step first, so a noisy frame cannot run away. */
	limit?: number;
	/** Arrows reported at most, best first. Zero reports every one that clears the bars. */
	cap?: number;
	/** How far a shaft may lean from where the camera says a standing shaft must, in radians. */
	standTolerance?: number;
}

interface Candidate {
	x: number;
	y: number;
	/** Which way the shaft leaves the paper, which is outwards from the middle of the face. */
	ux: number;
	uy: number;
	step: number;
}

/** Shafts in one picture, best first, in the same shape the shape detector answers in. */
export function detectArrowsFromImpacts(
	frame: Frame,
	face: FaceLocation,
	options: ImpactOptions = {}
): StillArrow[] {
	const reach = options.reach ?? 1.15;
	const minRidge = options.minRidge ?? 14;
	const flankShare = options.flankShare ?? 0.035;
	const window = options.window ?? 0.07;
	const step = options.step ?? 10;
	const minLength = options.minLength ?? 0.18;
	const follow = options.follow ?? 3;
	const radialLean = options.radialLean ?? 0.25;
	const maxRadius = options.maxRadius ?? 1.05;
	const mergeDistance = options.mergeDistance ?? 0.035;
	const mergeAlong = options.mergeAlong ?? 0.6;
	const buriedShare = options.buriedShare ?? 0.5;
	const limit = options.limit ?? 400;
	const cap = options.cap ?? 0;
	const standTolerance = options.standTolerance ?? 0.35;

	const radius = (face.semiMajor + face.semiMinor) / 2;
	if (!(radius > 4)) return [];
	const flank = Math.max(2, radius * flankShare);
	const wide = Math.max(3, flank * 1.5);

	const { width, height } = frame;
	const box = {
		left: Math.max(1, Math.floor(face.cx - radius * reach)),
		right: Math.min(width - 2, Math.ceil(face.cx + radius * reach)),
		top: Math.max(1, Math.floor(face.cy - radius * reach)),
		bottom: Math.min(height - 2, Math.ceil(face.cy + radius * reach))
	};
	if (box.right <= box.left || box.bottom <= box.top) return [];

	const gray = grayOf(frame, box);
	const { best, angle } = ridgeMap(gray, width, height, box, [flank, wide]);

	const candidates: Candidate[] = [];
	const span = Math.max(2, radius * window);
	for (let y = box.top; y <= box.bottom; y++) {
		for (let x = box.left; x <= box.right; x++) {
			const i = y * width + x;
			if (best[i] < minRidge) continue;

			const th = (angle[i] * Math.PI) / ORIENTS;
			const nx = -Math.sin(th);
			const ny = Math.cos(th);
			// The crest of the ridge, so one shaft answers once across its width rather than twice.
			if (read(best, width, height, x + nx, y + ny) > best[i]) continue;
			if (read(best, width, height, x - nx, y - ny) > best[i]) continue;

			const rx = x - face.cx;
			const ry = y - face.cy;
			const out = Math.hypot(rx, ry);
			if (out < 1e-6) continue;
			let ux = Math.cos(th);
			let uy = Math.sin(th);
			if (ux * rx + uy * ry < 0) {
				ux = -ux;
				uy = -uy;
			}
			// A ring line runs round the face wherever you meet it; a shaft has to cross rings.
			if ((ux * rx + uy * ry) / out < radialLean) continue;

			const outward = meanRidge(gray, width, height, x, y, ux, uy, 1, span, wide);
			const inward = meanRidge(gray, width, height, x, y, -ux, -uy, 1, span, wide);
			if (outward <= NOTHING || inward <= NOTHING) continue;
			if (outward - inward < step) continue;
			candidates.push({ x, y, ux, uy, step: outward - inward });
		}
	}
	candidates.sort((a, b) => b.step - a.step);

	const found: StillArrow[] = [];
	const apart = radius * mergeDistance;
	for (const candidate of candidates.slice(0, limit)) {
		if (found.some((a) => Math.hypot(a.imageX - candidate.x, a.imageY - candidate.y) < apart)) continue;

		const shaft = grow(
			gray,
			width,
			height,
			candidate,
			Math.round(radius * follow),
			wide,
			minRidge * 0.5
		);
		if (shaft.length < radius * minLength) continue;

		const point = toFaceCoords(face, candidate.x, candidate.y);
		if (Math.hypot(point.x, point.y) >= maxRadius) continue;
		const far = toFaceCoords(face, shaft.x, shaft.y);
		const reachOut = Math.hypot(far.x - point.x, far.y - point.y);
		const climb = Math.hypot(far.x, far.y) - Math.hypot(point.x, point.y);
		if (reachOut <= 0 || climb < radialLean * reachOut) continue;

		found.push({
			x: point.x,
			y: point.y,
			imageX: candidate.x,
			imageY: candidate.y,
			tailX: shaft.x,
			tailY: shaft.y,
			leanX: shaft.x,
			leanY: shaft.y,
			area: Math.round(shaft.length * flank * 2),
			length: shaft.length,
			width: Math.round(flank * 2)
		});
	}

	const merged = innermost(found, gray, width, height, radius, {
		mergeDistance,
		mergeAlong,
		buriedShare,
		minRidge,
		flank: wide
	});
	const standing = standingTogether(merged, face, standTolerance);
	standing.sort((a, b) => b.length - a.length);
	return cap > 0 ? standing.slice(0, cap) : standing;
}

/** What a reading outside the picture answers, which is nothing rather than a number. */
const NOTHING = -1e8;

/** Brightness over the searched box alone, since the rest of the picture is never asked about. */
function grayOf(frame: Frame, box: { left: number; right: number; top: number; bottom: number }) {
	const gray = new Float32Array(frame.width * frame.height);
	for (let y = box.top - 1; y <= box.bottom + 1; y++) {
		if (y < 0 || y >= frame.height) continue;
		for (let x = box.left - 1; x <= box.right + 1; x++) {
			if (x < 0 || x >= frame.width) continue;
			const p = (y * frame.width + x) * 4;
			gray[y * frame.width + x] = luma(frame.data[p], frame.data[p + 1], frame.data[p + 2]);
		}
	}
	return gray;
}

/**
 * The dark line response everywhere, with the bearing that gave it.
 *
 * The middle against the weaker of its two flanks, so a step between two rings answers zero however
 * hard the step is: one of its flanks is always as dark as its middle. That is the whole reason for a
 * ridge rather than a threshold on darkness, because a threshold cannot tell a line from the dark side
 * of an edge, and the dark side of a ring frontier is where the shape detector's wrong marks sit.
 *
 * Read at whole pixel offsets, worked out once per bearing. Interpolating costs several times as much
 * and buys nothing here: the flanks only have to land off the shaft, and half a pixel either way still
 * does. What is smoothed along the shaft's own bearing first, because a line is long and noise is not,
 * and that is what stops the grain of the paper answering.
 */
function ridgeMap(
	gray: Float32Array,
	width: number,
	height: number,
	box: { left: number; right: number; top: number; bottom: number },
	flanks: number[]
) {
	const best = new Float32Array(width * height).fill(NOTHING);
	const angle = new Uint8Array(width * height);
	const smoothed = new Float32Array(width * height);
	const along = 2;

	for (let a = 0; a < ORIENTS; a++) {
		const th = (a * Math.PI) / ORIENTS;
		const ux = Math.cos(th);
		const uy = Math.sin(th);

		const steps: number[] = [];
		for (let t = -along; t <= along; t++) {
			steps.push(Math.round(uy * t) * width + Math.round(ux * t));
		}
		for (let y = box.top - 1; y <= box.bottom + 1; y++) {
			for (let x = box.left - 1; x <= box.right + 1; x++) {
				const i = y * width + x;
				let sum = 0;
				for (const s of steps) sum += gray[clamp(i + s, width * height)];
				smoothed[i] = sum / steps.length;
			}
		}

		const nx = -uy;
		const ny = ux;
		for (let y = box.top; y <= box.bottom; y++) {
			for (let x = box.left; x <= box.right; x++) {
				const i = y * width + x;
				let got = NOTHING;
				for (const w of flanks) {
					const off = Math.round(ny * w) * width + Math.round(nx * w);
					const left = smoothed[clamp(i + off, width * height)];
					const right = smoothed[clamp(i - off, width * height)];
					const v = Math.min(left, right) - smoothed[i];
					if (v > got) got = v;
				}
				if (got > best[i]) {
					best[i] = got;
					angle[i] = a;
				}
			}
		}
	}
	return { best, angle };
}

const clamp = (i: number, size: number) => (i < 0 ? 0 : i >= size ? size - 1 : i);

/** A field read between its pixels, for the one place a whole pixel step is too coarse. */
function read(field: Float32Array, width: number, height: number, x: number, y: number): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) return NOTHING;
	const fx = x - x0;
	const fy = y - y0;
	const i = y0 * width + x0;
	return (
		(field[i] * (1 - fx) + field[i + 1] * fx) * (1 - fy) +
		(field[i + width] * (1 - fx) + field[i + width + 1] * fx) * fy
	);
}

/** How much of a ridge the picture is at one point for one bearing, read off the brightness itself. */
function ridgeAt(
	gray: Float32Array,
	width: number,
	height: number,
	x: number,
	y: number,
	nx: number,
	ny: number,
	flank: number
): number {
	const centre = read(gray, width, height, x, y);
	if (centre <= NOTHING) return NOTHING;
	const left = read(gray, width, height, x - nx * flank, y - ny * flank);
	const right = read(gray, width, height, x + nx * flank, y + ny * flank);
	if (left <= NOTHING || right <= NOTHING) return NOTHING;
	return Math.min(left, right) - centre;
}

/** The ridge averaged over a stretch of a shaft's own line, from a point in one direction. */
function meanRidge(
	gray: Float32Array,
	width: number,
	height: number,
	x: number,
	y: number,
	ux: number,
	uy: number,
	from: number,
	to: number,
	flank: number
): number {
	let sum = 0;
	let n = 0;
	for (let t = from; t <= to; t += 1) {
		const v = ridgeAt(gray, width, height, x + ux * t, y + uy * t, -uy, ux, flank);
		if (v <= NOTHING) continue;
		sum += v;
		n += 1;
	}
	return n === 0 ? NOTHING : sum / n;
}

/**
 * Follows a shaft outwards from its impact, re-reading its bearing over everything walked so far.
 *
 * It tracks rather than extrapolates, and that is the point of it. Walking on in the direction a few
 * pixels of crest happened to have only carries the error further; the direction is what is wanted and
 * a short run is worst at exactly that. So the shaft is looked for a pixel or two either side of where
 * it was expected, and the bearing is taken from the whole length walked, which grows as it goes.
 */
function grow(
	gray: Float32Array,
	width: number,
	height: number,
	from: Candidate,
	limit: number,
	flank: number,
	bar: number
) {
	let ux = from.ux;
	let uy = from.uy;
	let x = from.x + ux;
	let y = from.y + uy;
	let last = { x: from.x, y: from.y };
	let missed = 0;
	let sum = 0;
	let n = 0;

	for (let walked = 1; walked <= limit; walked++) {
		const px = -uy;
		const py = ux;
		let bestScore = NOTHING;
		let bestX = x;
		let bestY = y;
		for (let off = -1.5; off <= 1.5; off += 0.5) {
			const cx = x + px * off;
			const cy = y + py * off;
			const v = ridgeAt(gray, width, height, cx, cy, px, py, flank);
			if (v > bestScore) {
				bestScore = v;
				bestX = cx;
				bestY = cy;
			}
		}
		x = bestX;
		y = bestY;
		if (bestScore > bar) {
			last = { x, y };
			sum += bestScore;
			n += 1;
			missed = 0;
			const dx = x - from.x;
			const dy = y - from.y;
			const walkedSpan = Math.hypot(dx, dy);
			if (walkedSpan > 1e-6) {
				ux = dx / walkedSpan;
				uy = dy / walkedSpan;
			}
		} else if (++missed > 8) {
			// A pixel or two of doubt is a ring line or a shadow crossing it; more than that is the end.
			break;
		}
		x += ux;
		y += uy;
	}

	return {
		x: last.x,
		y: last.y,
		length: Math.hypot(last.x - from.x, last.y - from.y),
		strength: n === 0 ? 0 : sum / n
	};
}

/**
 * One shaft, one impact: the innermost of the places along it where the ridge stepped up.
 *
 * A shaft steps up wherever it comes out of something dark, and the black ring of a target face is
 * exactly that. So one arrow answers several times over, once at the hole and once at every ring
 * frontier it crosses on the way out, and the wrong ones all sit further out along the same line. That
 * is what makes them answerable rather than merely numerous.
 */
function innermost(
	arrows: StillArrow[],
	gray: Float32Array,
	width: number,
	height: number,
	radius: number,
	rules: {
		mergeDistance: number;
		mergeAlong: number;
		buriedShare: number;
		minRidge: number;
		flank: number;
	}
): StillArrow[] {
	const kept: StillArrow[] = [];
	for (const arrow of [...arrows].sort((a, b) => b.length - a.length)) {
		const bearing = unit(arrow.tailX - arrow.imageX, arrow.tailY - arrow.imageY);
		if (bearing.x === 0 && bearing.y === 0) continue;

		let merged = false;
		for (const other of kept) {
			const theirs = unit(other.tailX - other.imageX, other.tailY - other.imageY);
			if (theirs.x === 0 && theirs.y === 0) continue;
			// Bearings within about ten degrees, measured without caring which way each one points.
			if (Math.abs(bearing.x * theirs.x + bearing.y * theirs.y) < 0.985) continue;
			const dx = arrow.imageX - other.imageX;
			const dy = arrow.imageY - other.imageY;
			if (Math.abs(dx * theirs.y - dy * theirs.x) > radius * rules.mergeDistance) continue;
			// Only over a stretch one shaft could span: two arrows can share a bearing by chance.
			if (Math.abs(dx * theirs.x + dy * theirs.y) > radius * rules.mergeAlong) continue;

			merged = true;
			const nearer = Math.hypot(arrow.x, arrow.y) < Math.hypot(other.x, other.y);
			if (nearer && buried(gray, width, height, arrow, other, rules)) {
				other.x = arrow.x;
				other.y = arrow.y;
				other.imageX = arrow.imageX;
				other.imageY = arrow.imageY;
			}
			break;
		}
		if (!merged) kept.push({ ...arrow });
	}
	return kept;
}

/**
 * Whether the stretch between two readings of one bearing holds a shaft the picture cannot show.
 *
 * The black of a target face hides a dark shaft completely, so an arrow crossing it answers twice and
 * the outer answer sits on the frontier rather than in the paper. Taking the inner answer is right only
 * where there is something between them to be hidden: over black paper there is, and over the white
 * outer ring, where a shaft would have shown plainly, there is not.
 */
function buried(
	gray: Float32Array,
	width: number,
	height: number,
	inner: StillArrow,
	outer: StillArrow,
	rules: { buriedShare: number; minRidge: number; flank: number }
): boolean {
	const dx = outer.imageX - inner.imageX;
	const dy = outer.imageY - inner.imageY;
	const span = Math.hypot(dx, dy);
	if (span < 1) return true;
	const ux = dx / span;
	const uy = dy / span;

	let hidden = 0;
	let asked = 0;
	for (let t = 1; t < span; t += 1) {
		const x = inner.imageX + ux * t;
		const y = inner.imageY + uy * t;
		const centre = read(gray, width, height, x, y);
		const left = read(gray, width, height, x + uy * rules.flank, y - ux * rules.flank);
		const right = read(gray, width, height, x - uy * rules.flank, y + ux * rules.flank);
		if (centre <= NOTHING || left <= NOTHING || right <= NOTHING) continue;
		asked += 1;
		const paper = Math.min(left, right);
		if (paper - centre > rules.minRidge * 0.5 || paper < BLACK_RING) hidden += 1;
	}
	return asked === 0 || hidden / asked >= rules.buriedShare;
}

/**
 * Keeps the marks that lean the way a thing standing in the paper has to lean from where the camera is.
 *
 * A shaft comes out of the paper, and the face already says where the camera is: read back through the
 * fit, the far end of every standing shaft lies on the line from its own impact towards one single
 * point, and that point is the same for every arrow in the picture. A crease, a printed line, a tear
 * and the shadow under the rim lie flat, and have no reason to agree with it or with one another.
 *
 * Which place they agree on is found by trying every pair and counting who joins them, rather than by
 * fitting all of them at once and weighting the disagreement down. The weighted fit is only as good as
 * what it starts from: given four real marks among twenty it fits the twenty, and the arrows are then
 * the ones thrown out for disagreeing with the noise.
 */
function standingTogether(arrows: StillArrow[], face: FaceLocation, tolerance: number): StillArrow[] {
	// Three lines is the fewest that can disagree; a meeting place fitted to two is no evidence at all.
	if (arrows.length < 4 || tolerance >= Math.PI) return arrows;

	const lines = arrows.map((arrow) => {
		const lean = toFaceCoords(face, arrow.leanX, arrow.leanY);
		return { ax: arrow.x, ay: arrow.y, ...unit(lean.x - arrow.x, lean.y - arrow.y) };
	});

	let most = 0;
	let agreed: Set<number> | null = null;
	for (let i = 0; i < lines.length; i++) {
		for (let j = i + 1; j < lines.length; j++) {
			const meet = crossing(lines[i], lines[j]);
			if (!meet) continue;
			const set = new Set<number>();
			for (let k = 0; k < lines.length; k++) {
				if (leansAway(lines[k], meet.x, meet.y) <= tolerance) set.add(k);
			}
			if (set.size > most) {
				most = set.size;
				agreed = set;
			}
		}
	}
	// If almost nothing agrees, the meeting place was fitted to disagreement and says nothing.
	if (!agreed || agreed.size < 3) return arrows;
	return arrows.filter((_, i) => agreed.has(i));
}

/** Where two shafts' lines meet, or null where they run too near parallel to say. */
function crossing(
	a: { ax: number; ay: number; x: number; y: number },
	b: { ax: number; ay: number; x: number; y: number }
): { x: number; y: number } | null {
	const determinant = a.x * -b.y - a.y * -b.x;
	if (Math.abs(determinant) < 1e-6) return null;
	const t = ((b.ax - a.ax) * -b.y - (b.ay - a.ay) * -b.x) / determinant;
	return { x: a.ax + a.x * t, y: a.ay + a.y * t };
}

/** How far a mark's lean is from pointing at the meeting place, as an angle, either way along it. */
function leansAway(
	line: { ax: number; ay: number; x: number; y: number },
	ex: number,
	ey: number
): number {
	const tx = ex - line.ax;
	const ty = ey - line.ay;
	const reach = Math.hypot(tx, ty);
	if (reach < 1e-6) return 0;
	// Undirected: which end of a shaft the walk stopped at is not something to judge an arrow by.
	return Math.acos(Math.min(1, Math.abs((line.x * tx + line.y * ty) / reach)));
}

function unit(x: number, y: number): { x: number; y: number } {
	const span = Math.hypot(x, y);
	return span < 1e-6 ? { x: 0, y: 0 } : { x: x / span, y: y / span };
}
