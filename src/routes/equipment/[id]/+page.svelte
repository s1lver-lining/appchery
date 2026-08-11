<script lang="ts">
	import { page } from '$app/stores';
	import { originOf } from '$lib/nav';
	import Bow from '$lib/pages/Bow.svelte';
</script>

<!-- The same page the equipment slot of the pager shows, with a way back to wherever it was opened from. -->
<Bow bowId={$page.params.id as string} backTo={originOf($page.url, '/equipment?list=1')} />
