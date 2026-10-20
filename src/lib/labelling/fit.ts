import { RINGS, anchorsAt, edgeOf, homography, homographyFrom, invert, project, type Point } from './format';

/** Where the gold sits in the picture. */
export function centreOf(fit: Point[]): Point {
	const h = homography(fit);
	if (!h) return fit[0];
	const p = project(h, 0, 0);
	return [p.x, p.y];
}

/** The face's radius in picture pixels, averaged round the four anchors. */
export function radiusOf(fit: Point[]): number {
	const [cx, cy] = centreOf(fit);
	return fit.reduce((sum, [x, y]) => sum + Math.hypot(x - cx, y - cy), 0) / 4;
}

/** A picture point in this fit's face coordinates. */
export function toFace(fit: Point[], x: number, y: number): { x: number; y: number } | null {
	const h = homography(fit);
	const inverse = h && invert(h);
	return inverse ? project(inverse, x, y) : null;
}

export function toImage(fit: Point[], x: number, y: number): { x: number; y: number } | null {
	const h = homography(fit);
	return h ? project(h, x, y) : null;
}

export function moved(fit: Point[], dx: number, dy: number): Point[] {
	return fit.map(([x, y]) => [x + dx, y + dy] as Point);
}

/** The middle moved to face point (x, y) with the ring at `edge` held where it is: the perspective of the fit. */
export function recentred(start: Point[], x: number, y: number, edge: number): Point[] {
	const h = homography(start);
	if (!h) return start;
	const a = Math.min(0.9, Math.hypot(x, y) / edge);
	if (a < 1e-6) return start;
	const cos = Math.cos(Math.atan2(y, x));
	const sin = Math.sin(Math.atan2(y, x));
	const lean = Math.sqrt(1 - a * a);
	// The projective map of the disc onto itself that takes its middle to a point inside it.
	return anchorsAt(1).map(([u, v]) => {
		const px = (u * cos + v * sin) / edge;
		const py = (-u * sin + v * cos) / edge;
		const d = 1 + a * px;
		const qx = ((px + a) / d) * edge;
		const qy = ((py * lean) / d) * edge;
		const p = project(h, qx * cos - qy * sin, qx * sin + qy * cos);
		return [p.x, p.y] as Point;
	});
}

const AROUND = 24;

/** The rim at radius `r` pulled at face angle `angle` by a picture offset, the far side staying put. */
export function pulled(start: Point[], r: number, angle: number, dx: number, dy: number): Point[] {
	const h = homography(start);
	if (!h) return start;
	const face: Point[] = [];
	const image: Point[] = [];
	for (let k = 0; k < AROUND; k++) {
		const phi = (k / AROUND) * Math.PI * 2;
		const u = r * Math.cos(phi);
		const v = r * Math.sin(phi);
		const p = project(h, u, v);
		const w = Math.max(0, Math.cos(phi - angle)) ** 2;
		face.push([u, v]);
		image.push([p.x + dx * w, p.y + dy * w]);
	}
	return anchorsFrom(face, image) ?? start;
}

function anchorsFrom(face: Point[], image: Point[]): Point[] | null {
	const h = homographyFrom(face, image);
	if (!h) return null;
	return anchorsAt(1).map(([u, v]) => {
		const p = project(h, u, v);
		return [p.x, p.y] as Point;
	});
}

export interface Tap {
	x: number;
	y: number;
	/** The ring boundary it sits on, in face radii. */
	r: number;
}

/** The fit moved so every tap lies on its ring. Taps settle centre and shape; the turn and perspective stay. */
export function fitToTaps(prior: Point[], taps: Tap[]): Point[] {
	const start = homography(prior);
	if (taps.length < 3 || !start) return prior;
	const scale = radiusOf(prior);
	// Centre and shape are what taps settle; perspective and the turn are not visible in circles.
	const a0 = [start[0][2], start[1][2], start[0][0], start[0][1], start[1][0], start[1][1], start[2][0], start[2][1]];
	const steps = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1e-5, 1e-5];
	const turn = (a: number[]) => Math.atan2(a[4] - a[3], a[2] + a[5]);
	const residuals = (a: number[]): number[] => {
		const h = matrix(a);
		const inverse = invert(h);
		if (!inverse) return new Array(taps.length + 9).fill(1e6);
		const out = taps.map((t) => {
			const q = project(inverse, t.x, t.y);
			return (Math.hypot(q.x, q.y) - t.r) * scale;
		});
		for (let i = 0; i < 6; i++) out.push((a[i] - a0[i]) * 0.01);
		out.push((a[6] - a0[6]) * scale * scale * 20, (a[7] - a0[7]) * scale * scale * 20);
		out.push((turn(a) - turn(a0)) * scale * 5);
		return out;
	};

	let a = [...a0];
	let damping = 1e-3;
	let cost = sum(residuals(a));
	for (let iteration = 0; iteration < 60; iteration++) {
		const r0 = residuals(a);
		const jacobian = a.map((_, j) => {
			const step = [...a];
			step[j] += steps[j];
			return residuals(step).map((r, i) => (r - r0[i]) / steps[j]);
		});
		const normal = Array.from({ length: 8 }, (_, i) =>
			Array.from({ length: 9 }, (_, k) => {
				if (k === 8) return -jacobian[i].reduce((s, g, n) => s + g * r0[n], 0);
				return jacobian[i].reduce((s, g, n) => s + g * jacobian[k][n], 0) * (i === k ? 1 + damping : 1);
			})
		);
		const delta = gauss(normal);
		if (!delta) break;
		const next = a.map((v, i) => v + delta[i]);
		const nextCost = sum(residuals(next));
		if (nextCost < cost) {
			a = next;
			damping = Math.max(1e-9, damping / 3);
			if (cost - nextCost < 1e-9 * cost) break;
			cost = nextCost;
		} else {
			damping *= 4;
			if (damping > 1e8) break;
		}
	}
	const h = matrix(a);
	return anchorsAt(1).map(([u, v]) => {
		const p = project(h, u, v);
		return [p.x, p.y] as Point;
	});
}

function matrix(a: number[]): number[][] {
	return [
		[a[2], a[3], a[0]],
		[a[4], a[5], a[1]],
		[a[6], a[7], 1]
	];
}

function sum(values: number[]): number {
	return values.reduce((s, v) => s + v * v, 0);
}

function gauss(rows: number[][]): number[] | null {
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

/** The ring boundaries this face has printed, outermost first. */
export function ringsOf(type: string | null | undefined) {
	const edge = edgeOf(type);
	return RINGS.filter((ring) => ring.r <= edge + 1e-9);
}

/** The printed boundary nearest a tap, read through the fit as it stands. */
export function guessRing(fit: Point[], x: number, y: number, type: string | null | undefined): number {
	const q = toFace(fit, x, y);
	const rings = ringsOf(type);
	if (!q) return rings[0].r;
	const r = Math.hypot(q.x, q.y);
	return rings.reduce((best, ring) => (Math.abs(ring.r - r) < Math.abs(best - r) ? ring.r : best), rings[0].r);
}

/** A tap moved along the line from the gold onto the sharpest change of colour near it. */
export function snapToEdge(image: ImageData, fit: Point[], x: number, y: number): Point {
	const [cx, cy] = centreOf(fit);
	const along = Math.hypot(x - cx, y - cy);
	if (along < 4) return [x, y];
	const dx = (x - cx) / along;
	const dy = (y - cy) / along;
	const reach = Math.max(5, Math.round(along * 0.04));
	const colour = (s: number): number[] | null => {
		const px = Math.round(x + dx * s);
		const py = Math.round(y + dy * s);
		if (px < 0 || py < 0 || px >= image.width || py >= image.height) return null;
		const i = (py * image.width + px) * 4;
		return [image.data[i], image.data[i + 1], image.data[i + 2]];
	};
	let best = 0;
	let strongest = 0;
	for (let s = -reach; s <= reach; s++) {
		const before = colour(s - 1);
		const after = colour(s + 1);
		if (!before || !after) continue;
		const change = Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) + Math.abs(before[2] - after[2]);
		// Nearer the tap is preferred, so a ring a few pixels away does not steal it.
		const score = change * (1 - (0.4 * Math.abs(s)) / reach);
		if (score > strongest) {
			strongest = score;
			best = s;
		}
	}
	return strongest < 40 ? [x, y] : [x + dx * best, y + dy * best];
}

/** The turn that lays most arrows on what the detector sees, since circles cannot say which way up they are. */
export function bestTurn(arrows: { x: number; y: number }[], seen: { x: number; y: number }[]): number | null {
	if (arrows.length === 0 || seen.length === 0) return null;
	const score = (angle: number) => {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		let total = 0;
		for (const a of arrows) {
			const x = a.x * cos - a.y * sin;
			const y = a.x * sin + a.y * cos;
			let near = 0;
			for (const s of seen) near = Math.max(near, Math.exp(-((Math.hypot(x - s.x, y - s.y) / 0.03) ** 2)));
			total += near;
		}
		return total;
	};
	const still = score(0);
	let best = 0;
	let bestScore = still;
	for (let degree = -180; degree < 180; degree += 0.5) {
		const s = score((degree * Math.PI) / 180);
		if (s > bestScore) {
			bestScore = s;
			best = (degree * Math.PI) / 180;
		}
	}
	const enough = Math.max(1.5, arrows.length * 0.5);
	return bestScore >= enough && bestScore > still + 1 && Math.abs(best) > 0.005 ? best : null;
}
