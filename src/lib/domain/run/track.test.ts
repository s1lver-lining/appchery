import { describe, expect, it } from 'vitest';
import {
	addFix,
	currentPace,
	emptyTrack,
	haversine,
	isUsable,
	paceOf,
	replay,
	splitsNow,
	type RunFix,
	type TrackState
} from './track';

const fix = (partial: Partial<RunFix> = {}): RunFix => ({
	at: 0,
	lat: 48.8566,
	lon: 2.3522,
	accuracy: 5,
	altitude: null,
	speed: null,
	...partial
});

/** Metres north of the first fix, which is the easiest straight line to reason about. */
const north = (metres: number, at: number, rest: Partial<RunFix> = {}) =>
	fix({ lat: 48.8566 + metres / 111_320, at, ...rest });

/** A steady run straight up the road, one fix a second at the given speed, carrying on from where it was. */
function run(state: TrackState, seconds: number, metresPerSecond: number, from = 0) {
	let current = state;
	let metres = current.distanceM;
	if (!current.last) current = addFix(current, north(metres, from * 1000), from).state;
	for (let s = 1; s <= seconds; s++) {
		metres += metresPerSecond;
		current = addFix(current, north(metres, (from + s) * 1000), from + s).state;
	}
	return current;
}

describe('distance between fixes', () => {
	it('measures a hundred metres as a hundred metres', () => {
		expect(haversine(fix(), north(100, 0))).toBeCloseTo(100, 0);
	});
});

describe('judging a fix', () => {
	it('drops one too vague to mean anything', () => {
		expect(isUsable(fix({ accuracy: 120 }))).toBe(false);
		expect(isUsable(fix({ accuracy: null }))).toBe(true);
	});

	it('ignores the receiver wandering while the runner stands still', () => {
		const started = addFix(emptyTrack(), fix(), 0).state;
		const after = addFix(started, north(1, 1000), 1);
		expect(after.moved).toBe(false);
		expect(after.state.distanceM).toBe(0);
	});

	it('adds nothing at all over a quarter of an hour on a table', () => {
		// A vague fix is entitled to wander as far as the error it admits to, and it does, all day.
		let state = addFix(emptyTrack(), fix({ accuracy: 18 }), 0).state;
		for (let second = 1; second <= 900; second++) {
			const drift = Math.sin(second) * 9;
			state = addFix(
				state,
				fix({ at: second * 1000, accuracy: 18, lat: 48.8566 + drift / 111_320 }),
				second
			).state;
		}
		expect(state.distanceM).toBe(0);
	});

	it('believes the receiver over the floor when it says the phone is moving', () => {
		// A slow runner at one fix a second covers less ground than a vague fix may wander.
		const started = addFix(emptyTrack(), fix({ accuracy: 12, speed: 2.6 }), 0).state;
		const after = addFix(started, north(2.6, 1000, { accuracy: 12, speed: 2.6 }), 1);
		expect(after.moved).toBe(true);
		expect(after.state.distanceM).toBeCloseTo(2.6, 0);
	});

	it('ignores a fix the receiver says was taken standing still', () => {
		const started = addFix(emptyTrack(), fix({ speed: 3 }), 0).state;
		expect(addFix(started, north(9, 1000, { speed: 0.2 }), 1).moved).toBe(false);
	});

	it('ignores a fix that brings no time with it', () => {
		const started = addFix(emptyTrack(), fix(), 0).state;
		expect(addFix(started, north(40, 0), 0).moved).toBe(false);
		expect(addFix(started, north(40, -1000), 0).moved).toBe(false);
	});

	it('drops a fix too vague to be worth counting', () => {
		const started = addFix(emptyTrack(), fix(), 0).state;
		expect(addFix(started, north(20, 4000, { accuracy: 30 }), 4).moved).toBe(false);
	});

	it('ignores a jump nobody ran', () => {
		const started = addFix(emptyTrack(), fix(), 0).state;
		expect(addFix(started, north(500, 1000), 1).moved).toBe(false);
	});
});

describe('what the run adds up to', () => {
	it('counts the ground covered', () => {
		const state = run(emptyTrack(), 100, 3);
		expect(state.distanceM).toBeCloseTo(300, -1);
	});

	it('gives a pace per kilometre', () => {
		expect(paceOf(1000, 330)).toBe(330);
		expect(paceOf(0, 330)).toBeNull();
	});

	it('shows the pace being run now rather than the pace of the whole run', () => {
		// Two minutes jogging, then half a minute at four metres a second.
		let state = run(emptyTrack(), 120, 2);
		state = run(state, 30, 4, 120);
		expect(paceOf(state.distanceM, 150)).toBeGreaterThan(400);
		// A window a second wider than thirty, so the pace shown lags the change slightly and settles.
		expect(currentPace(state, 150)!).toBeGreaterThan(245);
		expect(currentPace(state, 150)!).toBeLessThan(275);
	});

	it('says nothing about the pace until there is something to divide', () => {
		expect(currentPace(emptyTrack(), 10)).toBeNull();
	});

	it('counts a climb and never a descent, and ignores the noise between', () => {
		let state = addFix(emptyTrack(), fix({ altitude: 100 }), 0).state;
		state = addFix(state, north(10, 2000, { altitude: 101 }), 2).state;
		expect(state.elevationGainM).toBe(0);
		state = addFix(state, north(20, 4000, { altitude: 110 }), 4).state;
		expect(state.elevationGainM).toBe(10);
		state = addFix(state, north(30, 6000, { altitude: 90 }), 6).state;
		expect(state.elevationGainM).toBe(10);
	});
});

describe('splits', () => {
	it('closes one on every kilometre', () => {
		const state = run(emptyTrack(), 800, 4);
		expect(state.splits).toHaveLength(3);
		expect(state.splits[0].index).toBe(1);
		expect(state.splits[0].seconds).toBeCloseTo(250, -1);
	});

	it('shows the kilometre in progress as well as the ones finished', () => {
		const state = run(emptyTrack(), 300, 4);
		const shown = splitsNow(state, 300);
		expect(shown).toHaveLength(2);
		expect(shown[1].partial).toBe(true);
		expect(shown[1].distanceM).toBeCloseTo(200, -1);
	});

	it('shows nothing extra when a kilometre has just closed', () => {
		const closed: TrackState = {
			...emptyTrack(),
			distanceM: 1000,
			splits: [{ index: 1, distanceM: 1000, seconds: 250 }],
			splitFrom: { distanceM: 1000, seconds: 250 }
		};
		expect(splitsNow(closed, 250)).toHaveLength(1);
	});
});

describe('replaying a stored track', () => {
	it('adds up to what it did while it ran', () => {
		const fixes = Array.from({ length: 200 }, (_, i) => north(i * 4, i * 1000));
		// The replay starts its clock at the first fix, which is what the live run does too.
		expect(replay(fixes).distanceM).toBeCloseTo(run(emptyTrack(), 199, 4).distanceM, 0);
	});

	it('adds up to nothing when there is nothing to replay', () => {
		expect(replay([]).distanceM).toBe(0);
	});
});
