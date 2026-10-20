<script lang="ts">
	// Replaced at build time, so a build carries no trace of the tool: its corpus is served by `vite dev` alone.
	const tool = import.meta.env.DEV ? import('$lib/labelling/Labeller.svelte') : null;
</script>

{#if tool}
	{#await tool then module}
		<module.default />
	{/await}
{:else}
	<p class="p-6 text-muted">The labelling tool runs under <code>vite dev</code> only.</p>
{/if}
