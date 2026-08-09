// Entry point for scripts/arrow_detector.sh, bundled and run inside a browser so it can decode and
// re-encode images. Not imported by the app.
import { downscale } from './pixels';
import { detectFaces } from './face';
import { verifyRings } from './rings';
import { detectArrowsInStill, type StillOptions } from './still';
import { scoreAt, decimalScore } from '../domain/rounds/geometry';
import { WA_10_RING } from '../domain/rounds/seed';
import type { Frame } from './types';

export interface StillFace {
	cx: number;
	cy: number;
	semiMajor: number;
	semiMinor: number;
	rotation: number;
	agreement: number;
	arrows: {
		x: number;
		y: number;
		imageX: number;
		imageY: number;
		tailX: number;
		tailY: number;
		area: number;
		length: number;
		label: string;
		decimal: number | null;
	}[];
}

/**
 * Detection at a chosen scale, with every coordinate reported in the original image's pixels so a
 * caller can draw straight onto it.
 */
export function analyse(frame: Frame, scale = 2, tune: StillOptions = {}): StillFace[] {
	const small = downscale(frame, scale);

	return detectFaces(small)
		.filter((face) => verifyRings(small, face).ok)
		.map((face) => {
			const arrows = detectArrowsInStill(small, face, tune).map((arrow) => ({
				x: arrow.x,
				y: arrow.y,
				imageX: arrow.imageX * scale,
				imageY: arrow.imageY * scale,
				tailX: arrow.tailX * scale,
				tailY: arrow.tailY * scale,
				area: arrow.area * scale * scale,
				length: arrow.length * scale,
				label: scoreAt(WA_10_RING, arrow.x, arrow.y).label,
				decimal: decimalScore(WA_10_RING, arrow.x, arrow.y)
			}));

			return {
				cx: face.cx * scale,
				cy: face.cy * scale,
				semiMajor: face.semiMajor * scale,
				semiMinor: face.semiMinor * scale,
				rotation: face.rotation,
				agreement: face.support,
				arrows
			};
		});
}
