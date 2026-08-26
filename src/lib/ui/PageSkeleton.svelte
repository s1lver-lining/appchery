<script lang="ts">
	import Skeleton from './Skeleton.svelte';

	/**
	 * A page in outline while it reads itself out of the database. Drawn with the real card chrome
	 * and only the words left grey, so the wait shows where the content will be rather than saying
	 * that there is a wait. The counts are rough on purpose: this is the shape of a page, not a
	 * promise about how many rows are coming.
	 */
	let {
		title = true,
		stats = false,
		cards = 3
	}: { title?: boolean; stats?: boolean; cards?: number } = $props();
</script>

<div class="mx-auto w-full max-w-2xl space-y-4 p-4" aria-busy="true">
	{#if title}
		<Skeleton class="h-6 w-2/5" />
	{/if}

	{#if stats}
		<div class="grid grid-cols-4 gap-2">
			{#each Array.from({ length: 4 }) as _, i (i)}
				<div class="space-y-2 rounded-xl border border-line bg-surface p-2.5">
					<Skeleton class="h-5 w-2/3" />
					<Skeleton class="h-2 w-full" />
				</div>
			{/each}
		</div>
	{/if}

	{#each Array.from({ length: cards }) as _, i (i)}
		<div class="space-y-2.5 rounded-xl border border-line bg-surface p-4">
			<Skeleton class="h-4 w-1/3" />
			<Skeleton class="h-3 w-full" />
			<Skeleton class="h-3 w-3/4" />
		</div>
	{/each}
</div>
