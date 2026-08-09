import { describe, it, expect } from 'vitest';
import { detectFace, toFaceCoords, toImageCoords } from './face';
import { Background, findBlobs } from './impacts';
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
		// A 24px gold means a 60px face.
		expect(face!.semiMajor).toBeGreaterThan(55);
		expect(face!.semiMajor).toBeLessThan(65);
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
	const face = () => ellipse(blank(240, 240), 120, 120, 32, 32, GOLD);

	it('locates the face and then reports an arrow that lands on it', () => {
		const scanner = new Scanner({ scale: 2, framesToConfirm: 3, faceEvery: 1 });

		// A few quiet frames so the reference settles on an empty boss.
		for (let i = 0; i < 3; i++) scanner.push(face());
		expect(scanner.located).not.toBeNull();

		let found: ReturnType<Scanner['push']> | null = null;
		for (let i = 0; i < 4; i++) {
			found = scanner.push(ellipse(face(), 132, 120, 4, 4, [15, 15, 15]));
		}

		expect(found!.arrows).toHaveLength(1);
		// 12px right of centre on an 80px face radius, so a fifth of the way out.
		expect(found!.arrows[0].x).toBeGreaterThan(0.1);
		expect(found!.arrows[0].x).toBeLessThan(0.25);
		expect(Math.abs(found!.arrows[0].y)).toBeLessThan(0.05);
	});

	it('ignores movement outside the face, such as someone walking past the boss', () => {
		const scanner = new Scanner({ scale: 2, framesToConfirm: 2, faceEvery: 1 });
		for (let i = 0; i < 3; i++) scanner.push(face());

		let result: ReturnType<Scanner['push']> | null = null;
		for (let i = 0; i < 5; i++) {
			result = scanner.push(ellipse(face(), 10, 220, 6, 6, [20, 20, 20]));
		}
		expect(result!.arrows).toHaveLength(0);
	});

	it('takes the arrows into the reference once accepted, so the next end starts clean', () => {
		const scanner = new Scanner({ scale: 2, framesToConfirm: 2, faceEvery: 1 });
		for (let i = 0; i < 3; i++) scanner.push(face());

		const withArrow = () => ellipse(face(), 132, 120, 4, 4, [15, 15, 15]);
		for (let i = 0; i < 3; i++) scanner.push(withArrow());
		expect(scanner.push(withArrow()).arrows).toHaveLength(1);

		scanner.accept(withArrow());
		const after = scanner.push(withArrow());
		expect(after.arrows).toHaveLength(0);
	});
});
