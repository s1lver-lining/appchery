<script lang="ts" generics="K extends string">
	import type { Snippet } from 'svelte';
	import { swipe, COMMIT_RATIO, SNAP_MS, SNAP_EASE } from './swipe';
	import { registerTabs } from '$lib/nav';

	/**
	 * The tabs inside a page, sliding the way the pages themselves do. Both panes stay mounted so a
	 * drag shows the one arriving, and the deck takes the height of whichever pane is on show.
	 */
	let {
		tabs,
		value = $bindable(),
		pane,
		paneClass = 'space-y-4',
		swipeable = true
	}: {
		tabs: { key: K; label: string }[];
		value: K;
		pane: Snippet<[K]>;
		paneClass?: string;
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
	$effect(() => (swipeable ? registerTabs({ count: tabs.length, index, select }) : undefined));

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

<nav class="flex gap-1 rounded-lg bg-sunk p-1">
	{#each tabs as item, i (item.key)}
		<button
			class="flex-1 rounded-md py-1.5 text-sm font-medium
				{value === item.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
			onclick={() => select(i)}
		>
			{item.label}
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
