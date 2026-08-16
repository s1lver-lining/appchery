<script lang="ts">
	/**
	 * How a whole splits, drawn as one ring. A ring rather than a bar because the question is what
	 * share each part holds of the total, and a ring has a total for a shape.
	 */
	let {
		slices,
		size = 168,
		thickness = 22,
		centre
	}: {
		slices: { key: string; label: string; value: number; colour: string }[];
		size?: number;
		thickness?: number;
		/** What the hole is for: the figure the ring is a breakdown of. */
		centre?: import('svelte').Snippet;
	} = $props();

	const radius = $derived((size - thickness) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const total = $derived(slices.reduce((sum, slice) => sum + slice.value, 0));

	// Each arc starts where the ones before it ended, which is the whole of the layout.
	const arcs = $derived(
		slices
			.filter((slice) => slice.value > 0)
			.reduce<{ key: string; label: string; colour: string; length: number; offset: number }[]>(
				(drawn, slice) => {
					const before = drawn.reduce((sum, arc) => sum + arc.length, 0);
					return [
						...drawn,
						{
							key: slice.key,
							label: slice.label,
							colour: slice.colour,
							length: (slice.value / total) * circumference,
							offset: before
						}
					];
				},
				[]
			)
	);
</script>

<div class="relative shrink-0" style="width: {size}px; height: {size}px">
	<!-- Turned a quarter, so the first slice begins at the top rather than at three o'clock. -->
	<svg width={size} height={size} viewBox="0 0 {size} {size}" class="-rotate-90">
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="var(--color-sunk)"
			stroke-width={thickness}
		/>
		{#each arcs as arc (arc.key)}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={arc.colour}
				stroke-width={thickness}
				stroke-dasharray="{arc.length} {circumference - arc.length}"
				stroke-dashoffset={-arc.offset}
			>
				<title>{arc.label}</title>
			</circle>
		{/each}
	</svg>
	{#if centre}
		<div class="absolute inset-0 flex flex-col items-center justify-center text-center">
			{@render centre()}
		</div>
	{/if}
</div>
