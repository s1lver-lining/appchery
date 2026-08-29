import { describe, it, expect } from 'vitest';
import { faceFromEllipse, moveAnchor, cropToImage, cropToFace, toImageCoords } from './face';
import { detectArrowsInCrop, type ArrowModel } from './learned';
import type { FaceLocation, Frame } from './types';

/*
 * The crop the learned arrow detector reads is the face's own coordinates, and these hold it to that.
 *
 * It is the one thing the whole detector rests on. The network is never asked to find the target: it
 * is handed a rectified crop and its answer is taken as a point on the face directly, so if the crop
 * is any other space than the face's, every arrow is reported somewhere the archer did not shoot.
 *
 * It was another space once. The crop was cut along the picture's own axes, stretched by the two
 * lengths of the face's ellipse, which is the face's coordinates only when the face lies square to
 * the camera. A phone stood beside the shooting line does not, and there the two stood a quarter turn
 * apart: arrows were scored across the face from where they were shot, and those whose radius the
 * stretch carried past the edge were dropped and never reported at all.
 */

const FACES: [string, FaceLocation][] = [
	['seen square on', faceFromEllipse(400, 300, 120, 120, 0, 1)!],
	['boss square, phone level', faceFromEllipse(400, 300, 150, 70, 0, 1)!],
	// A phone stood beside the shooting line sees the face squashed across, which leaves its long
	// axis upright. This is the ordinary way to film an end, and the one the quarter turn came from.
	['camera off to one side', faceFromEllipse(400, 300, 150, 70, Math.PI / 2, 1)!],
	['camera off to one side and tilted', faceFromEllipse(400, 300, 150, 70, Math.PI / 4, 1)!],
	['mild angle', faceFromEllipse(400, 300, 150, 110, Math.PI / 6, 1)!],
	// A boss leaning back, where near and far rings differ in scale and only the projection can say so.
	['a leaning boss', moveAnchor(faceFromEllipse(400, 300, 150, 90, 0.4, 1)!, 1, 20, -14)!]
];

const AROUND: [number, number][] = [
	[0.5, 0],
	[0, 0.5],
	[-0.5, 0],
	[0, -0.5],
	[0.3, 0.6],
	[-0.7, 0.2],
	[0.05, -0.05],
	[0, 0],
	[0.9, 0.3]
];

describe('the crop the detector reads', () => {
	it('is the face own coordinates, so a peak in it is already a point that scores', () => {
		for (const [name, face] of FACES) {
			for (const [x, y] of AROUND) {
				const back = cropToFace(face, x, y);
				expect(back.x, `${name} at (${x}, ${y}) x`).toBeCloseTo(x, 9);
				expect(back.y, `${name} at (${x}, ${y}) y`).toBeCloseTo(y, 9);
			}
		}
	});

	it('takes its cells from the pixels the face actually covers', () => {
		for (const [name, face] of FACES) {
			for (const [x, y] of AROUND) {
				const pixel = cropToImage(face, x, y);
				const wanted = toImageCoords(face, x, y);
				expect(pixel.x, `${name} at (${x}, ${y}) x`).toBeCloseTo(wanted.x, 9);
				expect(pixel.y, `${name} at (${x}, ${y}) y`).toBeCloseTo(wanted.y, 9);
			}
		}
	});

	/**
	 * A target face is rings, and rectified means they come out as circles. Under the old sampling a
	 * ring came out an ellipse up to twice as tall as it was wide, which is why the crop could not be
	 * turned to any angle as another example of itself the way the training augmentation assumes.
	 */
	it('shows a ring on the face as a ring, whatever angle the camera stands at', () => {
		for (const [name, face] of FACES) {
			for (const radius of [0.2, 0.6, 1]) {
				for (let k = 0; k < 24; k++) {
					const angle = (k / 24) * Math.PI * 2;
					const on = cropToFace(face, Math.cos(angle) * radius, Math.sin(angle) * radius);
					expect(Math.hypot(on.x, on.y), `${name} at radius ${radius}`).toBeCloseTo(radius, 9);
				}
			}
		}
	});

	/** The span reaches the same distance past the face edge in every direction. */
	it('reaches the same way out on every side', () => {
		for (const [name, face] of FACES) {
			for (let k = 0; k < 16; k++) {
				const angle = (k / 16) * Math.PI * 2;
				const edge = cropToFace(face, Math.cos(angle) * 1.2, Math.sin(angle) * 1.2);
				expect(Math.hypot(edge.x, edge.y), `${name}`).toBeCloseTo(1.2, 9);
			}
		}
	});

	/** The full resolution cutter samples the same geometry, scaled, so it must agree cell for cell. */
	it('agrees with itself at any frame scale', () => {
		for (const [name, face] of FACES) {
			for (const factor of [1, 2, 3.5]) {
				const one = cropToImage(face, 0.3, -0.6);
				const scaled = cropToImage(face, 0.3, -0.6, factor);
				expect(scaled.x, `${name} at ${factor}x`).toBeCloseTo(one.x * factor, 9);
				expect(scaled.y, `${name} at ${factor}x`).toBeCloseTo(one.y * factor, 9);
			}
		}
	});
});

/**
 * The detector driven with no layers at all, so the crop it is handed is read straight back as the
 * grid of peaks. What comes out is then a statement about the coordinates alone, rather than about
 * anything the network had learnt.
 */
const BARE: ArrowModel = { size: 9, grid: 9, span: 1, threshold: 0.5, layers: [] };

/** A crop with one bright cell: confidence high, both sub cell offsets as near nought as bytes allow. */
function cropWithPeak(size: number, at: [number, number]): Frame {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let i = 0; i < size * size; i++) {
		data[i * 4] = 0;
		data[i * 4 + 1] = 128;
		data[i * 4 + 2] = 128;
		data[i * 4 + 3] = 255;
	}
	data[(at[1] * size + at[0]) * 4] = 255;
	return { width: size, height: size, data };
}

describe('the arrow the detector reports', () => {
	const OFFSET = (128 / 255) * 2 - 1;
	const cellToCrop = (n: number) => ((n + OFFSET) / BARE.size) * 2 * BARE.span - BARE.span;

	it('is placed where the crop cell it was found in actually looks', () => {
		for (const [name, face] of FACES) {
			for (let j = 0; j < BARE.size; j++) {
				for (let i = 0; i < BARE.size; i++) {
					const truth = cropToFace(face, cellToCrop(i), cellToCrop(j));
					const found = detectArrowsInCrop(cropWithPeak(BARE.size, [i, j]), face, BARE);

					// A cell looking past the edge of the face is not an arrow, and is dropped.
					if (Math.hypot(truth.x, truth.y) >= 1) {
						expect(found, `${name} cell ${i},${j} looks off the face`).toHaveLength(0);
						continue;
					}

					expect(found, `${name} cell ${i},${j}`).toHaveLength(1);
					expect(found[0].x, `${name} cell ${i},${j} x`).toBeCloseTo(truth.x, 6);
					expect(found[0].y, `${name} cell ${i},${j} y`).toBeCloseTo(truth.y, 6);
				}
			}
		}
	});

	/**
	 * Which cells hold an arrow at all cannot depend on where the camera stood. Under the old sampling
	 * it did: a side on face stretched the crop so far across that whole columns of it looked past the
	 * edge of the face, and every arrow in them was thrown away.
	 */
	it('finds an arrow in the same cells whatever angle the face is seen at', () => {
		const counts = FACES.map(([, face]) => {
			let n = 0;
			for (let j = 0; j < BARE.size; j++) {
				for (let i = 0; i < BARE.size; i++) {
					if (detectArrowsInCrop(cropWithPeak(BARE.size, [i, j]), face, BARE).length > 0) n += 1;
				}
			}
			return n;
		});
		expect(new Set(counts).size, `cells reporting an arrow: ${counts.join(', ')}`).toBe(1);
		expect(counts[0]).toBeGreaterThan(20);
	});
});
