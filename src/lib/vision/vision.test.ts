import { describe, it, expect } from 'vitest';
import { detectFace, toFaceCoords, toImageCoords } from './face';
import { Background, findBlobs } from './impacts';
import { verifyRings, classify, probeRing } from './rings';
import { ImpactTracker } from './tracker';
import { Scanner } from './pipeline';
import { rgbToHsv, largestComponent } from './pixels';
import type { Frame } from './types';

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
		const face = detectFace(ellipse(blank(200, 200), 100, 100, 30, 18, GOLD));
		expect(face).not.toBeNull();
		expect(face!.semiMajor / face!.semiMinor).toBeCloseTo(30 / 18, 1);
	});

	it('gives a face seen square on no rotation, rather than an arbitrary one', () => {
		// Moments cannot orient a circle, and an unguarded fit twists the frame by 45 degrees.
		const face = detectFace(ellipse(blank(200, 200), 100, 100, 26, 26, GOLD))!;
		expect(face.rotation).toBe(0);
		expect(face.semiMajor).toBeCloseTo(face.semiMinor, 6);
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

describe('Background', () => {
	it('reports nothing on a scene that has not changed', () => {
		const background = new Background();
		background.update(blank(40, 40));
		const diff = background.update(blank(40, 40));
		expect(Math.max(...diff)).toBe(0);
	});

	it('lights up exactly where something new appeared', () => {
		const background = new Background();
		background.update(blank(40, 40));
		const withArrow = ellipse(blank(40, 40), 20, 20, 3, 3, [10, 10, 10]);
		const diff = background.update(withArrow);
		expect(diff[20 * 40 + 20]).toBeGreaterThan(80);
		expect(diff[0]).toBe(0);
	});
});

describe('findBlobs', () => {
	it('groups changed pixels and returns their centres, largest first', () => {
		const width = 40;
		const diff = new Uint8ClampedArray(width * 40);
		for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) diff[y * width + x] = 200;
		for (let y = 30; y < 32; y++) for (let x = 30; x < 35; x++) diff[y * width + x] = 200;

		const blobs = findBlobs(diff, width, 40, { minArea: 4 });
		expect(blobs).toHaveLength(2);
		expect(blobs[0].area).toBe(16);
		expect(blobs[0].cx).toBeCloseTo(11.5, 1);
	});

	it('drops what the caller will not accept, which is how off face noise is ignored', () => {
		const width = 40;
		const diff = new Uint8ClampedArray(width * 40);
		for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) diff[y * width + x] = 200;
		expect(findBlobs(diff, width, 40, { accept: (cx) => cx > 20 })).toHaveLength(0);
	});
});

describe('ImpactTracker', () => {
	it('confirms an arrow only once it has held still across frames', () => {
		const tracker = new ImpactTracker(3);
		const arrow = { x: 0.2, y: -0.1, area: 12 };

		expect(tracker.push([arrow])).toHaveLength(0);
		expect(tracker.push([arrow])).toHaveLength(0);
		expect(tracker.push([arrow])).toHaveLength(1);
		expect(tracker.arrows).toHaveLength(1);
	});

	it('never reports the same arrow twice, however long it stays on the face', () => {
		const tracker = new ImpactTracker(2);
		const arrow = { x: 0, y: 0, area: 12 };
		tracker.push([arrow]);
		tracker.push([arrow]);
		expect(tracker.arrows).toHaveLength(1);

		for (let i = 0; i < 10; i++) tracker.push([arrow]);
		expect(tracker.arrows).toHaveLength(1);
	});

	it('lets a one frame flicker decay instead of promoting it', () => {
		const tracker = new ImpactTracker(3);
		tracker.push([{ x: 0.5, y: 0.5, area: 9 }]);
		tracker.push([]);
		tracker.push([]);
		expect(tracker.arrows).toHaveLength(0);
		expect(tracker.pending).toHaveLength(0);
	});

	it('treats a nearby detection as the same arrow, not a second one', () => {
		const tracker = new ImpactTracker(2);
		tracker.push([{ x: 0.3, y: 0.3, area: 10 }]);
		tracker.push([{ x: 0.31, y: 0.302, area: 10 }]);
		expect(tracker.arrows).toHaveLength(1);
	});

	it('forgets an arrow the archer rejected', () => {
		const tracker = new ImpactTracker(1);
		const [arrow] = tracker.push([{ x: 0, y: 0, area: 8 }]);
		tracker.forget(arrow);
		expect(tracker.arrows).toHaveLength(0);
	});
});

describe('Scanner', () => {
	const face = () => waFace(240, 100);

	it('locates the face and then reports an arrow that lands on it', () => {
		const scanner = new Scanner({ scale: 2, framesToConfirm: 3, faceEvery: 1, framesToSettle: 2 });

		// A few quiet frames so the reference settles on an empty boss and the face is judged steady.
		for (let i = 0; i < 5; i++) scanner.push(face());
		expect(scanner.located).not.toBeNull();

		let found: ReturnType<Scanner['push']> | null = null;
		for (let i = 0; i < 6; i++) {
			found = scanner.push(ellipse(face(), 150, 120, 4, 4, [15, 15, 15]));
		}

		expect(found!.arrows).toHaveLength(1);
		// 30px right of centre on a 100px face radius, so about three tenths of the way out.
		expect(found!.arrows[0].x).toBeGreaterThan(0.24);
		expect(found!.arrows[0].x).toBeLessThan(0.36);
		expect(Math.abs(found!.arrows[0].y)).toBeLessThan(0.05);
	});

	it('ignores movement outside the face, such as someone walking past the boss', () => {
		const scanner = new Scanner({ scale: 2, framesToConfirm: 2, faceEvery: 1, framesToSettle: 2 });
		for (let i = 0; i < 5; i++) scanner.push(face());

		let result: ReturnType<Scanner['push']> | null = null;
		for (let i = 0; i < 5; i++) {
			result = scanner.push(ellipse(face(), 8, 232, 5, 5, [255, 0, 255]));
		}
		expect(result!.arrows).toHaveLength(0);
	});

	it('takes the arrows into the reference once accepted, so the next end starts clean', () => {
		const scanner = new Scanner({ scale: 2, framesToConfirm: 2, faceEvery: 1, framesToSettle: 2 });
		for (let i = 0; i < 5; i++) scanner.push(face());

		const withArrow = () => ellipse(face(), 150, 120, 4, 4, [15, 15, 15]);
		for (let i = 0; i < 4; i++) scanner.push(withArrow());
		expect(scanner.push(withArrow()).arrows).toHaveLength(1);

		scanner.accept(withArrow());
		const after = scanner.push(withArrow());
		expect(after.arrows).toHaveLength(0);
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

	it('waits for the face to hold still before accepting any arrow', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToConfirm: 1, framesToSettle: 6 });
		const first = scanner.push(waFace());
		expect(first.steady).toBe(false);
		expect(first.arrows).toHaveLength(0);
	});

	it('stops proposing arrows once the end is full', () => {
		const scanner = new Scanner({ scale: 2, faceEvery: 1, framesToConfirm: 2, framesToSettle: 2 });
		scanner.setLimit(1);
		for (let i = 0; i < 5; i++) scanner.push(waFace());

		const shots: [number, number][] = [
			[150, 120],
			[120, 150],
			[95, 120]
		];
		let result = null;
		for (let i = 0; i < 6; i++) {
			const frame = waFace();
			for (const [x, y] of shots) ellipse(frame, x, y, 4, 4, [15, 15, 15]);
			result = scanner.push(frame);
		}
		expect(result!.arrows.length).toBeLessThanOrEqual(1);
	});
});
