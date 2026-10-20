<script lang="ts">
	import { scoreAt } from '$lib/domain/rounds/geometry';
	import { WA_10_RING } from '$lib/domain/rounds/seed';
	import { arrowsOn, edgeOf, homography, project, turned, type FrameFace, type Point } from './format';
	import { centreOf, fitToTaps, guessRing, moved, pulled, recentred, ringsOf, snapToEdge, toFace, toImage, type Tap } from './fit';
	import { ensureFrame, faceOf, fitHere, frameFace, labelsOf, options, type Recording, type Step } from './session.svelte';

	export interface Guess {
		x: number;
		y: number;
	}

	let {
		rec,
		frame,
		step,
		image,
		pixels,
		guesses = $bindable([]),
		selected = $bindable(null),
		target = $bindable(null),
		taps = $bindable([]),
		tapRing = $bindable(null),
		onchange,
		onnock
	}: {
		rec: Recording;
		frame: number;
		step: Step;
		image: HTMLImageElement | null;
		pixels: ImageData | null;
		guesses?: Guess[];
		selected?: number | null;
		target?: number | null;
		taps?: Tap[];
		/** The ring taps go to; null until the first tap guesses it. */
		tapRing?: number | null;
		onchange: () => void;
		onnock?: () => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let box = $state<HTMLDivElement | null>(null);
	let width = $state(0);
	let height = $state(0);
	let scale = $state(1);
	let ox = $state(0);
	let oy = $state(0);
	let pointer = $state<{ x: number; y: number } | null>(null);
	let pressed = $state(false);
	/** What a press here would do, said by the cursor before anything is pressed. */
	let cursor = $state('crosshair');
	/** The same, in words, as the picture's tooltip. */
	let hint = $state('');
	let spaceHeld = false;
	/** The fit as the taps began, which every tap refits from, so a bad tap can be taken back cleanly. */
	let tapPrior: Point[] | null = null;

	const face = $derived(faceOf(rec));
	const edge = $derived(edgeOf(face.type));
	const placing = $derived(step === 'arrows' && (face.placedOn === null || face.placedOn === frame));

	/** The whole picture in the window, which is where every frame starts. */
	export function fitView() {
		if (!image || width === 0) return;
		scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
		ox = (width - image.naturalWidth * scale) / 2;
		oy = (height - image.naturalHeight * scale) / 2;
	}

	/** Closer onto the face, which is what every judgement here is about. */
	export function fitFace() {
		if (!image || width === 0) return;
		const fit = fitHere(rec, frame);
		const [cx, cy] = centreOf(fit);
		const r = Math.max(...fit.map(([x, y]) => Math.hypot(x - cx, y - cy))) * 1.25;
		scale = Math.min(width / (2 * r), height / (2 * r), (4 * width) / image.naturalWidth);
		ox = width / 2 - cx * scale;
		oy = height / 2 - cy * scale;
	}

	export function zoom(by: number, at?: { x: number; y: number }) {
		const sx = at?.x ?? width / 2;
		const sy = at?.y ?? height / 2;
		const ix = (sx - ox) / scale;
		const iy = (sy - oy) / scale;
		scale = Math.max(0.05, Math.min(40, scale * by));
		ox = sx - ix * scale;
		oy = sy - iy * scale;
	}

	export function setSpace(held: boolean) {
		spaceHeld = held;
	}

	/** Lets go of a held press in the nocks step as if it never happened, putting a dragged nock back. */
	export function cancelPress() {
		if (step !== 'nocks' || !drag) return false;
		if (drag.kind === 'nock' && drag.moving) Object.assign(ensureFrame(rec, frame), drag.before);
		drag = null;
		pressed = false;
		nockDragged = null;
		return true;
	}

	/** Taps begin again from the fit as it stands. */
	export function clearTaps() {
		taps = [];
		tapRing = null;
		tapPrior = null;
	}

	export function retap(ring: number) {
		tapRing = ring;
		taps = taps.map((t) => ({ ...t, r: ring }));
		refit();
	}

	export function undoTap() {
		taps = taps.slice(0, -1);
		if (taps.length === 0) tapRing = null;
		refit();
	}

	$effect(() => {
		if (!box) return;
		const observer = new ResizeObserver(() => {
			const first = width === 0;
			width = box!.clientWidth;
			height = box!.clientHeight;
			if (first) fitFace();
		});
		observer.observe(box);
		return () => observer.disconnect();
	});

	$effect(() => {
		draw();
	});

	const screen = (x: number, y: number) => ({ x: x * scale + ox, y: y * scale + oy });

	function draw() {
		if (!canvas) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		const c = canvas.getContext('2d');
		if (!c) return;
		c.setTransform(ratio, 0, 0, ratio, 0, 0);
		c.clearRect(0, 0, width, height);
		if (!image) return;
		c.imageSmoothingEnabled = scale < 2;
		c.drawImage(image, ox, oy, image.naturalWidth * scale, image.naturalHeight * scale);

		const here = frameFace(rec, frame);
		if (here?.state === 'none') {
			c.fillStyle = 'rgba(0,0,0,0.45)';
			c.fillRect(0, 0, width, height);
			return;
		}
		// The other faces of a three spot, faint, so the one being worked on is never mistaken for them.
		for (const other of labelsOf(rec).faces) {
			if (other.id === face.id || frameFace(rec, frame, other.id)?.state === 'none') continue;
			c.save();
			c.globalAlpha = 0.35;
			for (const ring of ringsOf(other.type)) {
				ringPath(c, fitHere(rec, frame, other.id), ring.r);
				c.strokeStyle = '#ffffff';
				c.lineWidth = 1;
				c.stroke();
			}
			c.restore();
		}
		const fit = fitHere(rec, frame);
		drawRings(c, fit, here?.state === 'ok');
		if (step === 'face') {
			drawCentre(c, fit);
			drawTaps(c);
		}
		if (step === 'arrows' || step === 'nocks' || step === 'score') drawArrows(c, fit);
		if (pressed && pointer && step !== 'score') drawLoupe(c, pointer);
	}

	function ringPath(c: CanvasRenderingContext2D, fit: Point[], r: number) {
		const h = homography(fit);
		if (!h) return;
		c.beginPath();
		for (let i = 0; i <= 96; i++) {
			const a = (i / 96) * Math.PI * 2;
			const p = project(h, Math.cos(a) * r, Math.sin(a) * r);
			const s = screen(p.x, p.y);
			i === 0 ? c.moveTo(s.x, s.y) : c.lineTo(s.x, s.y);
		}
		c.closePath();
	}

	function drawRings(c: CanvasRenderingContext2D, fit: Point[], checked: boolean) {
		const colour = checked ? '#3ddc84' : '#f2b23a';
		c.save();
		c.setLineDash(checked ? [] : [6, 5]);
		for (const ring of ringsOf(face.type)) {
			ringPath(c, fit, ring.r);
			c.strokeStyle = 'rgba(0,0,0,0.55)';
			c.lineWidth = 3;
			c.stroke();
			c.strokeStyle = ring.r === 0.2 ? '#ffe14d' : colour;
			c.lineWidth = ring.r === edge || ring.r === 0.2 ? 2 : 1;
			c.stroke();
		}
		c.restore();
		// The knob says which way up the face's coordinates are, and turns them when dragged.
		const knob = toImage(fit, 0, -edge * 1.12);
		const top = toImage(fit, 0, -edge);
		if (knob && top) {
			const k = screen(knob.x, knob.y);
			const t = screen(top.x, top.y);
			c.strokeStyle = colour;
			c.lineWidth = 2;
			c.beginPath();
			c.moveTo(t.x, t.y);
			c.lineTo(k.x, k.y);
			c.stroke();
			c.fillStyle = colour;
			c.beginPath();
			c.arc(k.x, k.y, 7, 0, Math.PI * 2);
			c.fill();
			c.fillStyle = '#1b1b1b';
			c.font = '600 10px system-ui, sans-serif';
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.fillText('↻', k.x, k.y + 0.5);
		}
	}

	function drawCentre(c: CanvasRenderingContext2D, fit: Point[]) {
		const [x, y] = centreOf(fit);
		const s = screen(x, y);
		c.fillStyle = '#ff4fd8';
		c.strokeStyle = '#ffffff';
		c.lineWidth = 2;
		c.beginPath();
		c.arc(s.x, s.y, 6, 0, Math.PI * 2);
		c.fill();
		c.stroke();
	}

	function drawTaps(c: CanvasRenderingContext2D) {
		for (const tap of taps) {
			const s = screen(tap.x, tap.y);
			c.fillStyle = '#ff4fd8';
			c.strokeStyle = '#ffffff';
			c.lineWidth = 1.5;
			c.beginPath();
			c.arc(s.x, s.y, 4, 0, Math.PI * 2);
			c.fill();
			c.stroke();
		}
	}

	function drawArrows(c: CanvasRenderingContext2D, fit: Point[]) {
		const h = homography(fit);
		if (!h) return;
		const here = frameFace(rec, frame);
		const checked = face.placedOn === frame || here?.arrowsOk;
		for (const guess of guesses) {
			const p = project(h, guess.x, guess.y);
			const s = screen(p.x, p.y);
			c.save();
			c.setLineDash([4, 3]);
			c.fillStyle = 'rgba(242,178,58,0.25)';
			c.strokeStyle = '#f2b23a';
			c.lineWidth = 2;
			c.beginPath();
			c.arc(s.x, s.y, 10, 0, Math.PI * 2);
			c.fill();
			c.stroke();
			c.restore();
			c.fillStyle = '#ffffff';
			c.strokeStyle = 'rgba(0,0,0,0.7)';
			c.lineWidth = 3;
			c.font = '700 12px system-ui, sans-serif';
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.strokeText('?', s.x, s.y);
			c.fillText('?', s.x, s.y);
		}
		aimFrom = null;
		for (const arrow of arrowsOn(labelsOf(rec), frame, face.id)) {
			const p = project(h, arrow.x, arrow.y);
			const s = screen(p.x, p.y);
			const nock = options.nocks ? here?.nocks?.[arrow.n] : null;
			// The shaft as it would be with the nock under the pointer, while the button is held.
			const aimed = step === 'nocks' && pressed && pointer && target === arrow.n && nockDragged === null;
			if (aimed) {
				aimFrom = s;
				c.save();
				c.setLineDash([6, 4]);
				c.strokeStyle = '#ff4fd8';
				c.lineWidth = 2;
				c.beginPath();
				c.moveTo(s.x, s.y);
				c.lineTo(pointer!.x, pointer!.y);
				c.stroke();
				c.restore();
			}
			if (nock && !aimed) {
				const n = screen(nock[0], nock[1]);
				const cut = here?.nockCut?.includes(arrow.n);
				c.strokeStyle = nockDragged === arrow.n ? '#ff4fd8' : 'rgba(80,200,255,0.9)';
				c.lineWidth = 2;
				c.beginPath();
				c.moveTo(s.x, s.y);
				c.lineTo(n.x, n.y);
				c.stroke();
				// Hollow where the shaft runs off the picture, so it reads as a point on it rather than its nock.
				c.fillStyle = 'rgba(80,200,255,1)';
				if (cut) c.strokeRect(n.x - 5, n.y - 5, 10, 10);
				else c.fillRect(n.x - 4, n.y - 4, 8, 8);
			}
			const isTarget = step === 'nocks' && target === arrow.n;
			const isSelected = selected === arrow.n || isTarget;
			c.save();
			if (!isSelected && !options.rings) c.globalAlpha = 0;
			else if (arrow.hidden) {
				c.globalAlpha = 0.45;
				c.setLineDash([2, 4]);
			} else if (!checked && !arrow.moved) {
				c.setLineDash([5, 3]);
			}
			c.strokeStyle = 'rgba(0,0,0,0.6)';
			c.lineWidth = 4;
			c.beginPath();
			c.arc(s.x, s.y, isTarget ? 20 : isSelected ? 11 : 8, 0, Math.PI * 2);
			c.stroke();
			c.strokeStyle = isSelected ? '#ff4fd8' : '#3ddc84';
			c.lineWidth = isTarget ? 3 : 2;
			c.stroke();
			// The large ring is for spotting the arrow, the small one for seeing exactly where it is.
			if (isTarget) {
				c.beginPath();
				c.arc(s.x, s.y, 11, 0, Math.PI * 2);
				c.strokeStyle = 'rgba(0,0,0,0.6)';
				c.lineWidth = 4;
				c.stroke();
				c.strokeStyle = '#ff4fd8';
				c.lineWidth = 2;
				c.stroke();
			}
			c.restore();
			if (!options.tags) continue;
			// The arrow's number on a dark tag, then its score in the ring's own colour.
			const zone = scoreAt(WA_10_RING, arrow.x, arrow.y);
			c.globalAlpha = arrow.hidden ? 0.5 : 1;
			c.font = '700 11px system-ui, sans-serif';
			c.textBaseline = 'middle';
			c.textAlign = 'center';
			const tag = `#${arrow.n + 1}`;
			const tw = c.measureText(tag).width + 8;
			c.fillStyle = 'rgba(20,20,20,0.9)';
			c.beginPath();
			c.roundRect(s.x - 9 - tw, s.y - 21, tw, 16, 3);
			c.fill();
			c.fillStyle = '#fff';
			c.fillText(tag, s.x - 9 - tw / 2, s.y - 12.5);
			const w = c.measureText(zone.label).width + 10;
			c.fillStyle = zone.countsAsHit ? zone.color : '#555';
			c.beginPath();
			c.roundRect(s.x + 9, s.y - 21, w, 16, 8);
			c.fill();
			c.strokeStyle = 'rgba(0,0,0,0.5)';
			c.lineWidth = 1;
			c.stroke();
			c.fillStyle = zone.countsAsHit ? zone.strokeColor : '#fff';
			c.fillText(zone.label, s.x + 9 + w / 2, s.y - 12.5);
			c.globalAlpha = 1;
		}
	}

	/** Where the shaft being aimed starts on screen, so the loupe can keep off it. */
	let aimFrom: { x: number; y: number } | null = null;

	function nearSegment(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
		return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
	}

	function drawLoupe(c: CanvasRenderingContext2D, at: { x: number; y: number }) {
		if (!image) return;
		const r = 70;
		const zoomBy = 4;
		let lx = at.x < r * 2.4 ? at.x + r * 1.4 : at.x - r * 1.4;
		const ly = at.y < r * 2.4 ? at.y + r * 1.4 : at.y - r * 1.4;
		if (aimFrom && nearSegment(lx, ly, aimFrom, at) < r) lx = at.x * 2 - lx;
		const ix = (at.x - ox) / scale;
		const iy = (at.y - oy) / scale;
		const k = scale * zoomBy;
		c.save();
		c.beginPath();
		c.arc(lx, ly, r, 0, Math.PI * 2);
		c.clip();
		c.fillStyle = '#000';
		c.fillRect(lx - r, ly - r, r * 2, r * 2);
		c.imageSmoothingEnabled = false;
		c.drawImage(image, lx - ix * k, ly - iy * k, image.naturalWidth * k, image.naturalHeight * k);
		c.restore();
		c.strokeStyle = '#ffffff';
		c.lineWidth = 2;
		c.beginPath();
		c.arc(lx, ly, r, 0, Math.PI * 2);
		c.stroke();
		c.strokeStyle = '#ff4fd8';
		c.lineWidth = 1;
		c.beginPath();
		c.moveTo(lx - 10, ly);
		c.lineTo(lx + 10, ly);
		c.moveTo(lx, ly - 10);
		c.lineTo(lx, ly + 10);
		c.stroke();
	}

	type Drag =
		| { kind: 'pending'; sx: number; sy: number; button: number }
		| { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
		| { kind: 'move'; start: Point[]; ix: number; iy: number }
		| { kind: 'pull'; start: Point[]; angle: number; r: number; ix: number; iy: number }
		| { kind: 'turn'; start: Point[]; from: number }
		| { kind: 'centre'; start: Point[] }
		| { kind: 'arrow'; n: number }
		| { kind: 'nock'; n: number; moving: boolean; before: Pick<FrameFace, 'nocks' | 'nockCut'> }
		| { kind: 'aim' };
	let drag: Drag | null = null;
	let downAt: { x: number; y: number } | null = null;
	/** The arrow whose nock is being dragged, so it is drawn as the one moving. */
	let nockDragged = $state<number | null>(null);

	/** The nock under the pointer on this frame, within a fingertip on the screen. */
	function nockAt(p: { x: number; y: number }): number | null {
		let best: number | null = null;
		let near = 12;
		for (const [n, nock] of Object.entries(frameFace(rec, frame)?.nocks ?? {})) {
			if (!nock) continue;
			const s = screen(nock[0], nock[1]);
			const d = Math.hypot(s.x - p.x, s.y - p.y);
			if (d < near) {
				near = d;
				best = Number(n);
			}
		}
		return best;
	}

	/**
	 * Puts an arrow's nock point, kept inside the picture. A point at its edge is where the shaft runs off
	 * it: still on the shaft, which is all a shaft's line needs, but marked so it is never read as a nock.
	 */
	function setNock(n: number, x: number, y: number) {
		if (!image) return;
		const w = image.naturalWidth;
		const h = image.naturalHeight;
		let px = x;
		let py = y;
		// Outside the picture, brought back along the shaft from its tip, where the shaft leaves the edge.
		const fit = homography(fitHere(rec, frame));
		const arrow = arrowsOn(labelsOf(rec), frame, face.id).find((a) => a.n === n);
		if (fit && arrow && (px < 0 || py < 0 || px > w - 1 || py > h - 1)) {
			const tip = project(fit, arrow.x, arrow.y);
			let along = 1;
			const dx = px - tip.x;
			const dy = py - tip.y;
			if (px < 0 && dx < 0) along = Math.min(along, -tip.x / dx);
			if (px > w - 1 && dx > 0) along = Math.min(along, (w - 1 - tip.x) / dx);
			if (py < 0 && dy < 0) along = Math.min(along, -tip.y / dy);
			if (py > h - 1 && dy > 0) along = Math.min(along, (h - 1 - tip.y) / dy);
			px = tip.x + dx * Math.max(0, along);
			py = tip.y + dy * Math.max(0, along);
		}
		px = Math.max(0, Math.min(w - 1, px));
		py = Math.max(0, Math.min(h - 1, py));
		const margin = Math.min(w, h) * 0.015;
		const cut = px < margin || py < margin || px > w - 1 - margin || py > h - 1 - margin;
		const here = ensureFrame(rec, frame);
		here.nocks = { ...(here.nocks ?? {}), [n]: [px, py] };
		const others = (here.nockCut ?? []).filter((c) => c !== n);
		if (cut) here.nockCut = [...others, n];
		else if (others.length) here.nockCut = others;
		else delete here.nockCut;
	}

	function local(event: PointerEvent) {
		const rect = canvas!.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	const toImg = (p: { x: number; y: number }) => ({ x: (p.x - ox) / scale, y: (p.y - oy) / scale });

	/** The arrow under the pointer, within a fingertip on the screen. */
	function arrowAt(p: { x: number; y: number }): number | null {
		const fit = fitHere(rec, frame);
		const h = homography(fit);
		if (!h) return null;
		let best: number | null = null;
		let near = 14;
		for (const arrow of arrowsOn(labelsOf(rec), frame, face.id)) {
			const q = project(h, arrow.x, arrow.y);
			const s = screen(q.x, q.y);
			const d = Math.hypot(s.x - p.x, s.y - p.y);
			if (d < near) {
				near = d;
				best = arrow.n;
			}
		}
		return best;
	}

	function guessAt(p: { x: number; y: number }): number {
		const h = homography(fitHere(rec, frame));
		if (!h) return -1;
		return guesses.findIndex((g) => {
			const q = project(h, g.x, g.y);
			const s = screen(q.x, q.y);
			return Math.hypot(s.x - p.x, s.y - p.y) < 12;
		});
	}

	function onKnob(p: { x: number; y: number }): boolean {
		const knob = toImage(fitHere(rec, frame), 0, -edge * 1.12);
		if (!knob) return false;
		const s = screen(knob.x, knob.y);
		return Math.hypot(s.x - p.x, s.y - p.y) < 12;
	}

	function onCentre(p: { x: number; y: number }): boolean {
		const [x, y] = centreOf(fitHere(rec, frame));
		const s = screen(x, y);
		return Math.hypot(s.x - p.x, s.y - p.y) < 12;
	}

	const RESIZE = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

	/** The cursor for what a press at this point would do. */
	function intent(p: { x: number; y: number }): string {
		if (spaceHeld || step === 'score' || frameFace(rec, frame)?.state === 'none') return 'grab';
		if ((step === 'face' || step === 'arrows') && onKnob(p)) return 'grab';
		if (step === 'arrows') {
			if (arrowAt(p) !== null) return 'grab';
			if (placing) return guessAt(p) >= 0 ? 'pointer' : 'crosshair';
			return 'default';
		}
		if (step === 'nocks') return nockAt(p) !== null ? 'grab' : arrowAt(p) !== null ? 'pointer' : 'crosshair';
		if (onCentre(p)) return 'all-scroll';
		const fit = fitHere(rec, frame);
		const i = toImg(p);
		const q = toFace(fit, i.x, i.y);
		const r = q ? Math.hypot(q.x, q.y) : Infinity;
		if (r < edge * 0.85) return 'move';
		if (r < edge * 1.25) {
			const [cx, cy] = centreOf(fit);
			const angle = Math.atan2(i.y - cy, i.x - cx);
			return RESIZE[((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4];
		}
		return 'crosshair';
	}

	function hintFor(p: { x: number; y: number }, now: string): string {
		if (now === 'grab' && onKnob(p)) return 'Drag to turn';
		if (now === 'grab' && step === 'arrows') return arrowAt(p) !== null ? 'Drag to move, click to pick' : 'Drag to move the picture';
		if (now === 'all-scroll') return 'Drag to adjust the orientation';
		if (now === 'move') return 'Drag to move, click a ring edge to fit';
		if (now.endsWith('-resize')) return 'Drag to stretch, click to fit';
		if (step === 'face') return 'Click a ring edge to fit';
		if (step === 'arrows' && placing) return now === 'pointer' ? 'Click to take this guess' : 'Click the impact (hold to aim)';
		if (step === 'nocks') {
			if (now === 'grab') return 'Drag to move this nock';
			return now === 'pointer' ? 'Click to pick this arrow' : 'Click the pink arrow’s nock, or where its shaft leaves the picture';
		}
		return '';
	}

	function down(event: PointerEvent) {
		if (!canvas || !image) return;
		canvas.setPointerCapture(event.pointerId);
		const p = local(event);
		pointer = p;
		downAt = p;
		if (event.button === 1 || event.button === 2 || spaceHeld) {
			drag = { kind: 'pan', sx: p.x, sy: p.y, ox, oy };
			return;
		}
		if (frameFace(rec, frame)?.state === 'none' || step === 'score') {
			drag = { kind: 'pan', sx: p.x, sy: p.y, ox, oy };
			return;
		}
		const fit = fitHere(rec, frame);
		if (step === 'face' && onCentre(p)) {
			drag = { kind: 'centre', start: fit };
			cursor = 'all-scroll';
			return;
		}
		if ((step === 'face' || step === 'arrows') && onKnob(p)) {
			const q = toFace(fit, toImg(p).x, toImg(p).y);
			drag = { kind: 'turn', start: fit, from: q ? Math.atan2(q.y, q.x) : 0 };
			return;
		}
		if (step === 'arrows') {
			const n = arrowAt(p);
			if (n !== null) {
				selected = n;
				drag = { kind: 'arrow', n };
				return;
			}
			if (placing) {
				pressed = true;
				drag = { kind: 'aim' };
				return;
			}
		}
		if (step === 'nocks') {
			// A nock is only taken hold of once the pointer moves: a click still places the pink arrow's nock,
			// which in a tight group often lands by another one.
			const held = nockAt(p);
			if (held !== null) {
				pressed = true;
				const here = frameFace(rec, frame);
				drag = { kind: 'nock', n: held, moving: false, before: { nocks: here?.nocks, nockCut: here?.nockCut } };
				return;
			}
			const n = arrowAt(p);
			if (n !== null) {
				target = n;
				drag = null;
				return;
			}
			pressed = true;
			drag = { kind: 'aim' };
			return;
		}
		drag = { kind: 'pending', sx: p.x, sy: p.y, button: event.button };
		if (step === 'face') pressed = true;
	}

	function move(event: PointerEvent) {
		const p = local(event);
		pointer = p;
		if (!drag) {
			cursor = intent(p);
			hint = hintFor(p, cursor);
			return;
		}
		if (drag.kind === 'pan' || drag.kind === 'arrow' || drag.kind === 'turn' || drag.kind === 'nock') cursor = 'grabbing';
		const i = toImg(p);
		if (drag.kind === 'pending') {
			if (Math.hypot(p.x - drag.sx, p.y - drag.sy) < 5) return;
			pressed = false;
			const fit = fitHere(rec, frame);
			const start = toImg({ x: drag.sx, y: drag.sy });
			const q = toFace(fit, start.x, start.y);
			const r = q ? Math.hypot(q.x, q.y) : Infinity;
			if (step === 'face' && r < edge * 0.85) drag = { kind: 'move', start: fit, ix: start.x, iy: start.y };
			else if (step === 'face' && r < edge * 1.25 && q) {
				drag = { kind: 'pull', start: fit, angle: Math.atan2(q.y, q.x), r: edge, ix: start.x, iy: start.y };
			} else drag = { kind: 'pan', sx: drag.sx, sy: drag.sy, ox, oy };
		}
		if (drag.kind === 'pan') {
			ox = drag.ox + p.x - drag.sx;
			oy = drag.oy + p.y - drag.sy;
		} else if (drag.kind === 'centre') {
			const q = toFace(drag.start, i.x, i.y);
			if (q) setFit(recentred(drag.start, q.x, q.y, edge));
		} else if (drag.kind === 'move') {
			setFit(moved(drag.start, i.x - drag.ix, i.y - drag.iy));
		} else if (drag.kind === 'pull') {
			setFit(pulled(drag.start, drag.r, drag.angle, i.x - drag.ix, i.y - drag.iy));
		} else if (drag.kind === 'turn') {
			const q = toFace(drag.start, i.x, i.y);
			if (q) setFit(turned(drag.start, Math.atan2(q.y, q.x) - drag.from));
		} else if (drag.kind === 'nock') {
			if (!drag.moving && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
			if (!drag.moving) {
				drag.moving = true;
				target = drag.n;
				nockDragged = drag.n;
			}
			setNock(drag.n, i.x, i.y);
		} else if (drag.kind === 'arrow') {
			if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
			pressed = true;
			placeArrow(drag.n, i.x, i.y);
		}
	}

	function up(event: PointerEvent) {
		const p = local(event);
		const was = drag;
		drag = null;
		pressed = false;
		nockDragged = null;
		if (!was) return;
		const i = toImg(p);
		const still = downAt ? Math.hypot(p.x - downAt.x, p.y - downAt.y) < 5 : false;
		if (was.kind === 'pending' && step === 'face' && still) addTap(i.x, i.y);
		else if (was.kind === 'aim' && step === 'arrows') {
			const g = still ? guessAt(p) : -1;
			if (g >= 0) addArrow(guesses[g].x, guesses[g].y, g);
			else {
				const q = toFace(fitHere(rec, frame), i.x, i.y);
				if (q) addArrow(q.x, q.y, -1);
			}
		} else if ((was.kind === 'aim' || (was.kind === 'nock' && !was.moving)) && step === 'nocks' && target !== null) {
			setNock(target, i.x, i.y);
			onchange();
			onnock?.();
		} else if (was.kind === 'nock') {
			// Moving a nock only corrects it, so the step stays on this arrow rather than moving on.
			onchange();
		} else if (was.kind === 'arrow' && still) {
			// A click on an arrow only picks it.
		} else if (was.kind === 'move' || was.kind === 'centre' || was.kind === 'pull' || was.kind === 'turn' || was.kind === 'arrow') {
			onchange();
		}
	}

	function setFit(fit: Point[]) {
		const here = ensureFrame(rec, frame);
		here.state = 'ok';
		here.fit = fit;
		taps = [];
		tapPrior = null;
	}

	function addTap(x: number, y: number) {
		const fit = tapPrior ?? fitHere(rec, frame);
		tapPrior = fit;
		const [sx, sy] = pixels ? snapToEdge(pixels, fit, x, y) : [x, y];
		if (tapRing === null) tapRing = guessRing(fit, sx, sy, face.type);
		taps = [...taps, { x: sx, y: sy, r: tapRing }];
		refit();
	}

	function refit() {
		if (!tapPrior) return;
		const fit = taps.length >= 3 ? fitToTaps(tapPrior, taps) : tapPrior;
		const here = ensureFrame(rec, frame);
		here.state = 'ok';
		here.fit = fit;
		onchange();
	}

	function addArrow(x: number, y: number, guess: number) {
		const label = face;
		const n = label.arrows.reduce((m, a) => Math.max(m, a.n + 1), 0);
		label.arrows.push({ n, x, y });
		label.placedOn = frame;
		ensureFrame(rec, frame).arrowsOk = true;
		if (guess >= 0) guesses = guesses.filter((_, k) => k !== guess);
		selected = n;
		onchange();
	}

	function placeArrow(n: number, x: number, y: number) {
		const q = toFace(fitHere(rec, frame), x, y);
		if (!q) return;
		if (face.placedOn === frame) {
			const arrow = face.arrows.find((a) => a.n === n);
			if (arrow) {
				arrow.x = q.x;
				arrow.y = q.y;
			}
		} else {
			const here = ensureFrame(rec, frame);
			here.moved = { ...(here.moved ?? {}), [n]: { x: q.x, y: q.y } };
		}
	}

	function wheel(event: WheelEvent) {
		event.preventDefault();
		zoom(Math.exp(-event.deltaY * 0.0015), local(event as unknown as PointerEvent));
	}
</script>

<div bind:this={box} class="relative h-full w-full overflow-hidden bg-black select-none">
	<canvas
		bind:this={canvas}
		class="absolute inset-0 h-full w-full touch-none"
		style="cursor: {cursor}"
		title={hint}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={() => ((drag = null), (pressed = false), (nockDragged = null))}
		onpointerleave={() => (pointer = drag ? pointer : null)}
		onwheel={wheel}
		oncontextmenu={(event) => event.preventDefault()}
	></canvas>
</div>
