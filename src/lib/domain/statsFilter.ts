import type { ScoredActivity } from './stats';
import { startOfDay } from './dates';

/**
 * What the statistics page is looking at. One object rather than a tab, because an archer asking
 * "how do I shoot in the wind with the wooden bow" is asking about several dimensions at once.
 */
export type StatsPeriod = 'all' | 'year' | 'month' | 'thisYear' | 'custom';

export type StatsDimension = 'rounds' | 'bows' | 'kinds' | 'wind';

export const DIMENSIONS: StatsDimension[] = ['rounds', 'bows', 'kinds', 'wind'];

export interface StatsFilter {
	period: StatsPeriod;
	/** Only read when the period is custom, and inclusive of the whole day at each end. */
	from: number | null;
	to: number | null;
	/** Empty means every value, which is not the same as none: a filter nobody set excludes nothing. */
	rounds: string[];
	bows: string[];
	kinds: string[];
	wind: string[];
}

export const EMPTY_FILTER: StatsFilter = {
	period: 'all',
	from: null,
	to: null,
	rounds: [],
	bows: [],
	kinds: [],
	wind: []
};

/**
 * How an activity maps onto each dimension. Passed in rather than read here because the bow and the
 * weather live on the session, and the domain layer never touches the database.
 */
export interface FilterContext {
	round: (activity: ScoredActivity) => string;
	bow: (activity: ScoredActivity) => string | null;
	kind: (activity: ScoredActivity) => string | null;
	wind: (activity: ScoredActivity) => string | null;
}

const DIMENSION_OF: Record<StatsDimension, keyof FilterContext> = {
	rounds: 'round',
	bows: 'bow',
	kinds: 'kind',
	wind: 'wind'
};

export interface Bounds {
	from: number;
	to: number;
}

/**
 * The instants the chart spans. All time starts at the first arrow ever shot rather than at some
 * fixed depth, so the axis never carries years of emptiness before an archer began.
 */
export function periodBounds(
	filter: StatsFilter,
	activities: ScoredActivity[],
	now = Date.now()
): Bounds {
	const to = endOfDay(now);
	const start = new Date(now);
	switch (filter.period) {
		case 'month':
			start.setMonth(start.getMonth() - 1);
			return { from: startOfDay(start.getTime()), to };
		case 'year':
			start.setFullYear(start.getFullYear() - 1);
			return { from: startOfDay(start.getTime()), to };
		case 'thisYear':
			return { from: new Date(start.getFullYear(), 0, 1).getTime(), to };
		case 'custom': {
			const from = filter.from ?? oldest(activities, now);
			return { from: startOfDay(from), to: endOfDay(filter.to ?? now) };
		}
		default:
			return { from: oldest(activities, now), to };
	}
}

function oldest(activities: ScoredActivity[], now: number): number {
	if (activities.length === 0) {
		// A year of empty months still reads as a chart, where a single point reads as a bug.
		const start = new Date(now);
		start.setFullYear(start.getFullYear() - 1);
		return startOfDay(start.getTime());
	}
	return startOfDay(Math.min(...activities.map((a) => a.startedAt)));
}

function endOfDay(at: number): number {
	const date = new Date(startOfDay(at));
	date.setHours(23, 59, 59, 999);
	return date.getTime();
}

/** Whether one activity passes every dimension except the one named, which is how facets are counted. */
function matches(
	activity: ScoredActivity,
	ctx: FilterContext,
	filter: StatsFilter,
	bounds: Bounds,
	except?: StatsDimension
): boolean {
	if (activity.startedAt < bounds.from || activity.startedAt > bounds.to) return false;
	for (const dimension of DIMENSIONS) {
		if (dimension === except) continue;
		const chosen = filter[dimension];
		if (chosen.length === 0) continue;
		const value = ctx[DIMENSION_OF[dimension]](activity);
		if (value === null || !chosen.includes(value)) return false;
	}
	return true;
}

export function applyFilter(
	activities: ScoredActivity[],
	ctx: FilterContext,
	filter: StatsFilter,
	now = Date.now()
): ScoredActivity[] {
	const bounds = periodBounds(filter, activities, now);
	return activities.filter((activity) => matches(activity, ctx, filter, bounds, undefined));
}

export interface Facet {
	key: string;
	rounds: number;
	arrows: number;
	selected: boolean;
}

/**
 * The options one chip offers, counted with every other chip applied but not its own: choosing a
 * second bow must never be blocked by the first, and no option should lead to an empty page.
 */
export function facets(
	activities: ScoredActivity[],
	ctx: FilterContext,
	filter: StatsFilter,
	dimension: StatsDimension,
	now = Date.now()
): Facet[] {
	const bounds = periodBounds(filter, activities, now);
	const counts = new Map<string, Facet>();
	for (const activity of activities) {
		if (!matches(activity, ctx, filter, bounds, dimension)) continue;
		const key = ctx[DIMENSION_OF[dimension]](activity);
		if (key === null) continue;
		const facet = counts.get(key) ?? {
			key,
			rounds: 0,
			arrows: 0,
			selected: false
		};
		facet.rounds += 1;
		facet.arrows += activity.arrowsShot;
		counts.set(key, facet);
	}

	// A chosen value stays on the list even when nothing else matches it, or it could never be undone.
	for (const key of filter[dimension]) {
		if (!counts.has(key)) counts.set(key, { key, rounds: 0, arrows: 0, selected: true });
	}

	return [...counts.values()]
		.map((facet) => ({
			...facet,
			selected: filter[dimension].includes(facet.key)
		}))
		.sort((a, b) => b.arrows - a.arrows || a.key.localeCompare(b.key));
}

/** How many chips are narrowing the page, which is what the reset control is offered on. */
export function activeCount(filter: StatsFilter): number {
	const period = filter.period === 'all' ? 0 : 1;
	return period + DIMENSIONS.filter((dimension) => filter[dimension].length > 0).length;
}

export function toggleValue(
	filter: StatsFilter,
	dimension: StatsDimension,
	value: string
): StatsFilter {
	const chosen = filter[dimension];
	return {
		...filter,
		[dimension]: chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value]
	};
}

/** A hand edited or half written preference must not take the page down with it. */
export function parseFilter(raw: string | null): StatsFilter {
	if (!raw) return EMPTY_FILTER;
	try {
		const value = JSON.parse(raw) as Partial<StatsFilter>;
		const list = (input: unknown) =>
			Array.isArray(input) ? input.filter((v): v is string => typeof v === 'string') : [];
		const periods: StatsPeriod[] = ['all', 'year', 'month', 'thisYear', 'custom'];
		return {
			period: periods.includes(value.period as StatsPeriod) ? (value.period as StatsPeriod) : 'all',
			from: typeof value.from === 'number' ? value.from : null,
			to: typeof value.to === 'number' ? value.to : null,
			rounds: list(value.rounds),
			bows: list(value.bows),
			kinds: list(value.kinds),
			wind: list(value.wind)
		};
	} catch {
		return EMPTY_FILTER;
	}
}
