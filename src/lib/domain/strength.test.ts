import { describe, expect, it } from 'vitest';
import { exercise } from './exercises';
import {
	allSets,
	entryFor,
	emptyStrengthPlan,
	isStrengthDone,
	nextSet,
	parseStrength,
	planLoad,
	restLeft,
	serialiseStrength,
	setsDone,
	setsPlanned,
	validateStrengthPlan,
	type StrengthPlan
} from './strength';

const pullApart = exercise('bandPullApart')!;
const plank = exercise('plank')!;

const plan = (): StrengthPlan => ({ entries: [entryFor(pullApart), entryFor(plank)] });

describe('an exercise added to a session', () => {
	it('starts from what the catalogue says to start with', () => {
		const entry = entryFor(pullApart);
		expect(entry.sets).toHaveLength(pullApart.defaults.sets);
		expect(entry.sets[0].reps).toBe(pullApart.defaults.reps);
		expect(entry.sets[0].holdSeconds).toBeNull();
		expect(entry.restSeconds).toBe(pullApart.defaults.restSeconds);
	});

	it('carries a hold rather than reps when that is what it is counted in', () => {
		const entry = entryFor(plank);
		expect(entry.sets[0].holdSeconds).toBe(plank.defaults.holdSeconds);
		expect(entry.sets[0].reps).toBeNull();
	});

	it('starts with nothing done', () => {
		expect(allSets(plan()).every((set) => set.doneAt === null)).toBe(true);
	});
});

describe('working through a session', () => {
	it('counts what was done, not what was planned', () => {
		const session = plan();
		expect(setsPlanned(session)).toBe(6);
		expect(setsDone(session)).toBe(0);
		session.entries[0].sets[0].doneAt = 1000;
		expect(setsDone(session)).toBe(1);
	});

	it('points at the first set still to do', () => {
		const session = plan();
		expect(nextSet(session)).toEqual({ entry: 0, set: 0 });
		session.entries[0].sets[0].doneAt = 1000;
		expect(nextSet(session)).toEqual({ entry: 0, set: 1 });
	});

	it('moves on to the next exercise once one is finished', () => {
		const session = plan();
		for (const set of session.entries[0].sets) set.doneAt = 1000;
		expect(nextSet(session)).toEqual({ entry: 1, set: 0 });
	});

	it('is finished only when every set is ticked', () => {
		const session = plan();
		expect(isStrengthDone(session)).toBe(false);
		for (const set of allSets(session)) set.doneAt = 1000;
		expect(isStrengthDone(session)).toBe(true);
		expect(nextSet(session)).toBeNull();
	});

	it('has finished nothing when there is nothing in it', () => {
		expect(isStrengthDone(emptyStrengthPlan())).toBe(false);
	});
});

describe('the rest between sets', () => {
	it('counts down from the set that was ticked, not from when the page opened', () => {
		const session = plan();
		session.entries[0].restSeconds = 60;
		session.entries[0].sets[0].doneAt = 10_000;
		expect(restLeft(session, 10_000)).toBe(60);
		expect(restLeft(session, 30_000)).toBe(40);
	});

	it('is over once it has run out, however long the phone was asleep', () => {
		const session = plan();
		session.entries[0].sets[0].doneAt = 10_000;
		expect(restLeft(session, 10_000_000)).toBe(0);
	});

	it('asks for no rest before anything has been done, or after everything has', () => {
		const session = plan();
		expect(restLeft(session, 5000)).toBe(0);
		for (const set of allSets(session)) set.doneAt = 1000;
		expect(restLeft(session, 1000)).toBe(0);
	});
});

describe('what a session works', () => {
	it('takes the hardest reading of each muscle across its exercises', () => {
		const load = planLoad(plan());
		expect(load.rhomboids).toBe(3);
		expect(load.transverseAbdominis).toBe(3);
	});

	it('ignores an exercise the catalogue no longer has', () => {
		expect(planLoad({ entries: [{ exerciseKey: 'gone', sets: [], restSeconds: 60 }] })).toEqual({});
	});
});

describe('storing a session', () => {
	it('comes back as it went in', () => {
		const session = plan();
		session.entries[0].sets[1].doneAt = 4242;
		expect(parseStrength(serialiseStrength(session))).toEqual(session);
	});

	it('reads nothing at all as an empty session', () => {
		expect(parseStrength(null)).toEqual(emptyStrengthPlan());
	});

	it('survives a block written by something else', () => {
		expect(parseStrength('not json')).toEqual(emptyStrengthPlan());
		expect(parseStrength('{"entries":"nonsense"}')).toEqual(emptyStrengthPlan());
		expect(parseStrength('{"entries":[{"noKey":1}]}')).toEqual(emptyStrengthPlan());
	});
});

describe('validation', () => {
	it('passes a session built from the catalogue', () => {
		expect(validateStrengthPlan(plan())).toEqual([]);
	});

	it('names what is out of range, once each', () => {
		const session = plan();
		session.entries[0].sets[0].reps = 500;
		session.entries[0].sets[1].reps = 900;
		session.entries[0].restSeconds = 9000;
		expect(validateStrengthPlan(session).sort()).toEqual(['reps', 'rest']);
	});
});
