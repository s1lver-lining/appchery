import { startOfDay } from './dates';

/**
 * A plan is a template week, so its slots are turned into dates on the fly rather than written out.
 * Nothing is stored for an outing until the archer taps it: a week skipped leaves no trace, which is
 * what makes a plan safe to keep around for a season.
 */

export interface PlanSlotLike {
	id: string;
	planId: string;
	/** 0 is Monday, matching the calendar grid. */
	weekday: number;
	minuteOfDay: number;
	arrowGoal: number | null;
	label: string | null;
}

export interface Occurrence {
	slotId: string;
	planId: string;
	at: number;
	arrowGoal: number | null;
	label: string | null;
}

/** Monday first, because that is the week the rest of the app counts in. */
export function weekdayOf(at: number): number {
	return (new Date(at).getDay() + 6) % 7;
}

export function slotAt(day: number, minuteOfDay: number): number {
	const date = new Date(day);
	// Built through the constructor so a daylight saving change moves the clock, not the hour shown.
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
		Math.floor(minuteOfDay / 60),
		minuteOfDay % 60
	).getTime();
}

/** A slot still counts as coming up for an hour after its time, so a late start is not lost. */
export const GRACE_MS = 60 * 60 * 1000;

/**
 * Every slot of every plan over the next `days` days, oldest first. An occurrence is dropped once a
 * session exists near it, since the archer has already turned that one into a real outing.
 */
export function upcoming(
	slots: PlanSlotLike[],
	sessionTimes: number[] = [],
	days = 7,
	now = Date.now()
): Occurrence[] {
	const today = startOfDay(now);
	const result: Occurrence[] = [];

	for (let i = 0; i < days; i++) {
		const date = new Date(today);
		date.setDate(date.getDate() + i);
		const day = date.getTime();
		for (const slot of slots) {
			if (slot.weekday !== weekdayOf(day)) continue;
			const at = slotAt(day, slot.minuteOfDay);
			if (at < now - GRACE_MS) continue;
			if (sessionTimes.some((time) => Math.abs(time - at) < 90 * 60 * 1000)) continue;
			result.push({ slotId: slot.id, planId: slot.planId, at, arrowGoal: slot.arrowGoal, label: slot.label });
		}
	}

	return result.sort((a, b) => a.at - b.at);
}

/** What the home page announces: the soonest thing ahead, real session or planned slot alike. */
export function nextUp<T extends { at: number }>(candidates: T[], now = Date.now()): T | null {
	const ahead = candidates.filter((item) => item.at >= now - GRACE_MS).sort((a, b) => a.at - b.at);
	return ahead[0] ?? null;
}

/** What a week of this plan asks for, which is the figure that says whether it is realistic. */
export function weekArrowGoal(slots: PlanSlotLike[]): number {
	return slots.reduce((sum, slot) => sum + (slot.arrowGoal ?? 0), 0);
}
