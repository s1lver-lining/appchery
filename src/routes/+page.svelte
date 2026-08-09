<script lang="ts">
	import { t } from '$lib/i18n';
	import { listAllActivities } from '$lib/db/repository';
	import {
		summariseByRound,
		overview,
		type ScoredActivity,
		type RoundSummary,
		type Overview
	} from '$lib/domain/stats';
	import type { RoundDefinition } from '$lib/domain/rounds/types';

	let summaries = $state<RoundSummary[]>([]);
	let totals = $state<Overview | null>(null);

	async function refresh() {
		const activities = await listAllActivities();
		const scored: ScoredActivity[] = activities
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
		totals = overview(scored);
		summaries = summariseByRound(scored);
	}
	$effect(() => {
		refresh();
	});

	/** Sparkline over the round's history, scaled to its own range so small moves stay readable. */
	function sparkline(summary: RoundSummary): string {
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

	const peakMonth = $derived(Math.max(1, ...(totals?.byMonth ?? []).map((m) => m.arrows)));
	const topRoundArrows = $derived(Math.max(1, ...(totals?.byRound ?? []).map((r) => r.arrows)));

	/** Month labels come from the locale, so the chart reads the same way as every other date. */
	function monthLabel(month: string): string {
		const [year, index] = month.split('-').map(Number);
		return new Date(year, index - 1, 1).toLocaleDateString(undefined, { month: 'narrow' });
	}

	function monthTitle(month: string): string {
		const [year, index] = month.split('-').map(Number);
		return new Date(year, index - 1, 1).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
	<h1 class="mt-2 text-2xl font-bold tracking-tight">{$t('stats.title')}</h1>

	{#if totals && totals.rounds > 0}
		<section class="rounded-xl border border-line bg-surface p-4">
			<h2 class="text-sm font-semibold">{$t('stats.overview')}</h2>

			<div class="mt-3 flex items-end gap-3">
				<div>
					<p class="tabular text-4xl leading-none font-bold text-brand-text">{totals.arrows}</p>
					<p class="mt-1 text-xs text-muted">{$t('stats.totalArrows')}</p>
				</div>
				<dl class="ml-auto grid grid-cols-3 gap-x-4 text-right">
					<div>
						<dd class="tabular text-lg font-semibold">{totals.days}</dd>
						<dt class="text-[11px] text-muted">{$t('stats.daysShot')}</dt>
					</div>
					<div>
						<dd class="tabular text-lg font-semibold">{totals.rounds}</dd>
						<dt class="text-[11px] text-muted">{$t('stats.roundsShot')}</dt>
					</div>
					<div>
						<dd class="tabular text-lg font-semibold">{totals.averagePerArrow.toFixed(2)}</dd>
						<dt class="text-[11px] text-muted">{$t('stats.perArrow')}</dt>
					</div>
				</dl>
			</div>

			<p class="mt-1 text-xs text-muted">
				{$t('stats.completeRounds', { n: totals.completeRounds })}
			</p>

			<h3 class="mt-4 mb-2 text-xs font-semibold text-muted">{$t('stats.volume')}</h3>
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

			<h3 class="mt-4 mb-2 text-xs font-semibold text-muted">{$t('stats.byRound')}</h3>
			<ul class="space-y-1.5">
				{#each totals.byRound.slice(0, 5) as row (row.name)}
					<li class="flex items-center gap-2 text-sm">
						<span class="w-28 shrink-0 truncate text-muted">{row.name}</span>
						<span class="h-2 flex-1 rounded-full bg-sunk">
							<span
								class="block h-full rounded-full bg-brand"
								style="width: {(row.arrows / topRoundArrows) * 100}%"
							></span>
						</span>
						<span class="tabular w-10 text-right font-semibold">{row.arrows}</span>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-[11px] text-muted">{$t('stats.byRoundHint')}</p>
		</section>
	{/if}

	{#if summaries.length === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('stats.empty')}
		</p>
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
					{$t('stats.bestOn', { date: new Date(summary.best.startedAt).toLocaleDateString() })}
					· {summary.best.count10s}
					{$t('score.tens')} · {summary.best.countX}
					{$t('score.xs')}
				</p>
			</section>
		{/each}
	{/if}
</div>
