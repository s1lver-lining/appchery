<script lang="ts">
	import { t } from '$lib/i18n';
	import type { BracePoint } from '$lib/domain/tuning/brace';

	/**
	 * Group height and group size against brace height, on one pair of axes. They share the x axis
	 * because they are read together — a height that centres the group and opens it up is not the
	 * answer — and they keep their own y scales, because a group two centimetres high and a group
	 * eight centimetres wide are not comparable quantities.
	 */
	let { points, height = 180 }: { points: BracePoint[]; height?: number } = $props();

	const W = 320;
	const PAD = { left: 30, right: 30, top: 12, bottom: 24 };

	const xs = $derived(points.map((p) => p.braceCm));
	const xMin = $derived(Math.min(...xs));
	const xMax = $derived(Math.max(...xs));

	const centres = $derived(points.map((p) => p.centreCm));
	const spreads = $derived(points.map((p) => p.spreadCm));

	/** A flat series would divide by zero, so a single reading is drawn down the middle of its band. */
	function scale(values: number[], value: number, from: number, to: number) {
		const low = Math.min(...values);
		const high = Math.max(...values);
		if (high === low) return (from + to) / 2;
		return to + ((value - low) / (high - low)) * (from - to);
	}

	const x = $derived((cm: number) =>
		xMax === xMin
			? (PAD.left + (W - PAD.right)) / 2
			: PAD.left + ((cm - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right)
	);
	const yCentre = $derived((cm: number) => scale(centres, cm, PAD.top, height - PAD.bottom));
	const ySpread = $derived((cm: number) => scale(spreads, cm, PAD.top, height - PAD.bottom));

	const path = $derived((y: (cm: number) => number, pick: (p: BracePoint) => number) =>
		points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.braceCm)},${y(pick(p))}`).join(' ')
	);
</script>

<!-- One reading draws no curve: the whole point is what changes between two heights. -->
{#if points.length < 2}
	<p class="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
		{$t('brace.chartEmpty')}
	</p>
{:else}
	<div>
		<div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
			<span class="flex items-center gap-1.5">
				<span class="h-0.5 w-4 rounded bg-brand"></span>
				{$t('brace.centreSeries')}
			</span>
			<span class="flex items-center gap-1.5">
				<span class="h-0.5 w-4 rounded" style="background: var(--c-comp-blue)"></span>
				{$t('brace.spreadSeries')}
			</span>
		</div>

		<svg viewBox="0 0 {W} {height}" class="w-full" role="img" aria-label={$t('brace.chartLabel')}>
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={height - PAD.bottom}
				y2={height - PAD.bottom}
				class="stroke-line"
				stroke-width="1"
			/>

			<path d={path(ySpread, (p) => p.spreadCm)} fill="none" stroke="var(--c-comp-blue)" stroke-width="2" />
			<path d={path(yCentre, (p) => p.centreCm)} fill="none" class="stroke-brand" stroke-width="2" />

			{#each points as point (point.braceCm)}
				<circle cx={x(point.braceCm)} cy={ySpread(point.spreadCm)} r="3" fill="var(--c-comp-blue)" />
				<circle cx={x(point.braceCm)} cy={yCentre(point.centreCm)} r="3" class="fill-brand" />
				<text
					x={x(point.braceCm)}
					y={height - 8}
					text-anchor="middle"
					class="fill-current text-[9px] text-muted"
				>
					{point.braceCm.toFixed(1)}
				</text>
			{/each}
		</svg>
		<p class="text-center text-[11px] text-muted">{$t('brace.chartAxis')}</p>
	</div>
{/if}
