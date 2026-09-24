<script lang="ts">
	import type { MatchFormat } from '$lib/domain/matches';

	/**
	 * What a match format looks like: two sides facing each other across the shooting line, one row
	 * an archer a side. The count is the format, so "three against three" is read off the picture
	 * rather than off the label, and the sides wear gold and blue because that is what a face is.
	 */
	let { format, size = 30 }: { format: MatchFormat; size?: number } = $props();

	const ROWS: Record<MatchFormat, number> = {
		individual: 1,
		team: 3,
		mixedTeam: 2,
		custom: 1
	};

	// Custom gives its lower quarter to the sliders, so its single row sits above the middle.
	const centre = $derived(format === 'custom' ? 10.5 : 12);
	const gap = 6.6;
	const ys = $derived(
		Array.from({ length: ROWS[format] }, (_, i) => centre + (i - (ROWS[format] - 1) / 2) * gap)
	);
	// Shorter the more of them there are, so three rows read as three archers and not as one zigzag.
	const tall = $derived([0, 3.3, 2.7, 2.2][ROWS[format]]);
	const deep = $derived([0, 3.5, 3.1, 2.8][ROWS[format]]);
</script>

<span
	class="inline-flex items-center justify-center rounded-lg border border-line bg-sunk"
	style="width: {size * 1.45}px; height: {size * 1.45}px"
>
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke-width="2.1"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<!-- The shooting line between the two sides: what makes it a match rather than a round. -->
		<path
			d="M12 {format === 'custom' ? 2.8 : 3.4}V{format === 'custom' ? 15.5 : 20.6}"
			stroke-width="1.3"
			stroke-dasharray="2 2.2"
			style="stroke: color-mix(in srgb, var(--color-ink) 38%, transparent)"
		/>

		{#each ys as y (y)}
			<!-- Chevrons rather than arrows: at this size a head with a tail is a smudge, a corner is not. -->
			<path
				d="M{8.9 - deep} {y - tall} 8.9 {y} {8.9 - deep} {y + tall}"
				style="stroke: var(--color-face-gold)"
			/>
			<path
				d="M{15.1 + deep} {y - tall} 15.1 {y} {15.1 + deep} {y + tall}"
				style="stroke: var(--color-face-blue)"
			/>
		{/each}

		{#if format === 'custom'}
			<!-- The rules are yours to set, said with the same sliders the rest of the app sets things with. -->
			<g stroke-width="1.8" style="stroke: var(--color-accent)">
				<path d="M4.4 19.4h15.2" />
				<path d="M9.2 17.6v3.6" />
				<path d="M15.4 17.6v3.6" />
			</g>
		{/if}
	</svg>
</span>
