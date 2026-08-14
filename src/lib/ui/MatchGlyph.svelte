<script lang="ts">
	import type { MatchFormat } from '$lib/domain/matches';

	/**
	 * What a match format looks like: arrows facing each other across a line, one row per archer a
	 * side. The count is the format, so an archer reads "three against three" off the picture rather
	 * than off the label, and the two sides wear gold and blue because that is what a face is.
	 */
	let { format, size = 30 }: { format: MatchFormat; size?: number } = $props();

	/** One tint per format, so four cards in a row are told apart before any of them is read. */
	const TINT: Record<MatchFormat, string> = {
		individual: 'var(--color-face-gold)',
		team: 'var(--color-face-red)',
		mixedTeam: 'var(--color-face-blue)',
		custom: 'var(--color-accent)'
	};

	const ROWS: Record<MatchFormat, number> = {
		individual: 1,
		team: 3,
		mixedTeam: 2,
		custom: 1
	};

	// Custom gives its lower third to the sliders, so its single row sits above the middle.
	const centre = $derived(format === 'custom' ? 10 : 12);
	const ys = $derived(
		Array.from({ length: ROWS[format] }, (_, i) => centre + (i - (ROWS[format] - 1) / 2) * 5.6)
	);
</script>

<span
	class="inline-flex items-center justify-center rounded-lg border"
	style="width: {size * 1.45}px; height: {size * 1.45}px;
		background: color-mix(in srgb, {TINT[format]} 18%, var(--color-surface));
		border-color: color-mix(in srgb, {TINT[format]} 45%, var(--color-line))"
>
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<!-- The shooting line between the two sides: what makes it a match rather than a round. -->
		<path
			d="M12 3.5V{format === 'custom' ? 16 : 20.5}"
			stroke-width="1.2"
			stroke-dasharray="2 2"
			style="stroke: color-mix(in srgb, var(--color-ink) 40%, transparent)"
		/>

		{#each ys as y (y)}
			<!-- Our side draws from the left, the opponent from the right, points meeting at the line. -->
			<path d="M3 {y}H8.4" stroke-width="1.8" style="stroke: var(--color-face-gold)" />
			<path d="M8.2 {y - 2.1} 10.9 {y} 8.2 {y + 2.1}z" style="fill: var(--color-face-gold)" />
			<path d="M21 {y}H15.6" stroke-width="1.8" style="stroke: var(--color-face-blue)" />
			<path d="M15.8 {y - 2.1} 13.1 {y} 15.8 {y + 2.1}z" style="fill: var(--color-face-blue)" />
		{/each}

		{#if format === 'custom'}
			<!-- The rules are yours to set, said with the same sliders the rest of the app sets things with. -->
			<g stroke-width="1.5" style="stroke: var(--color-accent)">
				<path d="M4 19.5h16" />
				<path d="M9 17.8v3.4" />
				<path d="M15.5 17.8v3.4" />
			</g>
		{/if}
	</svg>
</span>
