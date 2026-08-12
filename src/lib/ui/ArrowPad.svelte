<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import { scorableZones, missZone } from '$lib/domain/rounds/geometry';
	import type { ScoreSet, Shot, Zone } from '$lib/domain/rounds/types';
	import TargetFace from './TargetFace.svelte';

	/**
	 * The two ways of entering an arrow, as one panel: the keypad of zones, or the face itself. They
	 * are the same input, so they share a switch rather than living in two places, and whichever was
	 * used last stays chosen while the archer keeps entering arrows.
	 */
	let {
		scoreSet,
		shots = [],
		mode = $bindable('number'),
		title,
		onpick,
		onplot
	}: {
		scoreSet: ScoreSet;
		/** Arrows already entered for what is being filled, drawn on the face. */
		shots?: Shot[];
		mode?: 'number' | 'face';
		/** What is being filled in, said in the panel's own strip. */
		title?: Snippet;
		onpick: (zone: Zone) => void;
		onplot: (x: number, y: number) => void;
	} = $props();

	const keypad = $derived(scorableZones(scoreSet));

	/** A miss has no fill of its own, so it borrows the surface instead of rendering invisible. */
	function chipStyle(zone: Zone): string {
		if (!zone.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor}; box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	}
</script>

<div class="overflow-hidden rounded-2xl border border-line bg-surface">
	<header class="flex items-center gap-2 border-b border-line bg-sunk/60 px-3 py-2">
		<span class="min-w-0 flex-1 truncate text-[11px] text-muted">
			{#if title}{@render title()}{/if}
		</span>

		<!-- The two ways of entering an arrow, as one switch rather than as a button that toggles. -->
		<div class="flex shrink-0 gap-0.5 rounded-lg bg-bg p-0.5">
			{#each [{ key: 'number' as const, label: $t('score.byNumber') }, { key: 'face' as const, label: $t('score.plotMode') }] as option (option.key)}
				<button
					class="rounded-md px-2 py-1 text-[11px] font-medium
						{mode === option.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
					onclick={() => (mode = option.key)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</header>

	<div class="p-3">
		{#if mode === 'face'}
			<div class="mx-auto aspect-square w-full max-w-72">
				<TargetFace {scoreSet} {shots} interactive {onplot} />
			</div>
		{:else}
			<div class="grid grid-cols-4 gap-1.5">
				{#each keypad as zone (zone.label)}
					<button
						class="tabular rounded-xl py-3 text-lg font-bold shadow-sm transition-transform active:scale-95"
						style={chipStyle(zone)}
						onclick={() => onpick(zone)}
					>
						{zone.label}
					</button>
				{/each}
				<button
					class="rounded-xl border border-line py-3 text-lg font-bold text-muted transition-transform active:scale-95"
					onclick={() => onpick(missZone(scoreSet))}
				>
					{$t('score.miss')}
				</button>
			</div>
		{/if}
	</div>
</div>
