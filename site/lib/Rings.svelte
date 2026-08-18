<script lang="ts">
	/**
	 * The app's own geometry, the concentric arcs the home header is struck with. Borrowed rather
	 * than redrawn so the page and the app open with the same shape, and used here instead of a mark:
	 * the rings say archery on their own, and a logo beside a wordmark only says it twice.
	 */
	let { class: className = '' }: { class?: string } = $props();
</script>

<svg class="pointer-events-none text-brand {className}" viewBox="0 0 100 100" fill="none" aria-hidden="true">
	{#each [46, 36, 26, 16] as r, i (r)}
		<circle cx="50" cy="50" {r} stroke="currentColor" stroke-width="6" opacity={0.08 + i * 0.05} />
	{/each}
	<circle cx="50" cy="50" r="7" fill="currentColor" opacity="0.35" />
</svg>
