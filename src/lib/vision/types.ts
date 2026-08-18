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
 * Where the face sits in the image, as an ellipse. An ellipse rather than a circle because a camera
 * on a tripod beside the shooting line never looks at the boss square on.
 */
export interface FaceLocation {
	/** Centre in image pixels. */
	cx: number;
	cy: number;
	/** Semi axes of the *whole face*, in image pixels. */
	semiMajor: number;
	semiMinor: number;
	/** Rotation of the major axis, radians, clockwise from the image x axis. */
	rotation: number;
	/** Share of sampled pixels that supported the fit, as a rough confidence. */
	support: number;
	/**
	 * How much the face leans away from the lens, along each image axis. Zero is the affine case, a
	 * face square on to the camera.
	 *
	 * A boss leans back on its stand and the archer walks right up to it, which is real perspective
	 * rather than a squashed circle: near and far rings do not share a scale. An ellipse cannot say
	 * that, and the error does not show up as a bad looking fit. It shows up as the centre creeping
	 * towards the far side of the face, because the centre of the projected ellipse is simply not the
	 * projection of the circle's centre. Measured on these recordings that put the gold about a
	 * twentieth of a face radius too high, which is half a ring at the outside of the target.
	 */
	perspectiveX: number;
	perspectiveY: number;
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
