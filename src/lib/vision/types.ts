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
	/** Frames this impact has been seen in, which is what promotes a candidate to a real arrow. */
	seen: number;
	/** Pixel area of the blob, kept so the UI can flag a suspiciously large detection. */
	area: number;
}
