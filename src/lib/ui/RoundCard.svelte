<script lang="ts">
	import { t } from '$lib/i18n';
	import { dateFormats } from '$lib/prefs';
	import Icon from './Icon.svelte';
	import { withOrigin } from '$lib/nav';
	import ScoreScale from './ScoreScale.svelte';
	import DistributionChart from './DistributionChart.svelte';
	import { consistency, type RoundSummary, type ValueCount } from '$lib/domain/stats';
	import { knownScoreSet } from '$lib/domain/rounds/seed';

	/**
	 * One kind of round: what it was shot for, how it is going, and where its arrows land. Grouped by
	 * shape, so the same twelve ends at 70m are one card whether they were picked or built by hand.
	 */
	let {
		summary,
		arrows,
		favourite,
		open,
		ontoggleFavourite,
		ontoggleOpen
	}: {
		summary: RoundSummary;
		arrows: ValueCount[];
		favourite: boolean;
		open: boolean;
		ontoggleFavourite: () => void;
		ontoggleOpen: () => void;
	} = $props();

	const spread = $derived(consistency(summary.history));
	const scores = $derived(summary.history.map((a) => a.totalScore));
	const bestAt = $derived(summary.history.indexOf(summary.best));

	/** The zone's own regulated colour, read from the score set the round was shot on. */
	const zones = $derived(
		knownScoreSet(summary.best.round?.scoreSetId)?.zones ?? []
	);
</script>

<section class="rounded-xl border border-line bg-surface p-4">
	<div class="flex items-baseline justify-between gap-2">
		<h3 class="font-semibold">{summary.name}</h3>
		<span class="ml-auto text-xs text-muted">
			{$t('stats.rounds', { n: summary.history.length })}
		</span>
		<button
			class="-my-1 -mr-1 shrink-0 self-center p-1 transition-colors {favourite
				? 'text-brand-text'
				: 'text-muted'}"
			aria-pressed={favourite}
			aria-label={favourite ? $t('stats.unfavourite') : $t('stats.favourite')}
			onclick={ontoggleFavourite}
		>
			<Icon name="star" size={20} filled={favourite} />
		</button>
	</div>

	<div class="mt-3 flex items-end gap-6">
		<!-- The best opens the round that set it: a personal best is a day's shooting, and the figure
			is worth nothing next to the sheet it came off. -->
		<a href={withOrigin(`/activities/${summary.best.id}`, '/stats')} class="block">
			<p class="tabular text-3xl font-bold text-brand-text">{summary.best.totalScore}</p>
			<p class="flex items-center gap-1 text-xs text-muted">
				{$t('stats.personalBest')}
				<span class="rotate-180 text-brand-text"><Icon name="back" size={12} /></span>
			</p>
		</a>
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
		{#if spread !== null}
			<div>
				<!-- Lower is steadier, which is the opposite of every other figure on the card. -->
				<p class="tabular text-xl font-semibold">±{spread.toFixed(2)}</p>
				<p class="text-xs text-muted">{$t('stats.spread')}</p>
			</div>
		{/if}
	</div>

	{#if scores.length > 1}
		<ScoreScale {scores} {bestAt} />
	{/if}

	{#if open && arrows.length > 0}
		<h4 class="mt-4 text-xs font-semibold text-muted">{$t('stats.distribution')}</h4>
		<DistributionChart {arrows} {zones} />
	{/if}

	<div class="mt-2 flex items-end justify-between gap-3">
		<p class="text-xs text-muted">
			{$t('stats.bestOn', { date: $dateFormats.date(summary.best.startedAt) })}
			· {summary.best.count10s}
			{$t('score.tens')} · {summary.best.countX}
			{$t('score.xs')}
		</p>
		{#if arrows.length > 0}
			<button
				class="-mr-1 -mb-1 flex shrink-0 items-center gap-1 p-1 text-xs font-medium text-muted"
				aria-expanded={open}
				onclick={ontoggleOpen}
			>
				{open ? $t('stats.less') : $t('stats.more')}
				<span class="transition-transform {open ? '' : 'rotate-180'}">
					<Icon name="chevronUp" size={16} />
				</span>
			</button>
		{/if}
	</div>
</section>
