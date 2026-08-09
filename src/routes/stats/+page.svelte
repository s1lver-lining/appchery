<script lang="ts">
	import { t } from '$lib/i18n';
	import { listAllActivities } from '$lib/db/repository';
	import {
		summariseByRound,
		overview,
		inRange,
		dailyVolume,
		type ScoredActivity,
		type StatsRange
	} from '$lib/domain/stats';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { registerTabs } from '$lib/nav';
	import { dateFormats, statsRange } from '$lib/prefs';

	let scored = $state<ScoredActivity[]>([]);
	const RANGE_KEYS: StatsRange[] = ['all', 'year', 'month'];
	// Restored from the last visit, because an archer who cares about this month cares every time.
	let range = $state<StatsRange>(
		RANGE_KEYS.includes($statsRange as StatsRange) ? ($statsRange as StatsRange) : 'all'
	);
	$effect(() => {
		statsRange.set(range);
	});
	let showByRound = $state(false);

	async function refresh() {
		const activities = await listAllActivities();
		scored = activities
			.filter((a) => a.kind === 'scoring')
			.map((a) => ({
				id: a.id,
				sessionId: a.sessionId,
				startedAt: a.startedAt,
				totalScore: a.totalScore,
				arrowsShot: a.arrowsShot,
				count10s: a.count10s,
				countX: a.countX,
				roundDefinitionId: a.roundDefinitionId,
				round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
			}));
	}
	$effect(() => {
		refresh();
	});

	/**
	 * Every figure on the page reads from the selected window, so switching the tab moves the bests
	 * and the averages with it rather than only the chart.
	 */
	const windowed = $derived(inRange(scored, range));
	const totals = $derived(overview(windowed, range === 'month' ? 6 : 12));
	const summaries = $derived(summariseByRound(windowed));

	const RANGES: { key: StatsRange; label: string }[] = $derived([
		{ key: 'all', label: $t('stats.rangeAll') },
		{ key: 'year', label: $t('stats.rangeYear') },
		{ key: 'month', label: $t('stats.rangeMonth') }
	]);

	/** A month of monthly bars is one bar, so the short window is charted a day at a time. */
	const daily = $derived(range === 'month' ? dailyVolume(windowed, 30) : []);
	const peakDay = $derived(Math.max(1, ...daily.map((d) => d.arrows)));

	/** Sparkline over the round's history, scaled to its own range so small moves stay readable. */
	function sparkline(summary: (typeof summaries)[number]): string {
		const scores = summary.history.map((a) => a.totalScore);
		if (scores.length < 2) return '';
		const min = Math.min(...scores);
		const max = Math.max(...scores);
		const span = max - min || 1;
		return scores
			.map((score, i) => {
				const x = (i / (scores.length - 1)) * 100;
				const y = 24 - ((score - min) / span) * 22;
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}

	const peakMonth = $derived(Math.max(1, ...totals.byMonth.map((m) => m.arrows)));
	const topRoundArrows = $derived(Math.max(1, ...totals.byRound.map((r) => r.arrows)));

	/** Month labels follow the app language, so the chart reads the same way as every other date. */
	const firstOfMonth = (month: string) => {
		const [year, index] = month.split('-').map(Number);
		return new Date(year, index - 1, 1).getTime();
	};
	const monthLabel = $derived((month: string) => $dateFormats.monthNarrow(firstOfMonth(month)));
	const monthTitle = $derived((month: string) => $dateFormats.monthYear(firstOfMonth(month)));

	$effect(() =>
		registerTabs({
			count: RANGES.length,
			index: RANGES.findIndex((item) => item.key === range),
			select: (i) => (range = RANGES[i].key)
		})
	);
</script>

<PageHeader motif="stats" title={$t('stats.title')} />

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<nav class="flex gap-1 rounded-lg bg-sunk p-1">
		{#each RANGES as item (item.key)}
			<button
				class="flex-1 rounded-md py-1.5 text-sm font-medium
					{range === item.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
				onclick={() => (range = item.key)}
			>
				{item.label}
			</button>
		{/each}
	</nav>

	{#if totals.rounds > 0}
		<section class="rounded-xl border border-line bg-surface p-4">
			<h2 class="text-sm font-semibold">{$t('stats.overview')}</h2>

			<div class="mt-3 flex items-end gap-3">
				<div>
					<p class="tabular text-4xl leading-none font-bold text-brand-text">{totals.arrows}</p>
					<p class="mt-1 text-xs text-muted">{$t('stats.totalArrows')}</p>
				</div>
				<dl class="ml-auto grid grid-cols-2 gap-x-5 text-right">
					<div>
						<dd class="tabular text-lg font-semibold">{totals.days}</dd>
						<dt class="text-[11px] text-muted">{$t('stats.daysShot')}</dt>
					</div>
					<div>
						<dd class="tabular text-lg font-semibold">{totals.rounds}</dd>
						<dt class="text-[11px] text-muted">{$t('stats.roundsShot')}</dt>
					</div>
				</dl>
			</div>

			<h3 class="mt-4 mb-2 text-xs font-semibold text-muted">
				{range === 'month' ? $t('stats.volumeDaily') : $t('stats.volume')}
			</h3>
			{#if range === 'month'}
				<div class="flex h-28 items-end gap-px">
					{#each daily as day (day.at)}
						<div class="flex flex-1 flex-col items-center gap-1" title={$dateFormats.date(day.at)}>
							<!-- A hairline for a rest day, so the axis stays legible where nothing was shot. -->
							<div
								class="w-full rounded-t {day.arrows > 0 ? 'bg-brand' : 'bg-line'}"
								style="height: {day.arrows > 0 ? Math.max(4, (day.arrows / peakDay) * 88) : 2}px"
							></div>
						</div>
					{/each}
				</div>
				<!-- One label per week: thirty of them would be unreadable at this width. -->
				<div class="mt-1 flex gap-px">
					{#each daily as day, i (day.at)}
						<span class="flex-1 text-center text-[10px] leading-none text-muted">
							{i % 7 === 0 ? new Date(day.at).getDate() : ''}
						</span>
					{/each}
				</div>
			{:else}
				<div class="flex h-28 items-end gap-1">
					{#each totals.byMonth as month (month.month)}
						<div class="flex flex-1 flex-col items-center gap-1" title={monthTitle(month.month)}>
							<!-- A hairline for an empty month, so the axis stays legible where nothing was shot. -->
							<div
								class="w-full rounded-t {month.arrows > 0 ? 'bg-brand' : 'bg-line'}"
								style="height: {month.arrows > 0
									? Math.max(6, (month.arrows / peakMonth) * 88)
									: 2}px"
							></div>
							<span class="text-[10px] leading-none text-muted">{monthLabel(month.month)}</span>
						</div>
					{/each}
				</div>
			{/if}

			<button
				class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium"
				onclick={() => (showByRound = true)}
			>
				<Icon name="chart" size={16} />
				{$t('stats.byRoundOpen')}
			</button>
		</section>
	{:else}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('stats.emptyRange')}
		</p>
	{/if}

	{#if summaries.length === 0}
		<!-- Only worth saying when something was shot: an empty window already says so above. -->
		{#if totals.rounds > 0}
			<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
				{$t('stats.empty')}
			</p>
		{/if}
	{:else}
		<div>
			<h2 class="text-sm font-semibold">{$t('stats.perRoundTitle')}</h2>
			<p class="text-xs text-muted">{$t('stats.perRoundHint')}</p>
		</div>

		{#each summaries as summary (summary.key)}
			<section class="rounded-xl border border-line bg-surface p-4">
				<div class="flex items-baseline justify-between gap-2">
					<h3 class="font-semibold">{summary.name}</h3>
					<span class="text-xs text-muted">
						{$t('stats.rounds', { n: summary.history.length })}
					</span>
				</div>

				<div class="mt-3 flex items-end gap-6">
					<div>
						<p class="tabular text-3xl font-bold">{summary.best.totalScore}</p>
						<p class="text-xs text-muted">{$t('stats.personalBest')}</p>
					</div>
					<div>
						<p class="tabular text-xl font-semibold">{summary.average.toFixed(0)}</p>
						<p class="text-xs text-muted">{$t('stats.average')}</p>
					</div>
					{#if summary.trend !== null}
						<div>
							<p
								class="tabular text-xl font-semibold {summary.trend >= 0
									? 'text-brand-text'
									: 'text-danger'}"
							>
								{summary.trend >= 0 ? '+' : ''}{summary.trend.toFixed(2)}
							</p>
							<p class="text-xs text-muted">{$t('stats.trend')}</p>
						</div>
					{/if}
				</div>

				{#if summary.history.length > 1}
					<svg viewBox="0 0 100 26" preserveAspectRatio="none" class="mt-3 h-12 w-full">
						<path
							d={sparkline(summary)}
							fill="none"
							stroke="currentColor"
							class="text-brand-text"
							stroke-width="1.4"
							vector-effect="non-scaling-stroke"
						/>
					</svg>
				{/if}

				<p class="mt-2 text-xs text-muted">
					{$t('stats.bestOn', { date: $dateFormats.date(summary.best.startedAt) })}
					· {summary.best.count10s}
					{$t('score.tens')} · {summary.best.countX}
					{$t('score.xs')}
				</p>
			</section>
		{/each}
	{/if}
</div>

{#if showByRound}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
			aria-label={$t('common.close')}
			onclick={() => (showByRound = false)}
		></button>

		<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
			<div class="mb-1 flex items-center justify-between">
				<h2 class="text-lg font-bold">{$t('stats.byRound')}</h2>
				<button
					class="text-muted"
					aria-label={$t('common.close')}
					onclick={() => (showByRound = false)}
				>
					<Icon name="close" size={20} />
				</button>
			</div>
			<p class="mb-3 text-xs text-muted">{$t('stats.byRoundHint')}</p>

			<ul class="max-h-[60dvh] space-y-1.5 overflow-y-auto">
				{#each totals.byRound as row (row.name)}
					<li class="flex items-center gap-2 text-sm">
						<span class="w-24 shrink-0 truncate text-muted">{row.name}</span>
						<span class="h-2 flex-1 rounded-full bg-sunk">
							<span
								class="block h-full rounded-full bg-brand"
								style="width: {(row.arrows / topRoundArrows) * 100}%"
							></span>
						</span>
						<span class="tabular w-10 shrink-0 text-right font-semibold">{row.arrows}</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
