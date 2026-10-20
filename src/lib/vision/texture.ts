// Which way up a face is, read off the paper itself: holes, tears and print are unique, the rings are not.

export interface Picture {
	width: number;
	height: number;
	data: Uint8ClampedArray | Uint8Array;
}

const RADII = 28;
const ANGLES = 360;
/** The rings unrolled by default: inside the gold's holes and short of the face's own edge. */
export const FACE_BAND = { inner: 0.22, outer: 0.95 };
// Settled against the frames aligned by hand: 0.5° median error, 3 in 87 more than 20° out, 13 in 100 declined.
const CLIP = 2.5;
const SMOOTH = 15;
const RATIO = 1.5;

/**
 * The face unrolled into rings of brightness, each ring normalised so lighting drops out. `at` takes a
 * point in face coordinates to the picture's pixels.
 */
export function unrollWith(
	picture: Picture,
	at: (u: number, v: number) => { x: number; y: number },
	band: { inner: number; outer: number } = FACE_BAND
): Float32Array | null {
	const { inner, outer } = band;
	const out = new Float32Array(RADII * ANGLES);
	let inside = 0;
	for (let k = 0; k < RADII; k++) {
		const r = inner + ((outer - inner) * k) / (RADII - 1);
		let sum = 0;
		let squares = 0;
		let count = 0;
		for (let a = 0; a < ANGLES; a++) {
			const angle = (a / ANGLES) * Math.PI * 2;
			const p = at(r * Math.cos(angle), r * Math.sin(angle));
			const x = Math.round(p.x);
			const y = Math.round(p.y);
			let v = NaN;
			if (x >= 0 && y >= 0 && x < picture.width && y < picture.height) {
				const i = (y * picture.width + x) * 4;
				v = picture.data[i] * 0.3 + picture.data[i + 1] * 0.59 + picture.data[i + 2] * 0.11;
				sum += v;
				squares += v * v;
				count += 1;
			}
			out[k * ANGLES + a] = v;
		}
		inside += count;
		const mean = count ? sum / count : 0;
		const spread = count ? Math.sqrt(Math.max(1e-6, squares / count - mean * mean)) : 1;
		// Out of the picture counts as nothing, so a face half off the screen still matches on the rest.
		const row = new Float32Array(ANGLES);
		// Clipped, so a shaft, the darkest thing on the paper and one that moves with the viewpoint, cannot dominate.
		for (let a = 0; a < ANGLES; a++) {
			const v = out[k * ANGLES + a];
			row[a] = Number.isNaN(v) ? NaN : Math.max(-CLIP, Math.min(CLIP, (v - mean) / spread));
		}
		// Only the fine detail, holes and tears, with the slow changes of light round the ring taken away.
		for (let a = 0; a < ANGLES; a++) {
			if (Number.isNaN(row[a])) {
				out[k * ANGLES + a] = 0;
				continue;
			}
			let local = 0;
			let seen = 0;
			for (let d = -SMOOTH; d <= SMOOTH; d++) {
				const v = row[(a + d + ANGLES) % ANGLES];
				if (!Number.isNaN(v)) {
					local += v;
					seen += 1;
				}
			}
			out[k * ANGLES + a] = row[a] - local / seen;
		}
	}
	return inside > RADII * ANGLES * 0.3 ? out : null;
}

/**
 * The turn of `fit`'s face coordinates that lines its paper up with the reference's, in radians, or null
 * when the match is not clearly better than any other turn.
 */
export function textureTurn(reference: Float32Array, here: Float32Array): number | null {
	const scores = new Float32Array(ANGLES);
	for (let s = 0; s < ANGLES; s++) {
		let total = 0;
		for (let k = 0; k < RADII; k++) {
			const row = k * ANGLES;
			for (let a = 0; a < ANGLES; a++) total += reference[row + a] * here[row + ((a + s) % ANGLES)];
		}
		scores[s] = total / (RADII * ANGLES);
	}
	let best = 0;
	for (let s = 1; s < ANGLES; s++) if (scores[s] > scores[best]) best = s;
	// The runner up away from the peak: a clear match stands well above every other turn.
	let second = -Infinity;
	for (let s = 0; s < ANGLES; s++) {
		const gap = Math.min(Math.abs(s - best), ANGLES - Math.abs(s - best));
		if (gap > 12) second = Math.max(second, scores[s]);
	}
	if (scores[best] <= 0 || scores[best] < second * RATIO) return null;
	// A parabola through the peak and its neighbours, for a turn finer than a degree.
	const left = scores[(best + ANGLES - 1) % ANGLES];
	const right = scores[(best + 1) % ANGLES];
	const bend = left - 2 * scores[best] + right;
	const offset = bend < 0 ? (0.5 * (left - right)) / bend : 0;
	let degrees = best + offset;
	if (degrees > 180) degrees -= 360;
	return (degrees * Math.PI) / 180;
}
