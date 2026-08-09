// Entry point for scripts/eval-vision.mjs, which bundles this and runs it inside a browser so real
// photographs can be decoded and fed to the detector. Not imported by the app.
import { downscale } from './pixels';
import { detectFaces } from './face';
import { verifyRings } from './rings';
import type { Frame, FaceLocation } from './types';

export interface EvalFace {
	cx: number;
	cy: number;
	semiMajor: number;
	semiMinor: number;
	rotation: number;
	support: number;
	ok: boolean;
	reason: string | null;
	rings: string[];
}

/** Runs the whole face stage at full image scale, reporting every candidate and its ring check. */
export function evaluate(
	frame: Frame,
	scale = 4,
	detect: Parameters<typeof detectFaces>[1] = {},
	rings: Parameters<typeof verifyRings>[2] = {}
): EvalFace[] {
	const small = downscale(frame, scale);
	return detectFaces(small, detect).map((face: FaceLocation) => {
		const check = verifyRings(small, face, rings);
		return {
			cx: face.cx * scale,
			cy: face.cy * scale,
			semiMajor: face.semiMajor * scale,
			semiMinor: face.semiMinor * scale,
			rotation: face.rotation,
			support: face.support,
			ok: check.ok,
			reason: check.reason,
			rings: check.probes.map(
				(p) => `${p.radius}:${p.colour ?? '-'}@${p.agreement.toFixed(2)}`
			)
		};
	});
}
