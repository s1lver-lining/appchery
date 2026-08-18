<script lang="ts">
	/** One claim, its explanation, and the app making it. Alternating sides, so the eye is walked
		down the page rather than down one column of it. */
	let {
		title,
		body,
		note,
		flip = false,
		tone = 'bg',
		visual
	}: {
		title: string;
		body: string;
		note?: string;
		flip?: boolean;
		tone?: 'bg' | 'surface';
		visual: import('svelte').Snippet;
	} = $props();
</script>

<section class={tone === 'surface' ? 'border-y border-line bg-surface' : ''}>
	<div class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
		<div class={flip ? 'lg:order-2' : ''}>
			<h2 class="text-3xl font-black tracking-tight text-balance sm:text-4xl">{title}</h2>
			<p class="mt-4 max-w-xl text-lg text-muted">{body}</p>
			{#if note}
				<p class="mt-5 border-l-2 border-brand pl-4 text-sm font-medium">{note}</p>
			{/if}
		</div>
		<div class={flip ? 'lg:order-1' : ''}>{@render visual()}</div>
	</div>
</section>
