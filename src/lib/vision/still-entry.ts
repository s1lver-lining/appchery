// Entry point for scripts/detect_arrows.sh, bundled and run inside a browser so it can decode and
// re-encode images. Not imported by the app.
import { downscale } from './pixels';
import { detectFaces, toImageCoords } from './face';
import { verifyRings } from './rings';
import { detectArrowsInStill } from './still';
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
		area: number;
		label: string;
		decimal: number | null;
	}[];
}

/**
 * Detection at a chosen scale, with every coordinate reported in the original image's pixels so a
 * caller can draw straight onto it.
 */
export function analyse(frame: Frame, scale = 4): StillFace[] {
	const small = downscale(frame, scale);

	return detectFaces(small)
		.filter((face) => verifyRings(small, face).ok)
		.map((face) => {
			const arrows = detectArrowsInStill(small, face).map((blob) => {
				const image = toImageCoords(face, blob.x, blob.y);
				return {
					x: blob.x,
					y: blob.y,
					imageX: image.x * scale,
					imageY: image.y * scale,
					area: blob.area * scale * scale,
					label: scoreAt(WA_10_RING, blob.x, blob.y).label,
					decimal: decimalScore(WA_10_RING, blob.x, blob.y)
				};
			});

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
