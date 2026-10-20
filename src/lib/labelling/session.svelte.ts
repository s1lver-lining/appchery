import { arrowsOn, empty, fitOf, type FaceLabel, type FrameFace, type FramesMeta, type Labels, type Point } from './format';

export interface Recording extends FramesMeta {
	video: string;
	shotAt: string | null;
	samples: string[];
	labels: Labels | null;
}

export type Step = 'face' | 'arrows' | 'nocks' | 'score';
export const STEPS: Step[] = ['face', 'arrows', 'nocks', 'score'];

const NOCKS_KEY = 'labelling.nocks';
const TAGS_KEY = 'labelling.tags';
const RINGS_KEY = 'labelling.rings';

function stored(key: string, fallback: boolean): boolean {
	try {
		const value = localStorage.getItem(key);
		return value === null ? fallback : value === '1';
	} catch {
		return fallback;
	}
}

function store(key: string, on: boolean) {
	try {
		localStorage.setItem(key, on ? '1' : '0');
	} catch {
		// A browser refusing storage just forgets the choice on reload.
	}
}

/** Nocks are labelled only when asked for: nothing the scorer measures or learns from reads them. */
export const options = $state({ nocks: stored(NOCKS_KEY, false), tags: stored(TAGS_KEY, true), rings: stored(RINGS_KEY, true) });

export function setNocks(on: boolean) {
	options.nocks = on;
	store(NOCKS_KEY, on);
}

/** The number and score drawn beside each arrow. */
export function setTags(on: boolean) {
	options.tags = on;
	store(TAGS_KEY, on);
}

/** The green circles around arrows that are not selected. */
export function setRings(on: boolean) {
	options.rings = on;
	store(RINGS_KEY, on);
}

/** The steps shown, which leave out the nocks while they are off. */
export function stepsShown(): Step[] {
	return STEPS.filter((s) => s !== 'nocks' || options.nocks);
}

/** Nocks are wanted on this many frames, spread as far apart as the sweep goes. */
const NOCK_FRAMES = 6;

export function labelsOf(rec: Recording): Labels {
	return (rec.labels ??= empty());
}

/** The face being worked on, for a boss with more than one, such as a three spot. */
export const view = $state({ face: 'a' });

export function faceOf(rec: Recording, id = view.face): FaceLabel {
	const faces = labelsOf(rec).faces;
	return faces.find((f) => f.id === id) ?? faces[0];
}

export function frameFace(rec: Recording, frame: number, id = view.face): FrameFace | undefined {
	return rec.labels?.frames[frame]?.[faceOf(rec, id).id];
}

/** This frame's face, made when first written to, starting from the fit it is drawn with. */
export function ensureFrame(rec: Recording, frame: number, id = view.face): FrameFace {
	const labels = labelsOf(rec);
	const face = faceOf(rec, id);
	const faces = (labels.frames[frame] ??= {});
	return (faces[face.id] ??= { state: 'ok', fit: fitHere(rec, frame, face.id) });
}

/** The fit a frame is drawn with: a second face borrows its nearest own fit, else sits below the first. */
export function fitHere(rec: Recording, frame: number, id = view.face): Point[] {
	const labels = labelsOf(rec);
	const face = faceOf(rec, id);
	const first = labels.faces[0];
	if (face.id === first.id) return fitOf(labels, rec, frame, face.id);
	const own = labels.frames[frame]?.[face.id]?.fit;
	if (own) return own;
	let nearest: Point[] | null = null;
	let gap = Infinity;
	for (const [key, faces] of Object.entries(labels.frames)) {
		const fit = faces[face.id]?.fit;
		if (fit && Math.abs(Number(key) - frame) < gap) {
			gap = Math.abs(Number(key) - frame);
			nearest = fit;
		}
	}
	if (nearest) return nearest;
	const base = fitOf(labels, rec, frame, first.id);
	const step = labels.faces.indexOf(face);
	const down = Math.hypot(base[1][0] - base[3][0], base[1][1] - base[3][1]) * 1.05 * step;
	return base.map(([x, y]) => [x, y + down] as Point);
}

export function countOf(rec: Recording, id = view.face): number {
	const face = faceOf(rec, id);
	return face.count ?? face.arrows.length;
}

export function hasFace(rec: Recording, frame: number, id = view.face): boolean {
	return frameFace(rec, frame, id)?.state !== 'none';
}

export function faceDecided(rec: Recording, frame: number, id = view.face): boolean {
	return Boolean(frameFace(rec, frame, id));
}

export function arrowsPlaced(rec: Recording, id = view.face): boolean {
	const face = faceOf(rec, id);
	return face.empty || (face.arrows.length > 0 && face.arrows.length >= countOf(rec, id));
}

export function arrowsChecked(rec: Recording, frame: number, id = view.face): boolean {
	const face = faceOf(rec, id);
	if (face.empty || !hasFace(rec, frame, id)) return true;
	return face.placedOn === frame || Boolean(frameFace(rec, frame, id)?.arrowsOk);
}

/** The frames nocks are asked for: those already nocked, then the rest spread as far apart as they go. */
export function nockFrames(rec: Recording, id = view.face): number[] {
	if (!options.nocks) return [];
	const faced = rec.chosen.map((_, i) => i).filter((i) => hasFace(rec, i, id));
	const picked = new Set(faced.filter((i) => Object.keys(frameFace(rec, i, id)?.nocks ?? {}).length > 0));
	while (picked.size < Math.min(NOCK_FRAMES, faced.length)) {
		// The frame furthest from every one already picked, so the sweep is covered end to end.
		let best = faced[0];
		let far = -1;
		for (const i of faced) {
			if (picked.has(i)) continue;
			const gap = picked.size ? Math.min(...[...picked].map((p) => Math.abs(p - i))) : i === faced[0] ? Infinity : 0;
			if (gap > far) {
				far = gap;
				best = i;
			}
		}
		picked.add(best);
	}
	return [...picked].sort((a, b) => a - b);
}

/** The visible arrows of a frame still wanting a nock, or a say that it cannot be seen. */
export function nocksWanted(rec: Recording, frame: number, id = view.face): number[] {
	const nocks = frameFace(rec, frame, id)?.nocks ?? {};
	return arrowsOn(labelsOf(rec), frame, faceOf(rec, id).id)
		.filter((arrow) => !arrow.hidden && !(arrow.n in nocks))
		.map((arrow) => arrow.n);
}

export interface Progress {
	faces: number;
	checked: number;
	nocked: number;
	frames: number;
	nockGoal: number;
	done: boolean;
}

/** Progress over every face of the recording together. */
export function progressOf(rec: Recording): Progress {
	const total: Progress = { faces: 0, checked: 0, nocked: 0, frames: 0, nockGoal: 0, done: true };
	for (const face of labelsOf(rec).faces) {
		const id = face.id;
		const frames = rec.chosen.length;
		let faces = 0;
		let checked = 0;
		for (let i = 0; i < frames; i++) {
			if (faceDecided(rec, i, id)) faces += 1;
			if (arrowsPlaced(rec, id) && faceDecided(rec, i, id) && arrowsChecked(rec, i, id)) checked += 1;
		}
		const wanted = face.empty ? [] : nockFrames(rec, id);
		const nocked = wanted.filter((i) => nocksWanted(rec, i, id).length === 0).length;
		total.faces += faces;
		total.checked += checked;
		total.nocked += nocked;
		total.frames += frames;
		total.nockGoal += wanted.length;
		total.done &&= faces === frames && checked === frames && nocked === wanted.length;
	}
	return total;
}

/** The first thing this recording still wants, as a face, a step and a frame. */
export function nextTask(rec: Recording): { face: string; step: Step; frame: number } {
	const frames = rec.chosen.length;
	for (const { id } of labelsOf(rec).faces) {
		for (let i = 0; i < frames; i++) if (!faceDecided(rec, i, id)) return { face: id, step: 'face', frame: i };
		const face = faceOf(rec, id);
		if (!arrowsPlaced(rec, id)) return { face: id, step: 'arrows', frame: face.placedOn ?? bestFrame(rec, id) };
		for (let i = 0; i < frames; i++) if (!arrowsChecked(rec, i, id)) return { face: id, step: 'arrows', frame: i };
		if (!face.empty) for (const i of nockFrames(rec, id)) if (nocksWanted(rec, i, id).length) return { face: id, step: 'nocks', frame: i };
	}
	const first = labelsOf(rec).faces[0];
	return { face: first.id, step: 'score', frame: first.placedOn ?? 0 };
}

/** The frame to place arrows on: the face biggest in the picture and seen most squarely. */
export function bestFrame(rec: Recording, id = view.face): number {
	let best = 0;
	let bestScore = -1;
	rec.chosen.forEach((_, i) => {
		if (!hasFace(rec, i, id)) return;
		const fit = fitHere(rec, i, id);
		const across = Math.hypot(fit[0][0] - fit[2][0], fit[0][1] - fit[2][1]);
		const down = Math.hypot(fit[1][0] - fit[3][0], fit[1][1] - fit[3][1]);
		const score = Math.min(across, down) * (Math.min(across, down) / Math.max(across, down, 1));
		if (score > bestScore) {
			bestScore = score;
			best = i;
		}
	});
	return best;
}

/**
 * Makes another frame the one the arrows are placed on, for when an arrow is out of sight on the first.
 * Checked frames keep every arrow exactly where it was checked, by holding the old positions as their own.
 */
export function setReference(rec: Recording, frame: number, id = view.face): string | null {
	const face = faceOf(rec, id);
	const was = face.placedOn;
	if (was === null || was === frame) return null;
	if (!hasFace(rec, frame, id)) return 'This frame has no face.';
	if (frameFace(rec, frame, id)?.hidden?.length) return 'Show every arrow on this frame first: the reference frame has them all in sight.';
	const labels = labelsOf(rec);
	const old = face.arrows.map((a) => ({ ...a }));
	const next = arrowsOn(labels, frame, face.id).map(({ n, x, y }) => ({ n, x, y }));
	for (const [key, faces] of Object.entries(labels.frames)) {
		const here = faces[face.id];
		const i = Number(key);
		if (!here || here.state === 'none' || i === frame) continue;
		if (!here.arrowsOk && i !== was) continue;
		for (const arrow of old) {
			const now = next.find((a) => a.n === arrow.n)!;
			if (here.moved?.[arrow.n] || (now.x === arrow.x && now.y === arrow.y)) continue;
			here.moved = { ...(here.moved ?? {}), [arrow.n]: { x: arrow.x, y: arrow.y } };
		}
	}
	const target = ensureFrame(rec, frame, id);
	delete target.moved;
	target.arrowsOk = true;
	ensureFrame(rec, was, id).arrowsOk = true;
	face.arrows = next;
	face.placedOn = frame;
	return null;
}

/** Another face on the boss, starting below the last one, as the spots of a three spot sit. */
export function addFace(rec: Recording): string {
	const faces = labelsOf(rec).faces;
	const id = 'abcdefghij'.split('').find((c) => !faces.some((f) => f.id === c)) ?? `f${faces.length}`;
	const like = faces[faces.length - 1];
	faces.push({ id, type: like.type, empty: false, ...(like.count ? { count: like.count } : {}), arrows: [], placedOn: null });
	return id;
}

export function removeFace(rec: Recording, id: string) {
	const labels = labelsOf(rec);
	if (labels.faces[0].id === id) return;
	labels.faces = labels.faces.filter((f) => f.id !== id);
	for (const faces of Object.values(labels.frames)) delete faces[id];
}

/** Hides or shows an arrow from this frame on, up to the next frame already checked. */
export function setHidden(rec: Recording, frame: number, n: number, hidden: boolean) {
	for (let i = frame; i < rec.chosen.length; i++) {
		if (!hasFace(rec, i)) continue;
		if (i !== frame && (arrowsChecked(rec, i) || faceOf(rec).placedOn === i)) break;
		const here = ensureFrame(rec, i);
		const list = new Set(here.hidden ?? []);
		if (hidden) list.add(n);
		else list.delete(n);
		here.hidden = [...list].sort((a, b) => a - b);
		if (here.hidden.length === 0) delete here.hidden;
		if (here.nocks && hidden) delete here.nocks[n];
	}
}

/** Writes the recording a moment after it last changed, whole, so a drag is not a write per event. */
export class Saver {
	state = $state<'idle' | 'saving' | 'saved' | 'failed' | 'readonly'>('idle');
	private timer: ReturnType<typeof setTimeout> | null = null;
	private queued = new Map<string, Labels>();

	constructor(private readonly readOnly: () => boolean) {}

	soon(rec: Recording) {
		if (this.readOnly()) {
			this.state = 'readonly';
			return;
		}
		this.queued.set(rec.video, $state.snapshot(labelsOf(rec)) as Labels);
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.flush(), 400);
	}

	async flush() {
		this.timer = null;
		const batch = [...this.queued];
		this.queued.clear();
		if (batch.length === 0) return;
		this.state = 'saving';
		try {
			for (const [video, labels] of batch) {
				const response = await fetch(`/__label/labels/${encodeURIComponent(video)}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(labels)
				});
				if (!response.ok) throw new Error(await response.text());
			}
			this.state = 'saved';
		} catch {
			for (const [video, labels] of batch) if (!this.queued.has(video)) this.queued.set(video, labels);
			this.state = 'failed';
		}
	}
}
