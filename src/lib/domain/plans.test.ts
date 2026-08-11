import { describe, it, expect } from 'vitest';
import { upcoming, nextUp, weekArrowGoal, weekdayOf, GRACE_MS, type PlanSlotLike } from './plans';

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
});
