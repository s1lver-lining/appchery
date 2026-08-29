import { describe, it, expect } from 'vitest';
import { faceFromEllipse, toFaceCoords, toImageCoords, cropToImage, cropToFace } from './face';
import { detectArrowsInCrop, type ArrowModel } from './learned';
import type { FaceLocation, Frame } from './types';

/*
 * The crop the learned detector reads and the face the score is read off have to be the same space.
 *
 * The detector finds a peak at some cell of a square crop and that cell has to name a place on the
 * face. What says where the cell came from is the sampling the crop was cut with, and nothing else:
 * if the read back uses a different mapping than the cutter did, every arrow lands somewhere the
 * archer did not shoot.
 */

/** The crop cell that holds a given picture pixel, which is the cutter's mapping run backwards. */
function imageToCrop(face: FaceLocation, x: number, y: number) {
	const cos = Math.cos(face.rotation);
	const sin = Math.sin(face.rotation);
	const dx = x - face.cx;
	const dy = y - face.cy;
	return {
		x: (dx * cos + dy * sin) / face.semiMajor,
		y: (-dx * sin + dy * cos) / face.semiMinor
	};
}

const FACES: [string, FaceLocation][] = [
	['seen square on', faceFromEllipse(400, 300, 120, 120, 0, 1)!],
	['boss square, phone level', faceFromEllipse(400, 300, 150, 70, 0, 1)!],
	// A phone stood beside the shooting line sees the face squashed across, which leaves its long
	// axis upright. This is the ordinary way to film an end, and the one that used to turn a quarter.
	['camera off to one side', faceFromEllipse(400, 300, 150, 70, Math.PI / 2, 1)!],
	['camera off to one side and tilted', faceFromEllipse(400, 300, 150, 70, Math.PI / 4, 1)!],
	['mild angle', faceFromEllipse(400, 300, 150, 110, Math.PI / 6, 1)!]
];

describe('a peak in the crop and the place on the face it stands for', () => {
	it('names the arrow where it was actually shot', () => {
		for (const [name, face] of FACES) {
			for (const [fx, fy] of [
				[0.5, 0],
				[0, 0.5],
				[-0.5, 0],
				[0, -0.5],
				[0.3, 0.6],
				[-0.7, 0.2],
				[0.05, -0.05],
				[0, 0]
			]) {
				// An arrow really at this place on the face is this pixel of the picture.
				const pixel = toImageCoords(face, fx, fy);
				// It falls in this cell of the crop, because that is the cell that sampled the pixel.
				const cell = imageToCrop(face, pixel.x, pixel.y);
				// And the detector has to call that cell the place the arrow was shot.
				const said = cropToFace(face, cell.x, cell.y);

				expect(said.x, `${name} at (${fx}, ${fy}) x`).toBeCloseTo(fx, 6);
				expect(said.y, `${name} at (${fx}, ${fy}) y`).toBeCloseTo(fy, 6);
			}
		}
	});

	it('cuts and reads back through one and the same mapping', () => {
		for (const [name, face] of FACES) {
			for (const [cx, cy] of [
				[0.4, 0.1],
				[-0.2, 0.9],
				[0, 0],
				[1.1, -0.4]
			]) {
				const pixel = cropToImage(face, cx, cy);
				expect(cropToFace(face, cx, cy).x, `${name} x`).toBeCloseTo(
					toFaceCoords(face, pixel.x, pixel.y).x,
					9
				);
				expect(cropToFace(face, cx, cy).y, `${name} y`).toBeCloseTo(
					toFaceCoords(face, pixel.x, pixel.y).y,
					9
				);
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
 * The detector itself, driven with no layers at all, so the crop it is handed is read straight back
 * as the grid of peaks. That makes what comes out a statement about the coordinates alone, which is
 * the part that was wrong, rather than about anything the network had learnt.
 */
const BARE: ArrowModel = { size: 9, grid: 9, span: 1, threshold: 0.5, layers: [] };

/** A crop with one bright cell: confidence high, both sub cell offsets nil. */
function cropWithPeak(size: number, at: [number, number]): Frame {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let i = 0; i < size * size; i++) {
		// Mid grey reads as nought once scaled, which is a confidence below the threshold.
		data[i * 4] = 0;
		data[i * 4 + 1] = 128;
		data[i * 4 + 2] = 128;
		data[i * 4 + 3] = 255;
	}
	const [i, j] = at;
	data[(j * size + i) * 4] = 255;
	return { width: size, height: size, data };
}

describe('the arrow the detector reports', () => {
	/** Mid grey in the two offset channels, which is the sub cell position and is not quite nought. */
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
	 * The case an archer meets: a phone stood beside the shooting line. The crop is cut along the
	 * picture's own axes while the face lies across them, so the two spaces sit a quarter turn apart.
	 * Calling a crop cell a face position outright named every arrow a quarter turn from where it was
	 * shot, at the wrong radius besides, and dropped the ones the wrong radius carried past the edge.
	 */
	it('sits a quarter turn from the crop, which is what used to be reported', () => {
		const sideOn = FACES.find(([name]) => name === 'camera off to one side')![1];

		// Across the crop is up and down the face.
		const across = cropToFace(sideOn, 0.3, 0);
		expect(Math.abs(across.y)).toBeGreaterThan(0.5);
		expect(Math.abs(across.x)).toBeLessThan(1e-9);

		// Down the crop is across the face.
		const down = cropToFace(sideOn, 0, 0.3);
		expect(Math.abs(down.x)).toBeGreaterThan(0.1);
		expect(Math.abs(down.y)).toBeLessThan(1e-9);
	});

	it('does not simply repeat the crop cell it was found in', () => {
		const sideOn = FACES.find(([name]) => name === 'camera off to one side')![1];
		const cell: [number, number] = [5, 4];
		const found = detectArrowsInCrop(cropWithPeak(BARE.size, cell), sideOn, BARE);
		expect(found).toHaveLength(1);
		expect(
			Math.hypot(found[0].x - cellToCrop(cell[0]), found[0].y - cellToCrop(cell[1]))
		).toBeGreaterThan(0.2);
	});
});
