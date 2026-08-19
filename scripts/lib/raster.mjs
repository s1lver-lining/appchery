/**
 * Just enough drawing to put the live overlay onto a raw RGBA frame.
 *
 * The replay tool used to hand each frame to a browser to draw on, which meant encoding it, shipping
 * it over the debugging bridge, and decoding the answer, three times per frame for work that is a few
 * hundred pixel writes. A recording has to replay in about the time it took to record, so the frames
 * now stay as raw bytes from the decoder to the encoder and this draws straight into them.
 */

/** 5 by 7, one bit per pixel, most significant bit leftmost. Uppercase only: it is a debug panel. */
const GLYPHS = {
	'0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
	'1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
	'2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
	'3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
	'4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
	'5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
	'6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
	'7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
	'8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
	'9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
	A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
	B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
	C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
	D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
	E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
	F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
	G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
	H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
	I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
	J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
	K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
	L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
	M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
	N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
	O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
	P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
	Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
	R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
	S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
	T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
	U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
	V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
	W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
	X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
	Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
	Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
	' ': [0, 0, 0, 0, 0, 0, 0],
	'.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
	':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
	'%': [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
	'/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
	'-': [0, 0, 0, 0x0e, 0, 0, 0]
};

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;

export class Canvas {
	constructor(data, width, height) {
		this.data = data;
		this.width = width;
		this.height = height;
	}

	/** Blends one pixel, so a stroke drawn at partial alpha does not punch a hole in the picture. */
	blend(x, y, [r, g, b], alpha = 1) {
		const px = Math.round(x);
		const py = Math.round(y);
		if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
		const p = (py * this.width + px) * 4;
		this.data[p] += (r - this.data[p]) * alpha;
		this.data[p + 1] += (g - this.data[p + 1]) * alpha;
		this.data[p + 2] += (b - this.data[p + 2]) * alpha;
	}

	/** A filled disc, used to give a stroke its thickness without a polygon rasteriser. */
	dot(x, y, radius, colour, alpha = 1) {
		const r = Math.max(0.5, radius);
		for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
			for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
				if (dx * dx + dy * dy <= r * r) this.blend(x + dx, y + dy, colour, alpha);
			}
		}
	}

	fillRect(x, y, width, height, colour, alpha = 1) {
		for (let j = 0; j < height; j++) {
			for (let i = 0; i < width; i++) this.blend(x + i, y + j, colour, alpha);
		}
	}

	line(x0, y0, x1, y1, colour, thickness = 1, alpha = 1) {
		const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
		for (let i = 0; i <= steps; i++) {
			const t = steps === 0 ? 0 : i / steps;
			this.dot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness / 2, colour, alpha);
		}
	}

	/** An ellipse at any tilt, which is the shape a face takes from anywhere but square on. */
	ellipse(cx, cy, semiMajor, semiMinor, rotation, colour, thickness = 1, alpha = 1) {
		const cos = Math.cos(rotation);
		const sin = Math.sin(rotation);
		// Enough steps that the outline stays joined however large the face is on screen.
		const steps = Math.max(48, Math.ceil(Math.max(semiMajor, semiMinor) * 2));
		let previous = null;
		for (let i = 0; i <= steps; i++) {
			const angle = (i / steps) * Math.PI * 2;
			const ex = Math.cos(angle) * semiMajor;
			const ey = Math.sin(angle) * semiMinor;
			const point = [cx + ex * cos - ey * sin, cy + ex * sin + ey * cos];
			if (previous) this.line(previous[0], previous[1], point[0], point[1], colour, thickness, alpha);
			previous = point;
		}
	}

	/**
	 * A circle of the face drawn through whatever projection the face carries.
	 *
	 * Not an ellipse. A face seen from anywhere but square on is a projection, and the ellipse that
	 * matches it near the middle does not match it at the edge: drawn that way the gold sits perfectly
	 * and the outermost ring lands a couple of rings in from where it belongs, which looks like a fit
	 * that cannot hold its scale and is really just the wrong curve.
	 */
	ring(place, radius, colour, thickness = 1, alpha = 1) {
		let previous = null;
		const steps = 128;
		for (let i = 0; i <= steps; i++) {
			const angle = (i / steps) * Math.PI * 2;
			const point = place(Math.cos(angle) * radius, Math.sin(angle) * radius);
			if (previous) this.line(previous.x, previous.y, point.x, point.y, colour, thickness, alpha);
			previous = point;
		}
	}

	circle(cx, cy, radius, colour, thickness = 1, alpha = 1) {
		this.ellipse(cx, cy, radius, radius, 0, colour, thickness, alpha);
	}

	/** Uppercased and drawn from the bitmap font, with a dark halo so it reads over any background. */
	text(x, y, string, colour, scale = 2, halo = true) {
		let cursor = x;
		for (const character of string.toUpperCase()) {
			const glyph = GLYPHS[character];
			if (!glyph) {
				cursor += (GLYPH_WIDTH + 1) * scale;
				continue;
			}
			for (let row = 0; row < GLYPH_HEIGHT; row++) {
				for (let column = 0; column < GLYPH_WIDTH; column++) {
					if (!(glyph[row] & (1 << (GLYPH_WIDTH - 1 - column)))) continue;
					const px = cursor + column * scale;
					const py = y + row * scale;
					if (halo) this.fillRect(px - 1, py - 1, scale + 2, scale + 2, [0, 0, 0], 0.75);
					this.fillRect(px, py, scale, scale, colour);
				}
			}
			cursor += (GLYPH_WIDTH + 1) * scale;
		}
		return cursor - x;
	}

	static textWidth(string, scale = 2) {
		return string.length * (GLYPH_WIDTH + 1) * scale;
	}
}

export const TEXT_HEIGHT = GLYPH_HEIGHT;
