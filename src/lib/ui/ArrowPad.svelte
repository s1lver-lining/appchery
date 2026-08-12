<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import { scorableZones, missZone } from '$lib/domain/rounds/geometry';
	import type { ScoreSet, Shot, Zone } from '$lib/domain/rounds/types';
	import Icon from './Icon.svelte';
	import TargetFace from './TargetFace.svelte';

	/**
	 * The two ways of entering an arrow, as one panel: the keypad of zones, or the face itself. They
	 * are the same input, so they share a switch rather than living in two places, and whichever was
	 * used last stays chosen while the archer keeps entering arrows.
	 */
	let {
		scoreSet,
		shots = [],
		otherShots = [],
		highlight = null,
		mode = $bindable('number'),
		flush = false,
		title,
		onpick,
		onplot,
		onclose
	}: {
		scoreSet: ScoreSet;
		/** Arrows already entered for what is being filled, drawn on the face. */
		shots?: Shot[];
		/** Arrows from the other ends, drawn faded so the ones being entered stay readable. */
		otherShots?: Shot[];
		/** The arrow being replaced, ringed so it is clear which one the next touch moves. */
		highlight?: { x: number; y: number } | null;
		mode?: 'number' | 'face';
		/** Sat against the edges of the screen, as a panel that rose from the bottom of it. */
		flush?: boolean;
		/** What is being filled in, said in the panel's own strip. */
		title?: Snippet;
		onpick: (zone: Zone) => void;
		onplot: (x: number, y: number) => void;
		/** Puts the pad away. A panel that rises has to say how it goes back down. */
		onclose?: () => void;
	} = $props();

	const keypad = $derived(scorableZones(scoreSet));

	/**
	 * The bar looks like something to pull, so it is: a drag downwards puts the pad away. Handled
	 * here rather than through the page swipe, which reads sideways and would take the gesture.
	 */
	const PULL_AWAY = 36;
	let pulledFrom = $state<number | null>(null);
	let pulled = $state(0);

	function grab(event: PointerEvent) {
		if (!onclose) return;
		pulledFrom = event.clientY;
		pulled = 0;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function drag(event: PointerEvent) {
		if (pulledFrom === null) return;
		pulled = Math.max(0, event.clientY - pulledFrom);
	}

	function release() {
		if (pulledFrom === null) return;
		const far = pulled >= PULL_AWAY;
		pulledFrom = null;
		pulled = 0;
		if (far) onclose?.();
	}

	/** A miss has no fill of its own, so it borrows the surface instead of rendering invisible. */
	function chipStyle(zone: Zone): string {
		if (!zone.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor}; box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	}
</script>

<div
	class="overflow-hidden bg-surface {flush ? '' : 'rounded-2xl border border-line'}"
	style={pulled > 0 ? `transform: translateY(${Math.min(pulled, PULL_AWAY * 2)}px)` : ''}
>
	{#if flush}
		<!-- The bar every sheet on a phone wears, and it does what it looks like it does. -->
		<div
			class="flex touch-none justify-center pt-1.5 pb-1"
			role="presentation"
			data-noswipe
			onpointerdown={grab}
			onpointermove={drag}
			onpointerup={release}
			onpointercancel={release}
		>
			<span
				class="h-1 w-9 rounded-full transition-colors {pulledFrom !== null ? 'bg-muted' : 'bg-line'}"
			></span>
		</div>
	{/if}

	<header class="flex items-center gap-2 border-b border-line bg-sunk/60 px-2 py-1.5">
		<!-- The way back down, at the top left where a sheet's handle would be. -->
		{#if onclose}
			<button class="shrink-0 rotate-180 text-muted" aria-label={$t('common.close')} onclick={onclose}>
				<Icon name="chevronUp" size={18} />
			</button>
		{/if}

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
				<TargetFace
					{scoreSet}
					{shots}
					{otherShots}
					{highlight}
					interactive
					showOtherToggle
					showCentreToggle
					{onplot}
				/>
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
