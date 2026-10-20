<script lang="ts">
	import SettingsPage from '$lib/pages/SettingsPage.svelte';

	let { data } = $props();
</script>

<!-- Keyed so moving between two pages starts the second afresh rather than carrying notices over. -->
{#key data.section}
	<SettingsPage section={data.section} />
{/key}
