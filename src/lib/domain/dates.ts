/**
 * Calendar helpers for grouping shooting by week and month. Weeks are ISO: Monday first, and the
 * week number is the one archers see on a club planning, not a count from the first of January.
 */

const DAY = 86_400_000;

/** Midnight local time, which is the boundary a shooter means by "that day". */
export function startOfDay(at: number): number {
	const date = new Date(at);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

/**
 * The part of the day a session took place in, which is what an unnamed session is called. The
 * night runs from 23h to 6h, so a late finish stays one session rather than turning into a morning.
 */
export function timeOfDay(at: number): 'morning' | 'afternoon' | 'evening' | 'night' {
	const hour = new Date(at).getHours();
	if (hour >= 6 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 18) return 'afternoon';
	if (hour >= 18 && hour < 23) return 'evening';
	return 'night';
}

export function startOfWeek(at: number): number {
	const date = new Date(startOfDay(at));
	// getDay is Sunday based, so Sunday counts back six days rather than none.
	const offset = (date.getDay() + 6) % 7;
	// Stepped through the Date constructor: a zone that turns its clocks at midnight would otherwise
	// leave the week starting an hour off, and split one week of shooting across two buckets.
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset).getTime();
}

export function endOfWeek(at: number): number {
	const start = new Date(startOfWeek(at));
	return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6).getTime();
}

/** ISO 8601: week 1 is the one holding the first Thursday of the year. */
export function isoWeek(at: number): number {
	const date = new Date(startOfDay(at));
	const thursday = new Date(startOfWeek(date.getTime()) + 3 * DAY);
	const firstThursday = new Date(thursday.getFullYear(), 0, 4);
	const firstWeekThursday = new Date(startOfWeek(firstThursday.getTime()) + 3 * DAY);
	return Math.round((thursday.getTime() - firstWeekThursday.getTime()) / (7 * DAY)) + 1;
}

export interface WeekGroup<T> {
	/** Start of the week, which doubles as the key and as the sort order. */
	start: number;
	end: number;
	week: number;
	items: T[];
}

/** Groups oldest week first, the way a calendar reads: the list is scrolled to today, not to its top. */
export function groupByWeek<T>(items: T[], at: (item: T) => number): WeekGroup<T>[] {
	const buckets = new Map<number, T[]>();
	for (const item of items) {
		const key = startOfWeek(at(item));
		const bucket = buckets.get(key);
		if (bucket) bucket.push(item);
		else buckets.set(key, [item]);
	}

	return [...buckets.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([start, list]) => ({
			start,
			end: endOfWeek(start),
			week: isoWeek(start),
			items: [...list].sort((a, b) => at(a) - at(b))
		}));
}

/**
 * The days of a month laid out as full weeks, so a calendar grid never has to pad itself. Days from
 * the neighbouring months are included and flagged, because a week that straddles two months is
 * still one week of shooting.
 */
export function monthGrid(year: number, month: number): { at: number; inMonth: boolean }[] {
	const first = startOfWeek(new Date(year, month, 1).getTime());
	const lastOfMonth = new Date(year, month + 1, 0).getTime();
	const last = endOfWeek(lastOfMonth);

	// Stepped through the Date constructor rather than by adding milliseconds, so a daylight saving
	// change cannot drift the grid onto the wrong day.
	const from = new Date(first);
	const count = Math.round((last - first) / DAY) + 1;
	const days: { at: number; inMonth: boolean }[] = [];
	for (let i = 0; i < count; i++) {
		const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
		days.push({ at: day.getTime(), inMonth: day.getMonth() === month });
	}
	return days;
}
