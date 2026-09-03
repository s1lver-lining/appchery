<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { pull, PULL_EASE, PULL_READY, PULL_SNAP_MS } from '$lib/ui/pull';

	// Pull the page down and it reads itself again; a shortcut beside the header's own refresh button.
	let {
		onrefresh,
		children
	}: {
		/** Awaited, so the spinner turns for exactly as long as the reading takes. */
		onrefresh: () => void | Promise<void>;
		children: Snippet;
	} = $props();

	let distance = $state(0);
	let settling = $state(false);
	let reading = $state(false);

	/** Held at the mark while it reads, so the spinner has somewhere to be that is not moving. */
	const shown = $derived(reading ? PULL_READY : distance);
	const armed = $derived(distance >= PULL_READY);
	const ratio = $derived(Math.min(1, shown / PULL_READY));

	function moved(next: number) {
		if (reading) return;
		settling = false;
		distance = next;
	}

	async function released() {
		if (reading) return;
		settling = true;
		if (!armed) {
			distance = 0;
			return;
		}
		reading = true;
		distance = 0;
		try {
			await onrefresh();
		} finally {
			reading = false;
		}
	}
</script>

<!-- Grows into whatever the scroller has left, so a page inside can reach the foot of the screen. -->
<div
	class="relative flex flex-1 flex-col"
	use:pull={{ onMove: moved, onEnd: released, enabled: () => !reading }}
>
	<!--
		Drawn inside the band the page has been pulled off, rather than above it: what is above the top
		of a scrolling element is cut off, and a spinner nobody can see is no answer at all.
	-->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
		style="transform: translateY({Math.max(0, shown - 34)}px); opacity: {ratio};
			transition: {settling ? `transform ${PULL_SNAP_MS}ms ${PULL_EASE}, opacity ${PULL_SNAP_MS}ms` : 'none'}"
		aria-hidden={!reading}
	>
		<span
			class="rounded-full border border-line bg-surface p-1.5 text-muted shadow-sm {reading
				? 'animate-spin'
				: ''}"
			style={reading ? '' : `transform: rotate(${ratio * 180}deg)`}
		>
			<Icon name="refresh" size={18} />
		</span>
	</div>

	<div
		class="flex flex-1 flex-col"
		style="transform: translateY({shown}px);
			transition: {settling ? `transform ${PULL_SNAP_MS}ms ${PULL_EASE}` : 'none'}"
	>
		{@render children()}
	</div>
</div>
