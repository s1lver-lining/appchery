<script lang="ts">
	import type { ValueCount } from '$lib/domain/stats';
	import type { Zone } from '$lib/domain/rounds/types';

	/**
	 * Where the arrows landed, by the zone they landed in. Drawn in the regulated colours of the face
	 * they landed on, because those colours are how an archer already reads a target.
	 */
	let {
		arrows,
		zones,
		height = 52
	}: {
		arrows: ValueCount[];
		/** The score set the arrows were shot on, for the colour of each zone. */
		zones: Zone[];
		height?: number;
	} = $props();

	const colourOf = (label: string) =>
		zones.find((zone) => zone.label === label)?.color ?? 'var(--color-brand)';

	const peak = $derived(Math.max(1, ...arrows.map((a) => a.count)));
	const total = $derived(arrows.reduce((sum, a) => sum + a.count, 0));
</script>

<div class="mt-2 flex items-end gap-1" style="height: {height + 28}px">
	{#each arrows as zone (zone.label)}
		<div
			class="flex flex-1 flex-col items-center gap-1"
			title="{zone.count} · {((zone.count / total) * 100).toFixed(0)}%"
		>
			<span class="tabular text-[10px] leading-none text-muted">{zone.count}</span>
			<!-- Outlined as well as filled, or the white ring disappears into a light theme. -->
			<div
				class="w-full rounded-t"
				style="height: {Math.max(2, (zone.count / peak) * height)}px;
					background: {colourOf(zone.label)};
					box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-ink) 30%, transparent)"
			></div>
			<span class="tabular text-[10px] leading-none font-medium">{zone.label}</span>
		</div>
	{/each}
</div>
