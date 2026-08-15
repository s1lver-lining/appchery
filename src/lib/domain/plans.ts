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

/** A plan bounded by dates, either end open. */
export interface PlanWindowLike {
	id: string;
	isActive: number;
	startDate: number | null;
	endDate: number | null;
}

/**
 * Whether a plan asks anything of one day. Both dates count whole days, so a plan ending on the
 * Sunday still calls for the Sunday evening: an end date is the last day, not the moment it stops.
 */
export function isActiveOn(plan: PlanWindowLike, at: number): boolean {
	if (plan.isActive === 0) return false;
	const day = startOfDay(at);
	if (plan.startDate !== null && day < startOfDay(plan.startDate)) return false;
	if (plan.endDate !== null && day > startOfDay(plan.endDate)) return false;
	return true;
}

/**
 * Every slot of every plan over the next `days` days, oldest first. An occurrence is dropped once a
 * session exists near it, since the archer has already turned that one into a real outing.
 *
 * The window is checked a day at a time rather than once for the whole list, because a plan that
 * runs out on Thursday still has to show its Tuesday and hide the Friday that follows it.
 */
export function upcoming(
	slots: PlanSlotLike[],
	sessionTimes: number[] = [],
	days = 7,
	now = Date.now(),
	plans: PlanWindowLike[] = []
): Occurrence[] {
	const windows = new Map(plans.map((plan) => [plan.id, plan]));
	const today = startOfDay(now);
	const result: Occurrence[] = [];

	for (let i = 0; i < days; i++) {
		const date = new Date(today);
		date.setDate(date.getDate() + i);
		const day = date.getTime();
		for (const slot of slots) {
			if (slot.weekday !== weekdayOf(day)) continue;
			const window = windows.get(slot.planId);
			if (window && !isActiveOn(window, day)) continue;
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

export interface PlanLike {
	/** Arrows the week asks for that belong to no outing in particular. */
	freeArrows: number | null;
}

/**
 * How a plan's season reads on a list: which of the three sentences applies, and the dates it is
 * built from. A plan bounded at neither end has no season to announce, so it says nothing at all.
 */
export function planSeason(plan: {
	startDate: number | null;
	endDate: number | null;
}): { key: 'betweenDates' | 'fromDate' | 'untilDate'; from: number | null; to: number | null } | null {
	if (plan.startDate !== null && plan.endDate !== null)
		return { key: 'betweenDates', from: plan.startDate, to: plan.endDate };
	if (plan.startDate !== null) return { key: 'fromDate', from: plan.startDate, to: null };
	if (plan.endDate !== null) return { key: 'untilDate', from: null, to: plan.endDate };
	return null;
}

/**
 * A plan put aside asks nothing of the week: its slots stop showing and its arrows stop counting,
 * while everything it produced before stays exactly where it is.
 */
export function onlyActive<P extends { id: string; isActive: number }, S extends { planId: string }>(
	plans: P[],
	slots: S[]
): { plans: P[]; slots: S[] } {
	const live = plans.filter((plan) => plan.isActive !== 0);
	const ids = new Set(live.map((plan) => plan.id));
	return { plans: live, slots: slots.filter((slot) => ids.has(slot.planId)) };
}

/**
 * What a week of these plans asks for, which is the figure that says whether they are realistic.
 * Free arrows count towards it: they are owed by the end of the week like any other.
 */
export function weekArrowGoal(slots: PlanSlotLike[], plans: PlanLike[] = []): number {
	return (
		slots.reduce((sum, slot) => sum + (slot.arrowGoal ?? 0), 0) +
		plans.reduce((sum, plan) => sum + (plan.freeArrows ?? 0), 0)
	);
}

/**
 * What one particular week asks for, which is the same figure bounded by the plans' dates. A week a
 * plan only half covers is counted a day at a time, so the week a season ends in asks for the
 * outings it really holds rather than for a whole week of them.
 */
export function weekArrowGoalOn(
	weekStart: number,
	slots: PlanSlotLike[],
	plans: (PlanWindowLike & PlanLike)[]
): number {
	const byId = new Map(plans.map((plan) => [plan.id, plan]));
	const monday = new Date(startOfDay(weekStart));
	const dayOfWeek = (weekday: number) =>
		new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weekday).getTime();

	const slotArrows = slots.reduce((sum, slot) => {
		const plan = byId.get(slot.planId);
		if (!plan || !isActiveOn(plan, dayOfWeek(slot.weekday))) return sum;
		return sum + (slot.arrowGoal ?? 0);
	}, 0);

	// Free arrows belong to the week rather than to a day, so one day inside the window claims them.
	const freeArrows = plans.reduce((sum, plan) => {
		const anyDay = Array.from({ length: 7 }, (_, day) => dayOfWeek(day)).some((at) =>
			isActiveOn(plan, at)
		);
		return anyDay ? sum + (plan.freeArrows ?? 0) : sum;
	}, 0);

	return slotArrows + freeArrows;
}
