// Which way up a face is, read off the paper itself: holes, tears and print are unique, the rings are not.
import { homography, project, type Point } from './format.ts';
import { unrollWith, type Picture } from '../vision/texture.ts';

export { textureTurn, type Picture } from '../vision/texture.ts';

/** The face a labelled fit describes, unrolled from a picture `scale` times smaller than the frame. */
export function unroll(picture: Picture, fit: Point[], scale = 1): Float32Array | null {
	const h = homography(fit);
	if (!h) return null;
	return unrollWith(picture, (u, v) => {
		const p = project(h, u, v);
		return { x: p.x / scale, y: p.y / scale };
	});
}
