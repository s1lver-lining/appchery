<script lang="ts">
	import { t } from '$lib/i18n';
	import HelpTopic from '$lib/ui/HelpTopic.svelte';
	import { originOf } from '$lib/nav';
	import { page } from '$app/stores';

	/** What the equipment page holds, from the bow down to the change that made a revision. */
	const TERMS = $derived([
		{ term: $t('help.bowTerm'), body: $t('help.bowBody') },
		{ term: $t('help.revisionTerm'), body: $t('help.revisionBody') },
		{ term: $t('help.defaultBowTerm'), body: $t('help.defaultBowBody') }
	]);
</script>

<HelpTopic motif="equipment" from={originOf($page.url, '/equipment')} terms={TERMS} />
