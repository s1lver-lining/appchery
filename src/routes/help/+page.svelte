<script lang="ts">
	import { t } from '$lib/i18n';
	import HelpTopic from '$lib/ui/HelpTopic.svelte';
	import { originOf } from '$lib/nav';
	import { page } from '$app/stores';

	/** The three words the whole app is built on, in the order they are met. */
	const TERMS = $derived([
		{ term: $t('help.sessionTerm'), body: $t('help.sessionBody') },
		{ term: $t('help.activityTerm'), body: $t('help.activityBody') },
		{ term: $t('help.planTerm'), body: $t('help.planBody') }
	]);
</script>

<HelpTopic motif="sessions" from={originOf($page.url, '/sessions')} terms={TERMS} />
