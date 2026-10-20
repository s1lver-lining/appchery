import { toFaceCoords } from './face';
import type { Frame, FaceLocation } from './types';

const SECTORS = 12;
const REACH = 1.3;
/** Where plain paper lands on the grey picture, so a shaft of any colour reads darker than it. */
const PAPER = 200;

/** Levels per channel in the paper's histograms: fine enough for a median, small enough to keep per cell. */
const LEVELS = 64;

/**
 * The picture as darkness against the paper, with any change of colour from the paper counted as darkness
 * too. The proposers look for shafts darker than the paper, which a red or white shaft on a light ring is
 * not. Brightness is kept exactly as they read it, so a dark shaft is seen as it always was, and what is
 * added is how far the hue is from the paper's usual one at that radius and bearing.
 */
export function paperContrast(frame: Frame, face: FaceLocation, reach = REACH, gain = 1): Frame {
	const radius = (face.semiMajor + face.semiMinor) / 2;
	const bins = Math.max(24, Math.min(288, Math.round(radius)));
	const left = Math.max(0, Math.floor(face.cx - face.semiMajor * reach));
	const right = Math.min(frame.width - 1, Math.ceil(face.cx + face.semiMajor * reach));
	const top = Math.max(0, Math.floor(face.cy - face.semiMajor * reach));
	const bottom = Math.min(frame.height - 1, Math.ceil(face.cy + face.semiMajor * reach));
	const { width, data } = frame;
	const cellCount = bins * SECTORS;

	const cells = new Int32Array(width * frame.height).fill(-1);
	const histograms = new Uint16Array(cellCount * 3 * LEVELS);
	const counts = new Uint32Array(cellCount);
	for (let y = top; y <= bottom; y++) {
		for (let x = left; x <= right; x++) {
			const point = toFaceCoords(face, x, y);
			const r = Math.hypot(point.x, point.y);
			if (r >= reach) continue;
			const bin = Math.min(bins - 1, Math.floor((r / reach) * bins));
			const bearing = Math.atan2(point.y, point.x) + Math.PI;
			const sector = Math.min(SECTORS - 1, Math.floor((bearing / (Math.PI * 2)) * SECTORS));
			const cell = bin * SECTORS + sector;
			const i = y * width + x;
			cells[i] = cell;
			counts[cell] += 1;
			for (let c = 0; c < 3; c++) histograms[(cell * 3 + c) * LEVELS + ((data[i * 4 + c] * LEVELS) >> 8)] += 1;
		}
	}

	// A median per channel, pooled with the neighbouring bearings as the shape proposer pools its own.
	const usual = new Float32Array(cellCount * 3);
	for (let bin = 0; bin < bins; bin++) {
		for (let s = 0; s < SECTORS; s++) {
			const near = [bin * SECTORS + ((s + SECTORS - 1) % SECTORS), bin * SECTORS + s, bin * SECTORS + ((s + 1) % SECTORS)];
			const total = counts[near[0]] + counts[near[1]] + counts[near[2]];
			for (let c = 0; c < 3; c++) {
				let seen = 0;
				let level = 0;
				for (; level < LEVELS; level++) {
					for (const cell of near) seen += histograms[(cell * 3 + c) * LEVELS + level];
					if (seen * 2 >= total) break;
				}
				usual[(bin * SECTORS + s) * 3 + c] = ((level + 0.5) * 256) / LEVELS;
			}
		}
	}

	const out = new Uint8ClampedArray(data.length).fill(PAPER);
	for (let i = 3; i < out.length; i += 4) out[i] = 255;
	for (let y = top; y <= bottom; y++) {
		for (let x = left; x <= right; x++) {
			const i = y * width + x;
			const cell = cells[i];
			if (cell < 0) continue;
			const r = data[i * 4];
			const g = data[i * 4 + 1];
			const b = data[i * 4 + 2];
			const ur = usual[cell * 3];
			const ug = usual[cell * 3 + 1];
			const ub = usual[cell * 3 + 2];
			const value = Math.max(r, g, b);
			const paper = Math.max(ur, ug, ub, 1);
			// Opponent colours, the hue and saturation left once brightness is set aside.
			const hue = Math.hypot(r - g - (ur - ug), (r + g) / 2 - b - ((ur + ug) / 2 - ub));
			out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = Math.min(PAPER, (PAPER * value) / paper) - gain * hue;
		}
	}
	return { width, height: frame.height, data: out };
}
