import { describe, it, expect } from 'vitest';
import {
	detectFace,
	detectFaces,
	faceFromAnchors,
	faceFromEllipse,
	toFaceCoords,
	toImageCoords
} from './face';
import { refineFace, ringAgreement } from './refine';
import { detectArrowsInStill } from './still';
import { detectArrowsLearned, type ArrowModel } from './learned';
import { verifyRings, classify, probeRing } from './rings';
import { SweepTracker } from './sweep';
import { Scanner } from './pipeline';
import { rgbToHsv, largestComponent } from './pixels';
import type { Frame, FaceLocation } from './types';

function blank(width: number, height: number, grey = 120): Frame {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = grey;
		data[i + 1] = grey;
		data[i + 2] = grey;
		data[i + 3] = 255;
	}
	return { width, height, data };
}

/** Draws a filled ellipse, which is what a target gold looks like to a camera off to one side. */
function ellipse(
	frame: Frame,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	[r, g, b]: [number, number, number]
) {
	for (let y = 0; y < frame.height; y++) {
		for (let x = 0; x < frame.width; x++) {
			if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
			const p = (y * frame.width + x) * 4;
			frame.data[p] = r;
			frame.data[p + 1] = g;
			frame.data[p + 2] = b;
		}
	}
	return frame;
}

const GOLD: [number, number, number] = [252, 209, 42];
const RED: [number, number, number] = [232, 69, 60];
const BLUE: [number, number, number] = [58, 160, 216];
const BLACK: [number, number, number] = [35, 40, 44];
const WHITE: [number, number, number] = [244, 241, 234];

/**
 * A whole WA face: ten equal rings, gold reaching a fifth of the radius. The detector is only
 * allowed to accept this, not a bare yellow disc, so the tests draw the real thing.
 */
function waFace(size = 240, radius = 100, squash = 1): Frame {
	const frame = blank(size, size, 200);
	const bands: [number, [number, number, number]][] = [
		[1.0, WHITE],
		[0.8, BLACK],
		[0.6, BLUE],
		[0.4, RED],
		[0.2, GOLD]
	];
	for (const [share, colour] of bands) {
		ellipse(frame, size / 2, size / 2, radius * share, radius * share * squash, colour);
	}
	return frame;
}

/** The same face, slid across the picture. */
function shifted(face: FaceLocation, dx: number, dy: number): FaceLocation {
	return faceFromAnchors(
		face.anchors.map(([x, y]) => [x + dx, y + dy] as [number, number]),
		face.support
	)!;
}

describe('rgbToHsv', () => {
	it('places target gold in the yellow band the detector looks for', () => {
		const { h, s } = rgbToHsv(...GOLD);
		expect(h).toBeGreaterThan(35);
		expect(h).toBeLessThan(70);
		expect(s).toBeGreaterThan(0.35);
	});
});

describe('largestComponent', () => {
	it('keeps the biggest run and drops the specks around it', () => {
		const mask = new Uint8Array(25);
		[0, 4].forEach((i) => (mask[i] = 1));
		[11, 12, 16, 17].forEach((i) => (mask[i] = 1));
		expect(largestComponent(mask, 5, 5).size).toBe(4);
	});
});

describe('detectFace', () => {
	it('recovers the whole face from the gold, which is 40% of its radius', () => {
		const frame = ellipse(blank(200, 200), 100, 90, 24, 24, GOLD);
		const face = detectFace(frame);

		expect(face).not.toBeNull();
		expect(face!.cx).toBeCloseTo(100, 0);
		expect(face!.cy).toBeCloseTo(90, 0);
		// The gold reaches a fifth of the radius, so a 24px gold means a 120px face.
		expect(face!.semiMajor).toBeGreaterThan(110);
		expect(face!.semiMajor).toBeLessThan(130);
	});

	it('fits an ellipse, so a camera off to one side still reads the face', () => {
		// The gold on its own, with no rings around it to refine against: this is the seed being tested.
		const face = detectFace(ellipse(blank(200, 200), 100, 100, 30, 18, GOLD), { refine: false });
		expect(face).not.toBeNull();
		expect(face!.semiMajor / face!.semiMinor).toBeCloseTo(30 / 18, 1);
	});

	it('gives a face seen square on no rotation, rather than an arbitrary one', () => {
		// Moments cannot orient a circle, and an unguarded fit twists the frame by 45 degrees.
		const face = detectFace(ellipse(blank(200, 200), 100, 100, 26, 26, GOLD))!;
		expect(face.rotation).toBe(0);
		expect(face.semiMajor).toBeCloseTo(face.semiMinor, 6);
	});

	/**
	 * `rotation` is not the angle the face is drawn at, and is left that way on purpose.
	 *
	 * What it decides is the square crop the learned arrow detector is shown, and
	 * scripts/prepare-arrows.mjs cut the crops the detector was trained on with this same expression.
	 * Correcting the maths here alone would show the model pictures framed unlike any it learnt from,
	 * and nothing else in the suite would notice. It reaches an arrow's score through that crop, and
	 * what keeps it harmless is that the crop is cut and read back through the one value: see
	 * crop.test.ts, which holds those two ends together.
	 *
	 * So this test is a tripwire rather than an approval. If it fails because the angle was corrected,
	 * the training data and the model have to be redone with it, or the correction has to come out.
	 */
	it('reports an angle that is a summary and not the tilt, which the crops depend on', () => {
		const tilt = 0.6;
		const face = faceFromEllipse(400, 300, 150, 70, tilt, 1)!;

		// The face itself is drawn correctly: its longest radius really is at the tilt it was built at.
		let far = -1;
		let drawn = 0;
		for (let i = 0; i < 3600; i++) {
			const a = (i / 3600) * Math.PI;
			const p = toImageCoords(face, Math.cos(a), Math.sin(a));
			const d = Math.hypot(p.x - face.cx, p.y - face.cy);
			if (d > far) {
				far = d;
				drawn = Math.atan2(p.y - face.cy, p.x - face.cx);
			}
		}
		expect(drawn).toBeCloseTo(tilt, 2);
		expect(face.semiMajor).toBeCloseTo(150, 6);
		expect(face.semiMinor).toBeCloseTo(70, 6);

		// The reported angle is none of that. Pinned, so correcting it cannot pass unnoticed.
		expect(face.rotation).toBeCloseTo(0, 6);
	});

	it('returns nothing when there is no gold to find', () => {
		expect(detectFace(blank(120, 120))).toBeNull();
		// A grass green field is saturated and bright, but the wrong hue.
		expect(detectFace(ellipse(blank(200, 200), 100, 100, 40, 40, [60, 160, 60]))).toBeNull();
	});
});

describe('face coordinates', () => {
	it('round trips a point through the rectification', () => {
		const face = detectFace(ellipse(blank(200, 200), 100, 100, 30, 20, GOLD))!;
		const image = toImageCoords(face, 0.5, -0.25);
		const back = toFaceCoords(face, image.x, image.y);
		expect(back.x).toBeCloseTo(0.5, 6);
		expect(back.y).toBeCloseTo(-0.25, 6);
	});

	it('puts the face centre at the origin and the edge at radius one', () => {
		const face = detectFace(ellipse(blank(200, 200), 100, 100, 24, 24, GOLD))!;
		expect(toFaceCoords(face, 100, 100).x).toBeCloseTo(0, 6);
		const edge = toFaceCoords(face, 100 + face.semiMajor, 100);
		expect(Math.hypot(edge.x, edge.y)).toBeCloseTo(1, 6);
	});
});

describe('Scanner', () => {
	const face = () => waFace(240, 100);

	/** Draws a shaft and hands the frame back, which is what feeding a sweep one arrow needs. */
	const stick = (frame: Frame, from: { x: number; y: number }, to: { x: number; y: number }) => {
		shaft(frame, from, to);
		return frame;
	};

	/** One sweep over a boss holding one arrow, which is what a walk up to the target looks like. */
	function sweep(scanner: Scanner, make: () => Frame, passes: number) {
		let result: ReturnType<Scanner['push']> | null = null;
		for (let i = 0; i < passes; i++) result = scanner.push(make());
		return result!;
	}

	it('locates the face and then reports an arrow standing in it', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToSettle: 2 });
		expect(scanner.push(face()).face).not.toBeNull();

		// Out to the right of centre, leaning away from the middle as a shaft in the paper does.
		const withArrow = () => stick(face(), { x: 150, y: 120 }, { x: 232, y: 120 });
		const result = sweep(scanner, withArrow, 10);

		expect(result.arrows.length).toBeGreaterThanOrEqual(1);
		const arrow = result.arrows[0];
		// 30px right of centre on a 100px face radius, so about three tenths of the way out.
		expect(arrow.x).toBeGreaterThan(0.2);
		expect(arrow.x).toBeLessThan(0.42);
		expect(Math.abs(arrow.y)).toBeLessThan(0.12);
	});

	it('ignores anything off the face, such as someone walking past the boss', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToSettle: 2 });
		const beside = () => stick(face(), { x: 8, y: 232 }, { x: 8, y: 200 });
		expect(sweep(scanner, beside, 10).arrows).toHaveLength(0);
	});

	it('does not offer an end again once it has been taken, since the arrows stay in the boss', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToSettle: 2 });
		const withArrow = () => stick(face(), { x: 150, y: 120 }, { x: 232, y: 120 });

		expect(sweep(scanner, withArrow, 10).arrows.length).toBeGreaterThanOrEqual(1);
		scanner.accept();
		expect(sweep(scanner, withArrow, 10).arrows).toHaveLength(0);
	});
});

describe('classify', () => {
	it('names the five colours a target face is printed in', () => {
		expect(classify(...GOLD)).toBe('gold');
		expect(classify(...RED)).toBe('red');
		expect(classify(...BLUE)).toBe('blue');
		expect(classify(...BLACK)).toBe('dark');
		expect(classify(...WHITE)).toBe('light');
		// Mid grey is not black: a grey wall behind a yellow bag must not read as a dark surround.
		expect(classify(120, 120, 120)).toBe('grey');
	});
});

describe('verifyRings', () => {
	it('accepts a real face, with the rings landing where the geometry says', () => {
		const frame = waFace();
		const face = detectFace(frame)!;
		const check = verifyRings(frame, face);

		expect(check.ok).toBe(true);
		expect(check.probes.map((p) => p.colour)).toEqual(['gold', 'red', 'blue', 'dark']);
		// Measured on real photographs of a WA face, every ring agreed on every sample.
		expect(Math.min(...check.probes.map((p) => p.agreement))).toBeGreaterThan(0.9);
	});

	it('rejects a bare yellow disc, which is what made every yellow object a target', () => {
		const frame = ellipse(blank(240, 240), 120, 120, 24, 24, GOLD);
		const face = detectFace(frame)!;
		expect(verifyRings(frame, face).ok).toBe(false);
	});

	it('rejects a yellow object on grass, since the rings are not there', () => {
		const frame = blank(240, 240, 90);
		ellipse(frame, 120, 120, 60, 60, [80, 150, 70]);
		ellipse(frame, 120, 120, 24, 24, GOLD);
		const face = detectFace(frame);
		expect(face === null || verifyRings(frame, face).ok).toBeFalsy();
	});

	it('still accepts a face whose outer rings run off the edge of the frame', () => {
		// A camera zoomed in on the boss: the black and white rings are simply not there to sample.
		const frame = waFace(240, 200);
		const face = detectFace(frame)!;
		expect(verifyRings(frame, face).ok).toBe(true);
	});

	it('reports why it refused, so the screen can say what to point at', () => {
		const frame = blank(200, 200, 130);
		const face = detectFace(waFace())!;
		expect(verifyRings(frame, face).reason).toBe('noGold');
	});
});

describe('probeRing', () => {
	it('reports how much of the ring it could actually see', () => {
		const frame = waFace();
		const face = detectFace(frame)!;
		expect(probeRing(frame, face, 0.3).samples).toBe(32);
		// Far outside the drawn face, so most samples fall off the frame.
		expect(probeRing(frame, face, 3).colour).toBeNull();
	});
});

describe('Scanner face gating', () => {
	it('reports no face at all for a yellow object that is not a target', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToSettle: 1 });
		let result = null;
		for (let i = 0; i < 5; i++) {
			result = scanner.push(ellipse(blank(240, 240), 120, 120, 30, 30, GOLD));
		}
		expect(result!.face).toBeNull();
		expect(result!.check?.ok).toBe(false);
		expect(result!.arrows).toHaveLength(0);
	});

	it('waits for the face to be in view a while before accepting any arrow', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToSettle: 6 });
		const first = scanner.push(waFace());
		expect(first.steady).toBe(false);
		expect(first.arrows).toHaveLength(0);
	});

	it('stops proposing arrows once the end is full', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToSettle: 2 });
		scanner.setLimit(1);

		const shots: [{ x: number; y: number }, { x: number; y: number }][] = [
			[{ x: 150, y: 120 }, { x: 232, y: 120 }],
			[{ x: 120, y: 150 }, { x: 120, y: 232 }],
			[{ x: 95, y: 120 }, { x: 8, y: 120 }]
		];
		let result = null;
		for (let i = 0; i < 12; i++) {
			const frame = waFace();
			for (const [from, to] of shots) shaft(frame, from, to);
			result = scanner.push(frame);
		}
		expect(result!.arrows.length).toBeLessThanOrEqual(1);
	});
});

describe('detectFaces', () => {
	it('finds every face in the frame, not only the largest gold', () => {
		// A three spot: three faces in one image, which taking the biggest blob would reduce to one.
		const frame = blank(240, 420, 235);
		for (const cy of [70, 210, 350]) {
			for (const [share, colour] of [
				[1.0, WHITE],
				[0.8, BLACK],
				[0.6, BLUE],
				[0.4, RED],
				[0.2, GOLD]
			] as [number, [number, number, number]][]) {
				ellipse(frame, 120, cy, 60 * share, 60 * share, colour);
			}
		}

		const faces = detectFaces(frame);
		expect(faces.length).toBeGreaterThanOrEqual(3);
		const centres = faces.map((f) => Math.round(f.cy)).sort((a, b) => a - b);
		expect(centres.slice(0, 3)).toEqual([70, 210, 350]);
	});
});

describe('refineFace', () => {
	it('recovers a face whose gold has been split by arrows', () => {
		// Arrows standing in the ten break the gold into pieces, which drags the blob centroid off
		// centre and shrinks its area. The rings around it are unaffected, so the fit can be rescued.
		const frame = waFace(240, 100);
		ellipse(frame, 108, 120, 3, 26, BLACK);
		ellipse(frame, 132, 120, 3, 26, BLACK);

		const seeded = detectFaces(frame, { refine: false })[0];
		const refined = detectFaces(frame)[0];

		expect(refined).toBeDefined();
		// Within a pixel of the true centre, which is a hundredth of the face.
		expect(Math.abs(refined.cx - 120)).toBeLessThan(1.5);
		expect(Math.abs(refined.cy - 120)).toBeLessThan(1.5);
		// Within a few percent of the true 100px radius, and better than the unrefined seed.
		expect(Math.abs(refined.semiMajor - 100)).toBeLessThan(8);
		expect(Math.abs(refined.semiMajor - 100)).toBeLessThanOrEqual(
			Math.abs(seeded.semiMajor - 100) + 1
		);
	});

	it('scores a correct fit above a displaced one', () => {
		const frame = waFace(240, 100);
		const truth = detectFaces(frame, { refine: false })[0];
		expect(ringAgreement(frame, truth)).toBeGreaterThan(
			// Moved by its anchors, since those are the face now and the centre is read off them.
			ringAgreement(frame, shifted(truth, 30, 0))
		);
	});

	it('does not shrink a three spot to chase rings that are not printed on it', () => {
		// The paper stops at the 6 ring, so everything past r = 0.5 is backing. Scoring that against
		// the full ten ring layout pulled the fit inward by about a tenth.
		const frame = blank(240, 240, 240);
		// Printed to the 6 ring, whose outer radius is 0.5 of the notional face.
		for (const [share, colour] of [
			[0.5, BLUE],
			[0.4, RED],
			[0.2, GOLD]
		] as [number, [number, number, number]][]) {
			ellipse(frame, 120, 120, 100 * share, 100 * share, colour);
		}

		const face = detectFaces(frame)[0];
		expect(face).toBeDefined();
		expect(face.semiMajor).toBeGreaterThan(88);
		expect(face.semiMajor).toBeLessThan(112);
	});
});

/** Draws a dark shaft from an impact on the paper outwards, the way an arrow leans towards the lens. */
function shaft(
	frame: Frame,
	from: { x: number; y: number },
	to: { x: number; y: number },
	width = 2
) {
	const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)) * 2;
	for (let i = 0; i <= steps; i++) {
		const x = from.x + ((to.x - from.x) * i) / steps;
		const y = from.y + ((to.y - from.y) * i) / steps;
		for (let dy = -width; dy <= width; dy++) {
			for (let dx = -width; dx <= width; dx++) {
				const px = Math.round(x + dx);
				const py = Math.round(y + dy);
				if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) continue;
				const p = (py * frame.width + px) * 4;
				frame.data[p] = 20;
				frame.data[p + 1] = 20;
				frame.data[p + 2] = 20;
			}
		}
	}
}

describe('detectArrowsInStill', () => {
	const face = faceFromEllipse(300, 300, 200, 200, 0, 1 )!;

	it('reads the arrow where it enters the paper, not at the nock', () => {
		const frame = waFace(600, 200);
		// Impact just inside the gold, shaft hanging down and out towards the camera.
		shaft(frame, { x: 320, y: 280 }, { x: 400, y: 560 });

		const found = detectArrowsInStill(frame, face);
		expect(found.length).toBeGreaterThan(0);
		/**
		 * Two rings of the hole. The entry lands a little way down the shaft because that is where the
		 * shaft stops reading as a shaft, and this is the measured accuracy rather than an aspiration.
		 * What the bound really catches is coming out at the nock, which misses by nearly a full radius.
		 */
		expect(Math.hypot(found[0].x - 0.1, found[0].y + 0.1)).toBeLessThan(0.2);
	});

	it('reads an arrow whose shaft disappears against the black ring', () => {
		const frame = waFace(600, 200);
		/**
		 * A dark shaft on the black ring is invisible, which used to plant the impact on the white to
		 * black boundary, several rings out from the truth. What saves it is that the length inside the
		 * black is a run in its own right, and its inner end is the hole.
		 */
		shaft(frame, { x: 320, y: 280 }, { x: 460, y: 700 });

		// The black ring hides it: a dark shaft on dark paper is the same colour as the paper.
		for (let y = 0; y < 600; y++) {
			for (let x = 0; x < 600; x++) {
				const r = Math.hypot(x - 300, y - 300) / 200;
				if (r <= 0.6 || r >= 0.8) continue;
				const p = (y * 600 + x) * 4;
				frame.data[p] = BLACK[0];
				frame.data[p + 1] = BLACK[1];
				frame.data[p + 2] = BLACK[2];
			}
		}

		const found = detectArrowsInStill(frame, face);
		expect(found.length).toBeGreaterThan(0);
		// Near the hole in the gold, not out at the black ring's edge, which is r = 0.6.
		expect(Math.hypot(found[0].x, found[0].y)).toBeLessThan(0.35);
	});

	it('drops a mark lying across the face rather than out of it', () => {
		const frame = waFace(600, 200);
		// Two arrows standing in the paper, and one mark lying across them.
		shaft(frame, { x: 320, y: 280 }, { x: 400, y: 560 });
		shaft(frame, { x: 280, y: 290 }, { x: 360, y: 570 });
		shaft(frame, { x: 200, y: 380 }, { x: 460, y: 330 });

		/**
		 * What rejects the crossing mark is that it does not climb: a shaft leaves the paper towards the
		 * lens and so crosses rings on its way out, while a mark lying across the face keeps its radius.
		 *
		 * It used to be rejected for pointing a different way from the longest run, on the argument that
		 * arrows all lean towards the same lens. That holds for a boss across a field and not for one the
		 * archer is standing in front of, where the six shafts fan out, and measured against the recorded
		 * sweeps it was throwing away a sixth of the arrows the detector ever saw.
		 */
		const found = detectArrowsInStill(frame, face);
		expect(found.length).toBeGreaterThanOrEqual(2);
		for (const arrow of found) {
			const climb =
				Math.hypot(toFaceCoords(face, arrow.tailX, arrow.tailY).x, toFaceCoords(face, arrow.tailX, arrow.tailY).y) -
				Math.hypot(arrow.x, arrow.y);
			expect(climb).toBeGreaterThan(0);
		}
	});

	it('ignores a printed ring line, which is just as long, thin and dark', () => {
		const frame = waFace(600, 200);
		const arc = 120;
		for (let i = 0; i <= 200; i++) {
			const angle = -0.6 + (i / 200) * 1.2;
			const p = ((Math.round(300 + Math.sin(angle) * arc) * 600) + Math.round(300 - Math.cos(angle) * arc)) * 4;
			frame.data[p] = 20;
			frame.data[p + 1] = 20;
			frame.data[p + 2] = 20;
		}

		expect(detectArrowsInStill(frame, face)).toHaveLength(0);
	});
});

describe('detectArrowsLearned', () => {
	const face = faceFromEllipse(63.5, 63.5, 128 / 2.4, 128 / 2.4, 0, 1 )!;

	/**
	 * A one layer model that fires on brightness alone, so the convolution, the peak search and the
	 * offsets can be checked without any weights to trust. The real weights are checked separately, by
	 * running the exported model through this code and through PyTorch and comparing the two.
	 */
	function brightnessModel(grid: number): ArrowModel {
		return {
			size: 128,
			grid,
			span: 1.2,
			threshold: 0.5,
			layers: [
				{
					in: 3,
					out: 3,
					stride: 128 / grid,
					dilation: 1,
					kernel: 1,
					relu: false,
					// Presence follows the red channel; both offsets sit at the middle of their cell.
					weight: [8, 0, 0, 0, 0, 0, 0, 0, 0],
					bias: [0, 0.5, 0.5]
				}
			]
		};
	}

	it('reports a bright patch as an impact, in face coordinates', () => {
		const frame = blank(128, 128, 0);
		// A patch up and left of centre, which is negative in both face axes.
		for (let y = 40; y < 44; y++) {
			for (let x = 40; x < 44; x++) {
				const p = (y * 128 + x) * 4;
				frame.data[p] = 255;
			}
		}

		const found = detectArrowsLearned(frame, face, brightnessModel(32));
		expect(found.length).toBeGreaterThan(0);
		expect(found[0].x).toBeLessThan(0);
		expect(found[0].y).toBeLessThan(0);
		// The patch centre sits at about 42 of 128 pixels, which is this far across the span.
		expect(found[0].x).toBeCloseTo((42 / 128) * 2.4 - 1.2, 1);
		expect(found[0].y).toBeCloseTo((42 / 128) * 2.4 - 1.2, 1);
	});

	it('reports one impact per patch rather than one per cell above the threshold', () => {
		const frame = blank(128, 128, 0);
		// One sampled cell each, four pixels apart being the stride of this toy model.
		for (const [cx, cy] of [
			[40, 40],
			[80, 84]
		]) {
			for (let y = cy; y < cy + 4; y++) {
				for (let x = cx; x < cx + 4; x++) {
					frame.data[(y * 128 + x) * 4] = 255;
				}
			}
		}

		expect(detectArrowsLearned(frame, face, brightnessModel(32))).toHaveLength(2);
	});
});
