<script lang="ts">
	import { t } from '$lib/i18n';
	import { scoreAt } from '$lib/domain/rounds/geometry';
	import type { Shot, Zone } from '$lib/domain/rounds/types';
	import ArrowPad from '$lib/ui/ArrowPad.svelte';
	import { SCORE_SET, SCORED_ENDS } from '../lib/sample';

	/**
	 * The scoring screen, working: the sheet above and the app's own pad below, keys or face, and an
	 * end that fills up and rules itself off at six the way a real one does.
	 *
	 * It is the app's `ArrowPad` rather than a drawing of it, so the keys are the zones of the score
	 * set and a tap on the face is scored by the same geometry that scores it in the app.
	 */
	const ARROWS_PER_END = 6;

	let ends = $state<Shot[][]>(SCORED_ENDS.map((end) => [...end]));
	let pending = $state<Shot[]>([]);
	let mode = $state<'number' | 'face'>('number');

	const runningTotals = $derived(
		ends.reduce<number[]>((totals, end) => {
			const before = totals[totals.length - 1] ?? 0;
			return [...totals, before + end.reduce((sum, shot) => sum + shot.value, 0)];
		}, [])
	);
	const total = $derived(runningTotals[runningTotals.length - 1] ?? 0);

	function add(zone: Zone, x: number | null = null, y: number | null = null) {
		const shot: Shot = {
			ordinal: pending.length + 1,
			value: zone.value,
			zoneLabel: zone.label,
			x,
			y,
			source: x === null ? 'manual' : 'plotted'
		};
		// Sorted as a card is written, highest first, so the row reads the way it would be called.
		const next = [...pending, shot].sort((a, b) => b.value - a.value);
		if (next.length < ARROWS_PER_END) {
			pending = next;
			return;
		}
		ends = [...ends, next.map((entry, i) => ({ ...entry, ordinal: i + 1 }))];
		pending = [];
	}

	const chip = (label: string) => {
		const zone = SCORE_SET.zones.find((entry) => entry.label === label);
		if (!zone?.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor};
			box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	};
</script>

<!-- The screen scrolls, because the face is a square and a phone is not: in plotting mode the pad
	is taller than the glass, exactly as it is on a real one. -->
<div class="h-full space-y-2 overflow-y-auto p-2">
	<section class="overflow-hidden rounded-xl border border-line bg-surface">
		<div
			class="flex items-center gap-1.5 border-b border-line bg-sunk px-2 py-1 text-[10px] font-semibold text-muted"
		>
			<span class="w-4 shrink-0">{$t('score.endColumn')}</span>
			<span class="flex-1">{$t('score.arrowsColumn')}</span>
			<span class="w-6 text-right">{$t('score.endTotalShort')}</span>
			<span class="w-7 text-right">{$t('score.total')}</span>
		</div>

		<!-- The ends already shot scroll; the one being shot does not. It is what the next key press
			lands in, so it stays under the eye however long the round gets. -->
		<div class="max-h-24 overflow-y-auto">
			{#each ends as end, i (i)}
				<div class="flex items-center gap-1 border-b border-line px-2 py-1">
					<span class="tabular w-4 shrink-0 text-[10px] font-medium text-brand-text">{i + 1}</span>
					<div class="flex flex-1 gap-0.5">
						{#each end as shot (shot.ordinal)}
							<span
								class="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold"
								style={chip(shot.zoneLabel)}
							>
								{shot.zoneLabel}
							</span>
						{/each}
					</div>
					<span class="tabular w-6 text-right text-xs font-semibold">
						{end.reduce((sum, shot) => sum + shot.value, 0)}
					</span>
					<span class="tabular w-7 text-right text-xs text-muted">{runningTotals[i]}</span>
				</div>
			{/each}
		</div>

		<!-- The end being shot, tinted, with a slot standing empty for every arrow still to come. -->
		<div class="flex items-center gap-1 border-t border-line bg-brand/5 px-2 py-1">
			<span class="tabular w-4 shrink-0 text-[10px] font-bold text-brand-text">{ends.length + 1}</span>
			<div class="flex flex-1 gap-0.5">
				{#each Array(ARROWS_PER_END) as _, i (i)}
					{#if pending[i]}
						<span
							class="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold"
							style={chip(pending[i].zoneLabel)}
						>
							{pending[i].zoneLabel}
						</span>
					{:else}
						<span class="h-6 w-6 shrink-0 rounded border border-dashed border-line"></span>
					{/if}
				{/each}
			</div>
			<span class="tabular w-6 text-right text-xs font-semibold">
				{pending.reduce((sum, shot) => sum + shot.value, 0)}
			</span>
			<span class="tabular w-7 text-right text-xs text-muted">{total}</span>
		</div>
	</section>

	<ArrowPad
		scoreSet={SCORE_SET}
		shots={pending}
		otherShots={ends.flat()}
		bind:mode
		onpick={(zone) => add(zone)}
		onplot={(x, y) => add(scoreAt(SCORE_SET, x, y), x, y)}
	>
		{#snippet title()}
			{$t('score.end', { n: ends.length + 1 })}
		{/snippet}
	</ArrowPad>
</div>
