// The labels a recording carries, shared by the labelling page and the node harnesses, so it imports nothing.

export const LABELS_FILE = 'labels-v2.json';
export const LEGACY_FILE = 'labels.json';

export type Point = [number, number];

/** What is printed on the boss, with the radius its outermost printed edge sits at. */
export const FACE_TYPES = [
	{ id: '10-ring', name: '10 ring', edge: 1 },
	{ id: '5-ring', name: '5 ring', edge: 0.6 },
	{ id: '3-spot', name: '3 spot', edge: 0.6 },
	{ id: 'field', name: 'Field', edge: 1 },
	{ id: '8-ring', name: '8 ring', edge: 1 },
	{ id: 'other', name: 'Other', edge: 1 }
] as const;

/** Colour boundaries a rim tap can sit on, outermost first, in face radii. */
export const RINGS = [
	{ key: '1', name: 'white edge', r: 1 },
	{ key: '2', name: 'black', r: 0.8 },
	{ key: '3', name: 'blue', r: 0.6 },
	{ key: '4', name: 'red', r: 0.4 },
	{ key: '5', name: 'gold', r: 0.2 }
] as const;

// An arrow's number `n` is NOT the same shaft on every frame in old labels: match arrows across frames as sets.
export interface Arrow {
	n: number;
	x: number;
	y: number;
}

/** One face on the boss, as the whole recording sees it. Arrows are in this face's own coordinates. */
export interface FaceLabel {
	id: string;
	type: string | null;
	/** Nothing shot at it in this recording. */
	empty: boolean;
	arrows: Arrow[];
	/** Arrows shot in this end, which is what the arrows step counts towards. */
	count?: number;
	/** The frame the arrows were placed on, whose fit defines their coordinates. */
	placedOn: number | null;
	/** Kept from the old labels: things that look like shafts and are not. */
	marks?: { x: number; y: number }[];
}

/** One face on one frame. Absent, the frame has not been looked at and its automatic fit stands. */
export interface FrameFace {
	state: 'ok' | 'none';
	/** Where face points (1,0), (0,1), (-1,0), (0,-1) land in the picture, in the recording's pixels. */
	fit?: Point[];
	/** Every arrow on this frame was checked: carried right, moved here, or hidden. */
	arrowsOk?: boolean;
	// Keyed by arrow number, but a hand placed set may number the shafts differently from the reference frame.
	moved?: Record<string, { x: number; y: number }>;
	/** Arrows that cannot be seen on this frame, behind another or out of the picture. */
	hidden?: number[];
	/** Null where the nock cannot be made out on this frame. */
	nocks?: Record<string, Point | null>;
}

export interface Labels {
	version: 2;
	faces: FaceLabel[];
	frames: Record<string, Record<string, FrameFace>>;
}

/** What `prepare` wrote beside the frames. */
export interface FramesMeta {
	video: string;
	width: number;
	height: number;
	frames: number;
	chosen: number[];
	seeds: (Seed | null)[];
}

export interface Seed {
	handles?: Point[] | null;
	cx: number;
	cy: number;
	semiMajor: number;
	semiMinor: number;
	rotation: number;
	perspectiveX?: number;
	perspectiveY?: number;
	support?: number;
	visible?: number;
}

export type Matrix = number[][];

export function empty(): Labels {
	return { version: 2, faces: [{ id: 'a', type: '10-ring', empty: false, arrows: [], placedOn: null }], frames: {} };
}

export function edgeOf(type: string | null | undefined): number {
	return FACE_TYPES.find((f) => f.id === type)?.edge ?? 1;
}

export function anchorsAt(r: number): Point[] {
	return [
		[r, 0],
		[0, r],
		[-r, 0],
		[0, -r]
	];
}

/** The projection taking face coordinates to the picture, from where the four anchors at `r` landed. */
export function homography(points: Point[] | null | undefined, r = 1): Matrix | null {
	if (!points || points.length !== 4) return null;
	const rows: number[][] = [];
	anchorsAt(r).forEach(([u, v], i) => {
		const [x, y] = points[i];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	});
	const h = solve(rows);
	return h && [
		[h[0], h[1], h[2]],
		[h[3], h[4], h[5]],
		[h[6], h[7], 1]
	];
}

/** Least squares projection through any number of correspondences, at least four. */
export function homographyFrom(face: Point[], image: Point[]): Matrix | null {
	const a: number[][] = Array.from({ length: 8 }, () => new Array(9).fill(0));
	face.forEach(([u, v], i) => {
		const [x, y] = image[i];
		for (const row of [
			[u, v, 1, 0, 0, 0, -u * x, -v * x, x],
			[0, 0, 0, u, v, 1, -u * y, -v * y, y]
		]) {
			for (let r = 0; r < 8; r++) {
				for (let c = 0; c < 9; c++) a[r][c] += row[r] * row[c];
			}
		}
	});
	const h = solve(a);
	return h && [
		[h[0], h[1], h[2]],
		[h[3], h[4], h[5]],
		[h[6], h[7], 1]
	];
}

function solve(rows: number[][]): number[] | null {
	const n = rows.length;
	const m = rows.map((row) => [...row]);
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
		if (Math.abs(m[pivot][col]) < 1e-12) return null;
		[m[col], m[pivot]] = [m[pivot], m[col]];
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = m[r][col] / m[col][col];
			for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
		}
	}
	return m.map((row, i) => row[n] / row[i]);
}

export function project(h: Matrix, x: number, y: number): { x: number; y: number } {
	const w = h[2][0] * x + h[2][1] * y + h[2][2];
	return { x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w, y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w };
}

export function invert(h: Matrix): Matrix | null {
	const [[a, b, c], [d, e, f], [g, k, l]] = h;
	const A = e * l - f * k;
	const B = -(d * l - f * g);
	const C = d * k - e * g;
	const det = a * A + b * B + c * C;
	if (Math.abs(det) < 1e-12) return null;
	return [
		[A / det, -(b * l - c * k) / det, (b * f - c * e) / det],
		[B / det, (a * l - c * g) / det, -(a * f - c * d) / det],
		[C / det, -(a * k - b * g) / det, (a * e - b * d) / det]
	];
}

/** The four anchors of a fit moved from one radius to another, which describes the same projection. */
export function atRadius(points: Point[], from: number, to: number): Point[] {
	if (from === to) return points;
	const h = homography(points, from);
	if (!h) return points;
	return anchorsAt(to).map(([u, v]) => {
		const p = project(h, u, v);
		return [p.x, p.y] as Point;
	});
}

/** A fit turned about the gold: the same rings, with the face's coordinates turned by `angle`. */
export function turned(points: Point[], angle: number): Point[] {
	const h = homography(points);
	if (!h) return points;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return anchorsAt(1).map(([u, v]) => {
		const p = project(h, u * cos - v * sin, u * sin + v * cos);
		return [p.x, p.y] as Point;
	});
}

/** The automatic fit of a frame at the unit radius, or a circle in the middle when there is none. */
export function seedFit(seed: Seed | null | undefined, width: number, height: number): Point[] {
	if (seed?.handles?.length === 4) return atRadius(seed.handles, 0.8, 1);
	if (!seed) {
		const r = Math.min(width, height) * 0.4;
		return anchorsAt(1).map(([u, v]) => [width / 2 + u * r, height / 2 + v * r] as Point);
	}
	const cos = Math.cos(seed.rotation);
	const sin = Math.sin(seed.rotation);
	const points = anchorsAt(0.8).map(([u, v]) => {
		const px = u * seed.semiMajor;
		const py = v * seed.semiMinor;
		const depth = 1 + (seed.perspectiveX ?? 0) * u + (seed.perspectiveY ?? 0) * v;
		const k = Math.abs(depth) < 1e-6 ? 1 : 1 / depth;
		return [seed.cx + (px * cos - py * sin) * k, seed.cy + (px * sin + py * cos) * k] as Point;
	});
	return atRadius(points, 0.8, 1);
}

/** The fit a frame is read through: the one checked by hand, else the automatic one. */
export function fitOf(labels: Labels, meta: FramesMeta, frame: number, face = 'a'): Point[] {
	return labels.frames[frame]?.[face]?.fit ?? seedFit(meta.seeds[frame], meta.width, meta.height);
}

export interface PlacedArrow extends Arrow {
	hidden: boolean;
	moved: boolean;
}

/** Every arrow of a face as one frame has it, in that frame's face coordinates. */
export function arrowsOn(labels: Labels, frame: number, face = 'a'): PlacedArrow[] {
	const label = labels.faces.find((f) => f.id === face);
	if (!label) return [];
	const here = labels.frames[frame]?.[face];
	return label.arrows.map((arrow) => {
		const moved = here?.moved?.[arrow.n];
		return {
			n: arrow.n,
			x: moved?.x ?? arrow.x,
			y: moved?.y ?? arrow.y,
			hidden: here?.hidden?.includes(arrow.n) ?? false,
			moved: Boolean(moved)
		};
	});
}

const LEGACY_ANCHOR = 0.8;
const LEGACY_RADII: Record<string, number> = { '5-ring': 0.6 };

/** The old tool's labels in this format, read as saved: the turns it applied on load were against seeds since replaced. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromLegacy(old: any, meta: FramesMeta): Labels {
	const radius = LEGACY_RADII[old.faceType] ?? LEGACY_ANCHOR;
	const frames: Labels['frames'] = {};
	for (const [key, saved] of Object.entries(old.frames ?? {}) as [string, any][]) {
		const i = Number(key);
		const touched = saved.touched ?? !saved.skip;
		const handles = touched && saved.handles ? atRadius(saved.handles, radius, 1) : seedFit(meta.seeds[i], meta.width, meta.height);
		if (!touched && !saved.skip && !saved.arrowsOk) continue;
		frames[i] = { a: saved.skip ? { state: 'none' } : { state: 'ok', fit: handles, arrowsOk: Boolean(saved.arrowsOk) } };
	}

	let arrows: Arrow[] = (old.arrows ?? []).map((a: { x: number; y: number }, n: number) => ({ n, x: a.x, y: a.y }));
	let placedOn: number | null = arrows.length ? (old.arrowFrame ?? 0) : null;
	const owned = Object.entries(old.frameArrows ?? {}) as [string, { n: number; x: number; y: number }[]][];
	const count = Math.max(arrows.length, ...owned.map(([, own]) => own?.length ?? 0));
	// Some old recordings have a short set of their own and the whole set only on later frames.
	const whole = arrows.length < count ? owned.find(([, own]) => own.length === count) : undefined;
	if (whole) {
		if (placedOn !== null) owned.push([String(placedOn), arrows]);
		placedOn = Number(whole[0]);
		arrows = whole[1].map(({ n, x, y }) => ({ n, x, y })).sort((a, b) => a.n - b.n);
	}
	if (placedOn !== null && frames[placedOn]?.a?.state === 'ok') frames[placedOn].a.arrowsOk = true;
	for (const [key, own] of owned) {
		if (!own?.length || Number(key) === placedOn) continue;
		const i = Number(key);
		const face = (frames[i] ??= { a: { state: 'ok', fit: seedFit(meta.seeds[i], meta.width, meta.height) } }).a;
		face.moved = {};
		for (const arrow of own) face.moved[arrow.n] = { x: arrow.x, y: arrow.y };
		// A partial set was a frame left unfinished, never one with arrows out of sight.
		face.arrowsOk = own.length >= arrows.length;
	}
	for (const [key, list] of Object.entries(old.nocks ?? {}) as [string, { arrow: number; x: number; y: number }[]][]) {
		if (!list?.length) continue;
		const i = Number(key);
		const face = (frames[i] ??= { a: { state: 'ok', fit: seedFit(meta.seeds[i], meta.width, meta.height) } }).a;
		face.nocks = Object.fromEntries(list.map((nock) => [nock.arrow, [nock.x, nock.y] as Point]));
	}

	return {
		version: 2,
		faces: [
			{
				id: 'a',
				type: old.faceType ?? null,
				empty: Boolean(old.empty),
				...(arrows.length ? { count: arrows.length } : {}),
				arrows,
				placedOn,
				marks: (old.marks ?? []).map((m: { x: number; y: number }) => ({ x: m.x, y: m.y }))
			}
		],
		frames
	};
}

/** The first face's labels in the old shape. Frames with hidden arrows list the visible ones, and `frameHidden` the rest. */
export function toLegacy(labels: Labels) {
	const face = labels.faces[0];
	const radius = LEGACY_RADII[face?.type ?? ''] ?? LEGACY_ANCHOR;
	const frames: Record<string, { handles: Point[] | null; skip: boolean; touched: boolean; arrowsOk: boolean }> = {};
	const frameArrows: Record<string, Arrow[]> = {};
	const frameHidden: Record<string, Arrow[]> = {};
	const nocks: Record<string, { arrow: number; x: number; y: number }[]> = {};
	for (const [key, faces] of Object.entries(labels.frames)) {
		const here = faces[face?.id ?? 'a'];
		if (!here) continue;
		if (here.state === 'none') frames[key] = { handles: null, skip: true, touched: false, arrowsOk: false };
		else if (here.fit) frames[key] = { handles: atRadius(here.fit, 1, radius), skip: false, touched: true, arrowsOk: Boolean(here.arrowsOk) };
		if (here.nocks) {
			const seen = Object.entries(here.nocks).filter((entry): entry is [string, Point] => entry[1] !== null);
			if (seen.length) nocks[key] = seen.map(([n, [x, y]]) => ({ arrow: Number(n), x, y }));
		}
		if (!face || here.state === 'none') continue;
		const placed = arrowsOn(labels, Number(key), face.id);
		const hidden = placed.filter((a) => a.hidden);
		const moved = placed.some((a) => a.moved);
		if (here.arrowsOk && (moved || hidden.length > 0)) {
			frameArrows[key] = placed.filter((a) => !a.hidden).map(({ n, x, y }) => ({ n, x, y }));
			if (hidden.length) frameHidden[key] = hidden.map(({ n, x, y }) => ({ n, x, y }));
		} else if (!here.arrowsOk && moved) {
			frameArrows[key] = placed.filter((a) => a.moved).map(({ n, x, y }) => ({ n, x, y }));
		}
	}
	return {
		arrows: (face?.arrows ?? []).map(({ x, y }) => ({ x, y })),
		arrowFrame: face?.placedOn ?? null,
		frameArrows,
		frameHidden,
		frames,
		faceType: face?.type ?? null,
		empty: face?.empty ?? false,
		nocks,
		marks: face?.marks ?? []
	};
}
