<script lang="ts" generics="K extends string">
	import type { Snippet } from 'svelte';
	import { swipe, COMMIT_RATIO, SNAP_MS, SNAP_EASE } from './swipe';
	import { registerTabs } from '$lib/nav';
	import { isDesk } from './desk';

	/**
	 * The tabs inside a page, sliding the way the pages themselves do. Both panes stay mounted so a
	 * drag shows the one arriving, and the deck takes the height of whichever pane is on show.
	 */
	let {
		tabs,
		value = $bindable(),
		pane,
		paneClass = 'space-y-4',
		swipeable = true,
		expand = false
	}: {
		tabs: { key: K; label: string; alert?: boolean }[];
		value: K;
		pane: Snippet<[K]>;
		paneClass?: string;
		/**
		 * Whether the deck may stop being a deck when there is room for it. A tab exists because a
		 * phone can only show one pane at a time; give the page a window's width and the panes stand
		 * side by side, each under its own name, and the tabs are no longer a question anybody has to
		 * answer. Only for decks whose panes are separate things: a deck whose tabs are views of one
		 * thing still has to pick one.
		 *
		 * How they stand depends on what they are to each other. `primary` gives the first tab two
		 * thirds and stacks the rest down the side, which suits a page that is mostly one thing with
		 * context beside it. `even` gives every tab a column of its own, for tabs that are peers:
		 * stacking two long peers in a third of the width leaves one column running far past the
		 * other, which is worse than the tabs were.
		 */
		expand?: false | 'primary' | 'even';
		/**
		 * Off on a page that is itself swiped between: on the main pager a sideways drag belongs to
		 * the pages, and a deck that also answered it would leave the archer between two of each.
		 */
		swipeable?: boolean;
	} = $props();

	/** A gutter between panes, so the block edges of two tabs never touch mid swipe. */
	const GUTTER = 24;

	let width = $state(1);
	let offset = $state(0);
	let duration = $state(0);
	let heights = $state<number[]>([]);

	const index = $derived(Math.max(0, tabs.findIndex((item) => item.key === value)));
	const progress = $derived(Math.min(1, Math.abs(offset) / width));
	const towards = $derived(offset < 0 ? index + 1 : index - 1);

	/** The deck grows into the pane arriving rather than jumping to it once the swipe lands. */
	const height = $derived(
		(heights[index] ?? 0) +
			((heights[towards] ?? heights[index] ?? 0) - (heights[index] ?? 0)) * progress
	);

	// A swipe anywhere else on the page reaches the deck through here, since only the deck itself is
	// close enough to the finger to follow it.
	/** Laid out in columns rather than stacked, which is the whole of what expanding means. */
	const spread = $derived(expand && $isDesk ? expand : null);

	// The gesture belongs to the sliding deck: with every pane on show there is nothing to slide to.
	$effect(() =>
		swipeable && !spread ? registerTabs({ count: tabs.length, index, select }) : undefined
	);

	function select(target: number) {
		if (target === index) return;
		duration = SNAP_MS;
		offset = (index - target) * width;
		setTimeout(() => {
			duration = 0;
			offset = 0;
			value = tabs[target].key;
		}, SNAP_MS);
	}

	function release(dx: number, flicked: boolean) {
		const target = dx < 0 ? index + 1 : index - 1;
		duration = SNAP_MS;
		if (
			target < 0 ||
			target >= tabs.length ||
			!(Math.abs(offset) > width * COMMIT_RATIO || flicked)
		) {
			offset = 0;
			return;
		}
		// Already dragged into place: only the name of the pane on show is left to change.
		offset = 0;
		duration = 0;
		value = tabs[target].key;
	}

	/** Off the first or last tab the deck pulls against a rubber band instead of dead stopping. */
	function damp(dx: number) {
		const target = dx < 0 ? index + 1 : index - 1;
		return target < 0 || target >= tabs.length ? dx * 0.25 : dx;
	}
</script>

{#snippet heading(item: { label: string; alert?: boolean })}
	<h2
		class="mb-2.5 flex items-center gap-1.5 border-b border-line pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase"
	>
		{item.label}
		{#if item.alert}
			<span class="size-1.5 rounded-full bg-danger"></span>
		{/if}
	</h2>
{/snippet}

{#if spread}
	<!--
		Every pane at once, but not as equals. Tiling a phone layout across a window gives three narrow
		strips and no more room than before; a page has one thing it is mostly for and the rest is what
		you glance at while doing it. So the first tab takes two thirds and the others stack down the
		side, which is the shape a window actually wants.
	-->
	{#if spread === 'even'}
		<div
			class="grid items-start gap-5 {tabs.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}"
			data-noswipe="true"
		>
			{#each tabs as item (item.key)}
				<section class="min-w-0">
					{@render heading(item)}
					<div class={paneClass}>
						{@render pane(item.key)}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<div class="grid grid-cols-3 items-start gap-5" data-noswipe="true">
			<section class="col-span-2 min-w-0">
				{@render heading(tabs[0])}
				<div class={paneClass}>
					{@render pane(tabs[0].key)}
				</div>
			</section>

			<div class="min-w-0 space-y-6">
				{#each tabs.slice(1) as item (item.key)}
					<section class="min-w-0">
						{@render heading(item)}
						<div class={paneClass}>
							{@render pane(item.key)}
						</div>
					</section>
				{/each}
			</div>
		</div>
	{/if}
{:else}
<nav class="flex gap-1 rounded-lg bg-sunk p-1">
	{#each tabs as item, i (item.key)}
		<button
			class="press flex-1 rounded-md py-1.5 text-sm font-medium
				{value === item.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
			onclick={() => select(i)}
		>
			{item.label}
			<!-- A dot rather than a count: the tab says there is something to read, the screen says what. -->
			{#if item.alert}
				<span class="ml-1 inline-block size-1.5 rounded-full bg-danger align-middle"></span>
			{/if}
		</button>
	{/each}
</nav>

<!-- Opted out of the page level swipe when it follows the finger itself, and only then. -->
<div
	data-noswipe={swipeable ? true : undefined}
	class="relative overflow-hidden"
	style="height: {height}px; transition: height {duration}ms {SNAP_EASE}"
	bind:clientWidth={width}
	use:swipe={{
		enabled: () => swipeable,
		onMove: (dx) => {
			duration = 0;
			offset = damp(dx);
		},
		onEnd: release
	}}
>
	{#each tabs as item, i (item.key)}
		<div
			class="absolute inset-x-0 top-0"
			style="transform: translate3d({(i - index) * (width + GUTTER) +
				offset}px, 0, 0); transition: transform {duration}ms {SNAP_EASE}"
			inert={i !== index || undefined}
		>
			<!-- Measured rather than laid out, because the deck is only as tall as the pane on show. -->
			<div class={paneClass} bind:clientHeight={heights[i]}>
				{@render pane(item.key)}
			</div>
		</div>
	{/each}
</div>
{/if}
