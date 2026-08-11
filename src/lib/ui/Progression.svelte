<script lang="ts">
	import type { ProgressionPoint } from '$lib/domain/stats';

	/**
	 * The history of one round: every score as a faint line, the rolling average as the line worth
	 * reading, and the personal bests marked. Scaled to the scores rather than to the round's
	 * maximum, because a plot from zero flattens every difference that matters.
	 */
	let {
		points,
		lowLabel,
		highLabel
	}: { points: ProgressionPoint[]; lowLabel: string; highLabel: string } = $props();

	const W = 100;
	const H = 32;

	const scores = $derived(points.map((p) => p.score));
	const low = $derived(Math.min(...scores, ...points.map((p) => p.rolling)));
	const high = $derived(Math.max(...scores, ...points.map((p) => p.rolling)));
	const span = $derived(high - low || 1);

	const x = (i: number) => (points.length < 2 ? W / 2 : (i / (points.length - 1)) * W);
	const y = (value: number) => H - ((value - low) / span) * (H - 4) - 2;

	const line = (values: number[]) =>
		values.map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
</script>

<div class="mt-3">
	<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-28 w-full overflow-visible">
		<path
			d={line(scores)}
			fill="none"
			stroke="currentColor"
			class="text-muted"
			stroke-width="1"
			stroke-opacity="0.35"
			vector-effect="non-scaling-stroke"
		/>
		<path
			d={line(points.map((p) => p.rolling))}
			fill="none"
			stroke="currentColor"
			class="text-brand-text"
			stroke-width="1.8"
			stroke-linejoin="round"
			vector-effect="non-scaling-stroke"
		/>
		{#each points as point, i (point.at)}
			{#if point.isBest}
				<!-- Every score that beat everything before it: the shape of the record over time. -->
				<circle
					cx={x(i)}
					cy={y(point.score)}
					r="2.4"
					fill="currentColor"
					class="text-brand"
					vector-effect="non-scaling-stroke"
				/>
			{/if}
		{/each}
	</svg>

	<div class="mt-1 flex justify-between text-[10px] text-muted">
		<span>{lowLabel}</span>
		<span class="tabular">{Math.round(low)} – {Math.round(high)}</span>
		<span>{highLabel}</span>
	</div>
</div>
