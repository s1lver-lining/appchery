<script lang="ts">
	import { t } from '$lib/i18n';
	import type { Band } from '$lib/domain/stats';

	/**
	 * A dot on a shared scale rather than a bar from zero: the differences between two conditions
	 * are tenths of a point, and a bar chart either flattens them or lies about how big they are.
	 */
	let {
		title,
		bands,
		labelOf,
		colourOf
	}: {
		title: string;
		bands: Band[];
		labelOf: (band: Band) => string;
		/** Where the band names a colour of its own, the wind bands and the kinds of outing. */
		colourOf?: (band: Band) => string;
	} = $props();

	const low = $derived(Math.min(...bands.map((b) => b.perArrow)));
	const high = $derived(Math.max(...bands.map((b) => b.perArrow)));
	const at = (band: Band) => (high === low ? 50 : ((band.perArrow - low) / (high - low)) * 92 + 4);
</script>

<section class="rounded-xl border border-line bg-surface p-4">
	<h2 class="text-sm font-semibold">{title}</h2>
	<p class="text-xs text-muted">{$t('stats.perArrowHint')}</p>

	<dl class="mt-3 space-y-2.5">
		{#each bands as band (band.key)}
			<div class="flex items-center gap-3">
				<dt class="w-24 shrink-0 truncate text-sm text-muted">{labelOf(band)}</dt>
				<span class="relative h-1.5 flex-1 rounded-full bg-sunk">
					<span
						class="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
						style="left: {at(band)}%;
							background: {colourOf ? colourOf(band) : 'var(--color-brand)'};
							box-shadow: 0 0 0 2px var(--color-surface)"
					></span>
				</span>
				<dd class="tabular w-20 shrink-0 text-right text-sm font-semibold">
					{band.perArrow.toFixed(2)}
					<span class="text-xs font-normal text-muted">· {band.arrows}</span>
				</dd>
			</div>
		{/each}
	</dl>
</section>
