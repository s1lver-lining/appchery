<script lang="ts">
	import { t } from '$lib/i18n';

	/**
	 * Every round of one kind as a dot on a worst to best scale, newest darkest. A line over time
	 * pretends the scores are continuous when they are a handful of outings months apart: what an
	 * archer actually reads here is the spread, and whether the recent dots sit to the right.
	 */
	let {
		scores,
		bestAt
	}: {
		/** Chronological, oldest first. */
		scores: number[];
		/** Index of the personal best, marked apart because it is the one that is not like the others. */
		bestAt: number;
	} = $props();

	const low = $derived(Math.min(...scores));
	const high = $derived(Math.max(...scores));
	/** Kept off the ends so a dot is never clipped by the edge of the track. */
	const at = (score: number) => (high === low ? 50 : 4 + ((score - low) / (high - low)) * 92);
	const weight = (index: number) =>
		scores.length < 2 ? 1 : 0.35 + (index / (scores.length - 1)) * 0.65;
</script>

<div class="mt-3">
	<div class="relative h-6">
		<span class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-sunk"></span>
		{#each scores as score, index (index)}
			<!-- Ringed in the card's own colour so two rounds shot the same score stay countable. -->
			<span
				class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
				class:ring-2={index === bestAt}
				style="left: {at(score)}%;
					width: {index === bestAt ? 12 : 9}px; height: {index === bestAt ? 12 : 9}px;
					background: {index === bestAt ? 'var(--c-medal-gold)' : 'var(--color-brand-text)'};
					opacity: {index === bestAt ? 1 : weight(index)};
					box-shadow: 0 0 0 2px var(--color-surface)"
				title={String(score)}
			></span>
		{/each}
	</div>
	<div class="tabular flex justify-between text-[10px] text-muted">
		<span>{low}</span>
		<span>{$t('stats.scaleHint')}</span>
		<span>{high}</span>
	</div>
</div>
