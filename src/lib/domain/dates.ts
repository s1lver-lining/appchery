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

export function startOfWeek(at: number): number {
	const date = new Date(startOfDay(at));
	// getDay is Sunday based, so Sunday counts back six days rather than none.
	const offset = (date.getDay() + 6) % 7;
	return date.getTime() - offset * DAY;
}

export function endOfWeek(at: number): number {
	return startOfWeek(at) + 6 * DAY;
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

/** Groups newest week first, matching a list read from the top. */
export function groupByWeek<T>(items: T[], at: (item: T) => number): WeekGroup<T>[] {
	const buckets = new Map<number, T[]>();
	for (const item of items) {
		const key = startOfWeek(at(item));
		const bucket = buckets.get(key);
		if (bucket) bucket.push(item);
		else buckets.set(key, [item]);
	}

	return [...buckets.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([start, list]) => ({
			start,
			end: start + 6 * DAY,
			week: isoWeek(start),
			items: [...list].sort((a, b) => at(b) - at(a))
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
