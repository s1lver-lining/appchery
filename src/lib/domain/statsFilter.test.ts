import { describe, it, expect } from 'vitest';
import {
	EMPTY_FILTER,
	applyFilter,
	facets,
	activeCount,
	toggleValue,
	parseFilter,
	periodBounds,
	type FilterContext,
	type StatsFilter
} from './statsFilter';
import type { ScoredActivity } from './stats';
import { getRound } from './rounds/seed';

const round = getRound('wa720-70m')!;
const MARCH = new Date(2025, 2, 10, 12).getTime();
const DAY = 86_400_000;

function activity(partial: Partial<ScoredActivity> & { id: string }): ScoredActivity {
	return {
		sessionId: 's',
		startedAt: MARCH,
		totalScore: 600,
		arrowsShot: 72,
		count10s: 20,
		countX: 5,
		roundDefinitionId: round.id,
		round,
		...partial
	};
}

const ctx: FilterContext = {
	round: (a) => (a.id.startsWith('i') ? 'indoor' : 'outdoor'),
	bow: (a) => (a.id.endsWith('c') ? 'Compound' : 'Recurve'),
	kind: (a) => (a.id.includes('x') ? 'competition' : 'practice'),
	wind: (a) => (a.id.includes('w') ? 'strong' : null)
};

const filter = (patch: Partial<StatsFilter> = {}): StatsFilter => ({
	...EMPTY_FILTER,
	...patch
});

describe('applyFilter', () => {
	const all = [activity({ id: 'o' }), activity({ id: 'ic' }), activity({ id: 'ox' })];

	it('excludes nothing when no chip was set', () => {
		expect(applyFilter(all, ctx, filter(), MARCH)).toHaveLength(3);
	});

	it('narrows on several dimensions at once', () => {
		const kept = applyFilter(all, ctx, filter({ rounds: ['outdoor'], kinds: ['practice'] }), MARCH);
		expect(kept.map((a) => a.id)).toEqual(['o']);
	});

	it('keeps every chosen value of one dimension, since a chip is an either or', () => {
		const kept = applyFilter(all, ctx, filter({ bows: ['Recurve', 'Compound'] }), MARCH);
		expect(kept).toHaveLength(3);
	});

	it('drops an activity a dimension cannot place, because it cannot be said to match', () => {
		expect(applyFilter(all, ctx, filter({ wind: ['strong'] }), MARCH)).toEqual([]);
	});
});

describe('periodBounds', () => {
	it('starts all time at the first arrow ever shot, not at a fixed depth', () => {
		const first = MARCH - 400 * DAY;
		const bounds = periodBounds(filter(), [activity({ id: 'a', startedAt: first })], MARCH);
		expect(bounds.from).toBeLessThanOrEqual(first);
		expect(bounds.from).toBeGreaterThan(first - DAY);
	});

	it('reads a month as the last thirty days rather than as the calendar month', () => {
		const bounds = periodBounds(filter({ period: 'month' }), [], MARCH);
		expect(new Date(bounds.from).getMonth()).toBe(1);
	});

	it('runs this year from the first of January', () => {
		const bounds = periodBounds(filter({ period: 'thisYear' }), [], MARCH);
		expect(new Date(bounds.from).getMonth()).toBe(0);
		expect(new Date(bounds.from).getDate()).toBe(1);
	});

	it('takes a custom range whole at both ends, so a same day range holds that day', () => {
		const bounds = periodBounds(filter({ period: 'custom', from: MARCH, to: MARCH }), [], MARCH);
		const kept = applyFilter(
			[activity({ id: 'a', startedAt: new Date(2025, 2, 10, 23).getTime() })],
			ctx,
			filter({ period: 'custom', from: MARCH, to: MARCH }),
			MARCH
		);
		expect(bounds.to).toBeGreaterThan(bounds.from);
		expect(kept).toHaveLength(1);
	});
});

describe('facets', () => {
	const all = [activity({ id: 'o' }), activity({ id: 'ic' }), activity({ id: 'ox' })];

	it('counts an option with the other chips applied, so no option leads nowhere', () => {
		const bows = facets(all, ctx, filter({ rounds: ['indoor'] }), 'bows', MARCH);
		expect(bows.map((f) => [f.key, f.rounds])).toEqual([['Compound', 1]]);
	});

	it('ignores its own chip, so a second value is never blocked by the first', () => {
		const bows = facets(all, ctx, filter({ bows: ['Compound'] }), 'bows', MARCH);
		expect(bows.map((f) => f.key).sort()).toEqual(['Compound', 'Recurve']);
		expect(bows.find((f) => f.key === 'Compound')?.selected).toBe(true);
	});

	it('keeps a chosen value on the list even when nothing matches it any more', () => {
		const winds = facets(all, ctx, filter({ wind: ['calm'] }), 'wind', MARCH);
		expect(winds.map((f) => f.key)).toEqual(['calm']);
	});
});

describe('activeCount', () => {
	it('counts the period only once it narrows anything', () => {
		expect(activeCount(filter())).toBe(0);
		expect(activeCount(filter({ period: 'month' }))).toBe(1);
		expect(activeCount(filter({ period: 'month', bows: ['Recurve'] }))).toBe(2);
	});
});

describe('toggleValue', () => {
	it('adds then removes, leaving the rest of the filter alone', () => {
		const on = toggleValue(filter({ period: 'year' }), 'kinds', 'competition');
		expect(on.kinds).toEqual(['competition']);
		expect(toggleValue(on, 'kinds', 'competition').kinds).toEqual([]);
		expect(on.period).toBe('year');
	});
});

describe('parseFilter', () => {
	it('falls back to the whole history rather than throwing on a broken preference', () => {
		expect(parseFilter('{oops')).toEqual(EMPTY_FILTER);
		expect(parseFilter(null)).toEqual(EMPTY_FILTER);
		expect(parseFilter('{"period":"decade","bows":[1,"Recurve"]}')).toEqual({
			...EMPTY_FILTER,
			bows: ['Recurve']
		});
	});
});
