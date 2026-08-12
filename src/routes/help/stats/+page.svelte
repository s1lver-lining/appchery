<script lang="ts">
	import { t } from '$lib/i18n';
	import HelpTopic from '$lib/ui/HelpTopic.svelte';
	import { originOf } from '$lib/nav';
	import { page } from '$app/stores';

	/** What the figures on the stats page mean, and which of them are worth acting on. */
	const TERMS = $derived([
		{ term: $t('help.rangeTerm'), body: $t('help.rangeBody') },
		{ term: $t('help.chartTerm'), body: $t('help.chartBody') },
		{ term: $t('help.roundTerm'), body: $t('help.roundBody') },
		{ term: $t('help.bestTerm'), body: $t('help.bestBody') },
		{ term: $t('help.consistencyTerm'), body: $t('help.consistencyBody') }
	]);
</script>

<HelpTopic motif="stats" from={originOf($page.url, '/stats')} terms={TERMS} />
