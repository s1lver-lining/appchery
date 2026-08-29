<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import TermsText from '$lib/ui/TermsText.svelte';
</script>

<svelte:head><title>{$t('terms.title')} · {$t('app.name')}</title></svelte:head>

<PageHeader motif="settings" title={$t('terms.title')}>
	{#snippet lead()}
		<a href="/settings" class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-3xl space-y-4 p-4">
	<TermsText />
</div>
