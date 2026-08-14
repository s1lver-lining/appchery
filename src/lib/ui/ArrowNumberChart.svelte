<script lang="ts">
	import { t } from '$lib/i18n';
	import type { ArrowPosition } from '$lib/domain/stats';

	/**
	 * What each arrow of an end is worth on average. The arrow that drops is a hold that fades or a
	 * routine that hurries, and neither shows up in a total.
	 */
	let { positions, height = 64 }: { positions: ArrowPosition[]; height?: number } = $props();

	const low = $derived(Math.min(...positions.map((p) => p.mean)));
	const high = $derived(Math.max(...positions.map((p) => p.mean)));
	/**
	 * Drawn from a whole point below the weakest arrow rather than from zero. The differences being
	 * looked for are tenths of a point, and a bar starting at zero draws them all the same height.
	 */
	const floor = $derived(Math.max(0, Math.floor(low) - 1));
	const bar = (mean: number) =>
		high === floor ? height : ((mean - floor) / (high - floor)) * height;
</script>

<div class="flex items-end gap-2" style="height: {height + 28}px">
	{#each positions as position (position.ordinal)}
		<div
			class="flex flex-1 flex-col items-center gap-1"
			title={$t('score.arrowNumberOf', { n: position.ordinal, arrows: position.arrows })}
		>
			<span class="tabular text-[10px] leading-none text-muted">{position.mean.toFixed(1)}</span>
			<div
				class="w-full rounded-t bg-brand"
				style="height: {Math.max(2, bar(position.mean))}px"
			></div>
			<span class="tabular text-[10px] leading-none font-medium">{position.ordinal}</span>
		</div>
	{/each}
</div>
<p class="mt-1 text-[11px] text-muted">{$t('score.arrowNumberFloor', { n: floor })}</p>
