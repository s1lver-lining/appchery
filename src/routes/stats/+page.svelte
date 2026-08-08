<script lang="ts">
	import { t } from '$lib/i18n';
	import { listAllActivities } from '$lib/db/repository';
	import { summariseByRound, type ScoredActivity, type RoundSummary } from '$lib/domain/stats';
	import type { RoundDefinition } from '$lib/domain/rounds/types';

	let summaries = $state<RoundSummary[]>([]);

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
				status: a.status,
				roundDefinitionId: a.roundDefinitionId,
				round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
			}));
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
</script>

<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4">
	<h1 class="text-2xl font-bold tracking-tight">{$t('stats.title')}</h1>

	{#if summaries.length === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('stats.empty')}
		</p>
	{:else}
		{#each summaries as summary (summary.key)}
			<section class="rounded-xl border border-line bg-surface p-4">
				<div class="flex items-baseline justify-between gap-2">
					<h2 class="font-semibold">{summary.name}</h2>
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
									? 'text-brand'
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
							class="text-brand"
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
