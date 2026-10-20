import { describe, expect, it } from 'vitest';
import { setReference, type Recording } from './session.svelte';
import { anchorsAt, homography, project, fromLegacy, toLegacy, arrowsOn, type Point, type FramesMeta } from './format';
import { bestTurn, fitToTaps, pulled, radiusOf, centreOf, recentred } from './fit';

const circle = (cx: number, cy: number, r: number): Point[] => anchorsAt(1).map(([u, v]) => [cx + u * r, cy + v * r]);

describe('fitToTaps', () => {
	it('moves a fit onto taps on one ring', () => {
		const truth = circle(400, 500, 200);
		const prior = circle(420, 480, 220);
		const h = homography(truth)!;
		const taps = [0.3, 1.1, 2.0, 2.6, 4.0].map((a) => {
			const p = project(h, 0.8 * Math.cos(a), 0.8 * Math.sin(a));
			return { x: p.x, y: p.y, r: 0.8 };
		});
		const fit = fitToTaps(prior, taps);
		const [cx, cy] = centreOf(fit);
		expect(Math.hypot(cx - 400, cy - 500)).toBeLessThan(2);
		expect(Math.abs(radiusOf(fit) - 200)).toBeLessThan(2);
	});

	it('keeps the fit when there are too few taps', () => {
		const prior = circle(100, 100, 50);
		expect(fitToTaps(prior, [{ x: 0, y: 0, r: 1 }])).toEqual(prior);
	});
});

describe('pulled', () => {
	it('moves the grabbed side and leaves the far side', () => {
		const start = circle(0, 0, 100);
		const fit = pulled(start, 1, 0, 20, 0);
		const h = homography(fit)!;
		expect(project(h, 1, 0).x).toBeGreaterThan(110);
		expect(Math.abs(project(h, -1, 0).x + 100)).toBeLessThan(3);
	});
});

describe('bestTurn', () => {
	it('finds the turn that lays the arrows on what was seen', () => {
		const arrows = [
			{ x: 0.3, y: 0.1 },
			{ x: -0.2, y: 0.4 },
			{ x: 0.1, y: -0.5 }
		];
		const angle = (20 * Math.PI) / 180;
		const seen = arrows.map((a) => ({
			x: a.x * Math.cos(angle) - a.y * Math.sin(angle),
			y: a.x * Math.sin(angle) + a.y * Math.cos(angle)
		}));
		expect(bestTurn(arrows, seen)).toBeCloseTo(angle, 2);
		expect(bestTurn(arrows, arrows)).toBeNull();
	});
});

describe('legacy labels', () => {
	const meta: FramesMeta = { video: 'v', width: 720, height: 1280, frames: 100, chosen: [0, 10, 20], seeds: [null, null, null] };
	const handles = anchorsAt(0.8).map(([u, v]) => [360 + u * 250, 640 + v * 250]);
	const old = {
		faceType: '10-ring',
		empty: false,
		arrows: [
			{ x: 0.1, y: 0.2 },
			{ x: -0.3, y: 0.1 }
		],
		arrowFrame: 0,
		frameArrows: { 2: [{ n: 0, x: 0.12, y: 0.2 }, { n: 1, x: -0.3, y: 0.12 }] },
		frames: { 0: { handles, touched: true }, 1: { handles, touched: true, arrowsOk: true }, 2: { handles, touched: true } },
		nocks: { 1: [{ arrow: 0, x: 300, y: 500 }] },
		marks: []
	};

	it('converts and reads back the same arrows on every frame', () => {
		const labels = fromLegacy(old, meta);
		expect(labels.faces[0].placedOn).toBe(0);
		expect(arrowsOn(labels, 2)[0]).toMatchObject({ x: 0.12, moved: true });
		const back = toLegacy(labels);
		expect(back.arrows).toEqual(old.arrows);
		expect(back.frameArrows[2]).toEqual(old.frameArrows[2]);
		expect(back.frames[1].arrowsOk).toBe(true);
		expect(back.nocks[1]).toEqual(old.nocks[1]);
		expect(back.frames[0].handles![0][0]).toBeCloseTo(handles[0][0], 6);
	});

	it('keeps a point where a shaft leaves the picture apart from a nock', () => {
		const labels = fromLegacy({ ...old, nocks: { 1: [{ arrow: 0, x: 300, y: 500 }, { arrow: 1, x: 0, y: 640, cut: true }] } }, meta);
		expect(labels.frames[1].a.nockCut).toEqual([1]);
		const back = toLegacy(labels);
		expect(back.nocks[1]).toEqual([{ arrow: 0, x: 300, y: 500 }, { arrow: 1, x: 0, y: 640, cut: true }]);
	});

	it('lists only visible arrows on a frame with one out of sight', () => {
		const labels = fromLegacy(old, meta);
		labels.frames[1].a.hidden = [1];
		const back = toLegacy(labels);
		expect(back.frameArrows[1].map((a) => a.n)).toEqual([0]);
		expect(back.frameHidden[1].map((a) => a.n)).toEqual([1]);
	});
});

describe('recentred', () => {
	it('moves the middle and keeps the outer ring', () => {
		const start = circle(300, 300, 100);
		const fit = recentred(start, 0.1, 0.05, 1);
		const h0 = homography(start)!;
		const h = homography(fit)!;
		const middle = project(h, 0, 0);
		const want = project(h0, 0.1, 0.05);
		expect(Math.hypot(middle.x - want.x, middle.y - want.y)).toBeLessThan(1e-6);
		for (let a = 0; a < 6; a += 0.7) {
			const p = project(h, Math.cos(a), Math.sin(a));
			expect(Math.abs(Math.hypot(p.x - 300, p.y - 300) - 100)).toBeLessThan(1e-6);
		}
	});
});

describe('setReference', () => {
	it('moves the reference and keeps checked frames where they were', () => {
		const meta: FramesMeta = { video: 'v', width: 720, height: 1280, frames: 30, chosen: [0, 10, 20], seeds: [null, null, null] };
		const fit = circle(360, 640, 300);
		const rec = {
			...meta,
			shotAt: null,
			samples: [],
			labels: {
				version: 2,
				faces: [{ id: 'a', type: '10-ring', empty: false, count: 2, arrows: [{ n: 0, x: 0.1, y: 0 }, { n: 1, x: 0.5, y: 0.5 }], placedOn: 0 }],
				frames: {
					0: { a: { state: 'ok', fit, arrowsOk: true } },
					1: { a: { state: 'ok', fit, arrowsOk: true } },
					2: { a: { state: 'ok', fit, moved: { 1: { x: 0.52, y: 0.5 } } } }
				}
			}
		} as Recording;
		expect(setReference(rec, 2)).toBeNull();
		const labels = rec.labels!;
		expect(labels.faces[0].placedOn).toBe(2);
		expect(arrowsOn(labels, 2)[1]).toMatchObject({ x: 0.52, moved: false });
		expect(arrowsOn(labels, 0)[1]).toMatchObject({ x: 0.5 });
		expect(arrowsOn(labels, 1)[1]).toMatchObject({ x: 0.5 });
	});
});
