/**
 * Live scoring from the camera, built on classical computer vision rather than a learned model:
 * there is no training set, and a target face is a known, highly structured object. Everything here
 * is pure and works on plain pixel buffers, so it runs in a worker and is testable without a camera.
 */

/** A frame as it comes off a canvas: RGBA, row major. */
export interface Frame {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

/**
 * Where the face sits in the image, as four points on it.
 *
 * The four are the ends of two perpendicular diameters of the ring between the black and the white,
 * which ten equal rings put at 0.8 of the radius. Four point correspondences are exactly what a
 * projection takes, so this says everything about how the face is seen: where it is, how big, which
 * way round, how foreshortened by standing off to one side, and how much nearer the bottom of the
 * boss is than the top.
 *
 * An ellipse cannot say the last of those, and describing the rest as a centre, two axes and an angle
 * has a worse problem: at a face seen square on the axes are equal and the angle means nothing, so a
 * pixel of noise sends it anywhere. Four points have no such case. They move smoothly wherever the
 * camera goes, which is what lets the overlay follow the boss rather than step after it.
 */
export interface FaceLocation {
	/** The four points, in image pixels, in the order right, bottom, left, top of the face. */
	anchors: [number, number][];
	/** Face coordinates to image pixels, row major, the bottom right entry fixed at one. */
	transform: number[];
	/** The way back, so a point in the picture can be given a score. */
	inverse: number[];
	/** Centre in image pixels, which is the transform applied to the origin. */
	cx: number;
	cy: number;
	/**
	 * The ellipse the face looks most like from here, for the parts of the pipeline that want one
	 * number for its size. Read off the transform rather than fitted, and never the thing being fitted.
	 */
	semiMajor: number;
	semiMinor: number;
	rotation: number;
	/** Share of sampled pixels that supported the fit, as a rough confidence. */
	support: number;
}

export interface Blob {
	cx: number;
	cy: number;
	area: number;
}

/** An impact in normalised face coordinates, the same space the scoring rules use. */
export interface Impact {
	x: number;
	y: number;
	/**
	 * Which face it landed on. A three spot end puts one arrow on each of three faces, and each face
	 * has its own coordinate frame, so two arrows in two golds are both at the origin.
	 */
	face: number;
	/** Frames this impact has been seen in, which is what promotes a candidate to a real arrow. */
	seen: number;
	/** Pixel area of the blob, kept so the UI can flag a suspiciously large detection. */
	area: number;
	/** Frames since this arrow was confirmed, used to keep it on probation for a while. */
	held?: number;
	/** Consecutive frames it has gone unseen, which is what retires one that was never really there. */
	missed?: number;
}
