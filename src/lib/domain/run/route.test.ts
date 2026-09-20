import { describe, expect, it } from 'vitest';
import { paceBand, pathOf, routeOf } from './route';

describe('routeOf', () => {
	it('draws north up, which is a latitude that grows drawing upwards', () => {
		const route = routeOf([
			{ lat: 48.1, lon: -1.6 },
			{ lat: 48.11, lon: -1.6 }
		]);
		expect(route).not.toBeNull();
		expect(route!.points[1].y).toBeLessThan(route!.points[0].y);
	});

	it('keeps the shape rather than filling the box', () => {
		// Twice as far east as north, at a latitude where a degree of longitude is worth less.
		const route = routeOf([
			{ lat: 48.1, lon: -1.6 },
			{ lat: 48.1, lon: -1.58 },
			{ lat: 48.11, lon: -1.58 }
		]);
		expect(route!.width).toBeGreaterThan(route!.height);
		// A degree of longitude is about two thirds of a degree of latitude here, so 0.02 east
		// against 0.01 north comes out at about 1.34 to 1 rather than at 2 to 1.
		const ratio = (route!.width - 8) / (route!.height - 8);
		expect(ratio).toBeGreaterThan(1.2);
		expect(ratio).toBeLessThan(1.5);
	});

	it('has nothing to draw for a run that never left the spot', () => {
		expect(routeOf([{ lat: 48.1, lon: -1.6 }, { lat: 48.1, lon: -1.6 }])).toBeNull();
		expect(routeOf([{ lat: 48.1, lon: -1.6 }])).toBeNull();
	});

	it('starts its path with a move and carries on with lines', () => {
		const route = routeOf([
			{ lat: 48.1, lon: -1.6 },
			{ lat: 48.11, lon: -1.6 },
			{ lat: 48.12, lon: -1.61 }
		])!;
		const path = pathOf(route);
		expect(path.startsWith('M')).toBe(true);
		expect(path.split('L')).toHaveLength(3);
	});
});

describe('paceBand', () => {
	it('leaves the ends out, so a red light does not paint the whole route', () => {
		const paces = [300, 305, 310, 315, 320, 325, 330, 335, 340, 1800];
		const band = paceBand(paces, 0.05);
		expect(band).not.toBeNull();
		expect(band!.slow).toBeLessThan(1000);
		expect(band!.fast).toBe(300);
	});

	it('has nothing to say about a run that held one pace exactly', () => {
		expect(paceBand([300, 300, 300])).toBeNull();
		expect(paceBand([null, null])).toBeNull();
	});
});
