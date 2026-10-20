import { toImageCoords } from './face';
import { luma } from './pixels';
import type { Frame, FaceLocation } from './types';

/** Samples across the square read round the face, which is enough for a border a few pixels wide. */
const GRID = 120;
const INNER = 1.05;
const OUTER = 2.1;

/**
 * The turn of a face's coordinates that lines them up with the straight edges round it, the paper's
 * border, the bale and the corner prints, in radians within an eighth of a turn, with how strongly the
 * edges agree on it, from 0 for none to 1 for every edge on one line.
 *
 * Only a quarter turn is known: a square looks the same four ways round. Gravity says which of the four.
 */
export function edgeTurn(frame: Frame, face: FaceLocation): { turn: number; strength: number } | null {
	const step = (OUTER * 2) / (GRID - 1);
	const grey = new Float32Array(GRID * GRID).fill(NaN);
	for (let j = 0; j < GRID; j++) {
		for (let i = 0; i < GRID; i++) {
			const u = -OUTER + i * step;
			const v = -OUTER + j * step;
			const r = Math.hypot(u, v);
			// One sample either side of the band, so its gradient can still be taken.
			if (r < INNER - 2 * step || r > OUTER + 2 * step) continue;
			const p = toImageCoords(face, u, v);
			const x = Math.floor(p.x);
			const y = Math.floor(p.y);
			if (x < 0 || y < 0 || x >= frame.width - 1 || y >= frame.height - 1) continue;
			const fx = p.x - x;
			const fy = p.y - y;
			const at = (dx: number, dy: number) => {
				const k = ((y + dy) * frame.width + x + dx) * 4;
				return luma(frame.data[k], frame.data[k + 1], frame.data[k + 2]);
			};
			grey[j * GRID + i] = at(0, 0) * (1 - fx) * (1 - fy) + at(1, 0) * fx * (1 - fy) + at(0, 1) * (1 - fx) * fy + at(1, 1) * fx * fy;
		}
	}
	let re = 0;
	let im = 0;
	let total = 0;
	for (let j = 1; j < GRID - 1; j++) {
		for (let i = 1; i < GRID - 1; i++) {
			const r = Math.hypot(-OUTER + i * step, -OUTER + j * step);
			if (r < INNER || r > OUTER) continue;
			const gx = grey[j * GRID + i + 1] - grey[j * GRID + i - 1];
			const gy = grey[(j + 1) * GRID + i] - grey[(j - 1) * GRID + i];
			if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
			const weight = Math.hypot(gx, gy);
			// Four times the angle, so edges a quarter turn apart add up instead of cancelling.
			const a = 4 * Math.atan2(gy, gx);
			re += weight * Math.cos(a);
			im += weight * Math.sin(a);
			total += weight;
		}
	}
	if (total <= 0) return null;
	return { turn: Math.atan2(im, re) / 4, strength: Math.hypot(re, im) / total };
}
