import { describe, it, expect } from 'vitest';
import {
	upcoming,
	nextUp,
	weekArrowGoal,
	weekdayOf,
	onlyActive,
	isActiveOn,
	weekArrowGoalOn,
	planSeason,
	GRACE_MS,
	type PlanSlotLike,
	type PlanLike,
	type PlanWindowLike
} from './plans';

const at = (iso: string) => new Date(iso).getTime();

function slot(partial: Partial<PlanSlotLike> & { id: string }): PlanSlotLike {
	return { planId: 'p', weekday: 0, minuteOfDay: 18 * 60, arrowGoal: 60, label: null, ...partial };
}

// Monday 10 August 2026, 09:00 local.
const monday = at('2026-08-10T09:00');

describe('weekdayOf', () => {
	it('counts from Monday', () => {
		expect(weekdayOf(monday)).toBe(0);
		expect(weekdayOf(at('2026-08-16T09:00'))).toBe(6);
	});
});

describe('upcoming', () => {
	it('places a slot on every matching day of the window, in order', () => {
		const occurrences = upcoming([slot({ id: 'a', weekday: 2 })], [], 14, monday);
		expect(occurrences).toHaveLength(2);
		expect(new Date(occurrences[0].at).getDate()).toBe(12);
		expect(new Date(occurrences[1].at).getDate()).toBe(19);
		expect(occurrences[0].at).toBeLessThan(occurrences[1].at);
	});

	it('keeps a slot that started within the grace period and drops an older one', () => {
		const justPassed = upcoming([slot({ id: 'a', weekday: 0, minuteOfDay: 8 * 60 + 30 })], [], 7, monday);
		expect(justPassed).toHaveLength(1);

		const longPassed = upcoming([slot({ id: 'a', weekday: 0, minuteOfDay: 6 * 60 })], [], 7, monday);
		// Only next week's remains, since this morning's is well past.
		expect(longPassed).toHaveLength(0);
	});

	it('drops an occurrence a session already stands in for', () => {
		const slots = [slot({ id: 'a', weekday: 0, minuteOfDay: 18 * 60 })];
		const taken = upcoming(slots, [at('2026-08-10T18:20')], 7, monday);
		expect(taken).toHaveLength(0);

		const untouched = upcoming(slots, [at('2026-08-10T12:00')], 7, monday);
		expect(untouched).toHaveLength(1);
	});

	it('reads every plan at once', () => {
		const occurrences = upcoming(
			[slot({ id: 'a', planId: 'one', weekday: 0, minuteOfDay: 18 * 60 }), slot({ id: 'b', planId: 'two', weekday: 0, minuteOfDay: 12 * 60 })],
			[],
			7,
			monday
		);
		expect(occurrences.map((o) => o.planId)).toEqual(['two', 'one']);
	});
});

describe('nextUp', () => {
	it('takes the soonest thing that has not gone by', () => {
		const now = at('2026-08-10T12:00');
		const next = nextUp([{ at: now + 5000 }, { at: now - GRACE_MS * 2 }, { at: now + 100 }], now);
		expect(next?.at).toBe(now + 100);
	});

	it('still counts something that began within the hour', () => {
		const now = at('2026-08-10T12:00');
		expect(nextUp([{ at: now - 30 * 60 * 1000 }], now)).not.toBeNull();
	});

	it('has nothing to say about an empty week', () => {
		expect(nextUp([], monday)).toBeNull();
	});
});

describe('weekArrowGoal', () => {
	it('adds the goals and ignores the slots that carry none', () => {
		expect(
			weekArrowGoal([slot({ id: 'a', arrowGoal: 60 }), slot({ id: 'b', arrowGoal: null }), slot({ id: 'c', arrowGoal: 72 })])
		).toBe(132);
	});

	it('counts the free arrows of every plan given, which are owed whenever they are shot', () => {
		const slots = [slot({ id: 'a', arrowGoal: 60 })];
		expect(weekArrowGoal(slots, [{ freeArrows: 90 }, { freeArrows: null }])).toBe(150);
		expect(weekArrowGoal([], [{ freeArrows: 90 }])).toBe(90);
	});
});

describe('onlyActive', () => {
	const plans = [
		{ id: 'a', isActive: 1, freeArrows: 30 },
		{ id: 'b', isActive: 0, freeArrows: 60 }
	];
	const slots = [
		{ planId: 'a', arrowGoal: 72 },
		{ planId: 'b', arrowGoal: 100 }
	];

	it('drops a plan put aside, and its slots with it', () => {
		const live = onlyActive(plans, slots);
		expect(live.plans.map((plan) => plan.id)).toEqual(['a']);
		expect(live.slots).toEqual([{ planId: 'a', arrowGoal: 72 }]);
	});

	it('leaves the week asking only what the plans still running ask', () => {
		const live = onlyActive(plans, slots);
		expect(weekArrowGoal(live.slots as PlanSlotLike[], live.plans)).toBe(102);
	});
});

/**
 * The dates a plan runs between. Both days count whole, so the tests are written on the boundaries:
 * that is where a plan either goes quiet a day early or asks for one outing too many.
 */
describe('isActiveOn', () => {
	const day = (iso: string) => at(`${iso}T00:00`);
	const season = (extra: Partial<PlanWindowLike> = {}): PlanWindowLike => ({
		id: 'p',
		isActive: 1,
		startDate: day('2026-08-10'),
		endDate: day('2026-08-30'),
		...extra
	});

	it('counts both boundary days whole', () => {
		expect(isActiveOn(season(), at('2026-08-10T00:00'))).toBe(true);
		expect(isActiveOn(season(), at('2026-08-30T23:30'))).toBe(true);
		expect(isActiveOn(season(), at('2026-08-09T23:59'))).toBe(false);
		expect(isActiveOn(season(), at('2026-08-31T00:00'))).toBe(false);
	});

	it('leaves an end open when the date is not given', () => {
		expect(isActiveOn(season({ startDate: null }), at('1999-01-01T12:00'))).toBe(true);
		expect(isActiveOn(season({ endDate: null }), at('2099-01-01T12:00'))).toBe(true);
		expect(isActiveOn(season({ startDate: null, endDate: null }), monday)).toBe(true);
	});

	it('says nothing for a plan put aside, whatever its dates say', () => {
		expect(isActiveOn(season({ isActive: 0 }), at('2026-08-12T12:00'))).toBe(false);
	});

	it('reads the date the day it falls in rather than the hour it was stored at', () => {
		const stored = season({ startDate: at('2026-08-10T21:45'), endDate: at('2026-08-30T03:10') });
		expect(isActiveOn(stored, at('2026-08-10T09:00'))).toBe(true);
		expect(isActiveOn(stored, at('2026-08-30T19:00'))).toBe(true);
	});
});

describe('upcoming inside a season', () => {
	const window = (extra: Partial<PlanWindowLike> = {}): PlanWindowLike => ({
		id: 'p',
		isActive: 1,
		startDate: null,
		endDate: null,
		...extra
	});
	// Tuesday and Friday evenings, which is enough to see a season cut a week in half.
	const twice = [
		slot({ id: 'tue', weekday: 1, minuteOfDay: 18 * 60 }),
		slot({ id: 'fri', weekday: 4, minuteOfDay: 18 * 60 })
	];

	it('hides the days after the plan is over and keeps the ones before', () => {
		const occurrences = upcoming(twice, [], 7, monday, [window({ endDate: at('2026-08-12T00:00') })]);
		expect(occurrences.map((o) => o.slotId)).toEqual(['tue']);
	});

	it('holds a plan back until the day it starts', () => {
		const occurrences = upcoming(twice, [], 14, monday, [
			window({ startDate: at('2026-08-13T00:00') })
		]);
		// Nothing this week, then both of next week's, since the Tuesday is before the start.
		expect(occurrences.map((o) => new Date(o.at).getDate())).toEqual([14, 18, 21]);
	});

	it('shows a plan that has not started yet the moment its first day comes round', () => {
		const later = upcoming([slot({ id: 'tue', weekday: 1 })], [], 14, monday, [
			window({ startDate: at('2026-08-18T00:00') })
		]);
		expect(later).toHaveLength(1);
		expect(new Date(later[0].at).getDate()).toBe(18);
	});

	it('says nothing at all for a plan whose season has gone by', () => {
		expect(upcoming(twice, [], 7, monday, [window({ endDate: at('2026-07-01T00:00') })])).toEqual([]);
	});

	it('leaves a plan it was told nothing about alone', () => {
		expect(upcoming(twice, [], 7, monday, [window({ id: 'other', endDate: monday })])).toHaveLength(2);
	});
});

describe('weekArrowGoalOn', () => {
	const week = at('2026-08-10T00:00');
	const plan = (extra: Partial<PlanWindowLike & PlanLike> = {}) => ({
		id: 'p',
		isActive: 1,
		startDate: null,
		endDate: null,
		freeArrows: null,
		...extra
	});
	const twice = [
		slot({ id: 'tue', weekday: 1, arrowGoal: 60 }),
		slot({ id: 'fri', weekday: 4, arrowGoal: 72 })
	];

	it('asks for the whole week while the plan covers it', () => {
		expect(weekArrowGoalOn(week, twice, [plan({ freeArrows: 30 })])).toBe(162);
	});

	it('counts the week a season ends in a day at a time', () => {
		const goal = weekArrowGoalOn(week, twice, [plan({ endDate: at('2026-08-12T00:00') })]);
		expect(goal).toBe(60);
	});

	it('asks nothing of a week outside the season', () => {
		expect(
			weekArrowGoalOn(week, twice, [plan({ freeArrows: 30, endDate: at('2026-07-01T00:00') })])
		).toBe(0);
	});

	it('claims the free arrows for a week the plan only partly covers', () => {
		const goal = weekArrowGoalOn(week, [], [plan({ freeArrows: 90, startDate: at('2026-08-15T00:00') })]);
		expect(goal).toBe(90);
	});

	it('ignores a plan put aside and a slot whose plan is gone', () => {
		expect(weekArrowGoalOn(week, twice, [plan({ isActive: 0, freeArrows: 30 })])).toBe(0);
		expect(weekArrowGoalOn(week, twice, [])).toBe(0);
	});

	it('reads the week off its own Monday whichever day it is given', () => {
		const fromWednesday = weekArrowGoalOn(at('2026-08-10T00:00'), twice, [plan()]);
		expect(fromWednesday).toBe(132);
	});
});

/** What the plan list prints in the corner of a row, which is three sentences and a silence. */
describe('planSeason', () => {
	const from = at('2026-08-10T00:00');
	const to = at('2026-09-30T00:00');

	it('names both dates when a plan is bounded at both ends', () => {
		expect(planSeason({ startDate: from, endDate: to })).toEqual({ key: 'betweenDates', from, to });
	});

	it('names the one end a plan has', () => {
		expect(planSeason({ startDate: from, endDate: null })).toEqual({ key: 'fromDate', from, to: null });
		expect(planSeason({ startDate: null, endDate: to })).toEqual({ key: 'untilDate', from: null, to });
	});

	it('says nothing about a plan that runs until it is put aside', () => {
		expect(planSeason({ startDate: null, endDate: null })).toBeNull();
	});
});
