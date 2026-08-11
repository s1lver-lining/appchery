<script lang="ts">
	import { t } from '$lib/i18n';
	import { setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	// Reached from the sessions list, which is where the back key belongs.
	$effect(() => setPageUp('/sessions'));

	/** The three words the whole app is built on, in the order they are met. */
	const TERMS = $derived([
		{ term: $t('help.sessionTerm'), body: $t('help.sessionBody') },
		{ term: $t('help.activityTerm'), body: $t('help.activityBody') },
		{ term: $t('help.planTerm'), body: $t('help.planBody') }
	]);

	/**
	 * The emphasis lives in the translation as `**this**`, so a translator keeps it where it belongs
	 * in their own sentence. Split rather than rendered as HTML: no dictionary becomes markup.
	 */
	const parts = (body: string) => body.split(/\*\*(.+?)\*\*/g);
</script>

<PageHeader motif="sessions" title={$t('help.title')}>
	{#snippet lead()}
		<a href="/sessions" class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-3 p-4">
	{#each TERMS as item (item.term)}
		<section class="rounded-xl border border-line bg-surface p-4">
			<p class="text-[15px] leading-relaxed">
				<!-- The word being defined leads the paragraph, so the page can be read by scanning. -->
				<strong class="font-bold text-brand-text">{item.term}</strong>
				{#each parts(item.body) as part, i (i)}{#if i % 2 === 1}<strong class="font-semibold"
							>{part}</strong
						>{:else}{part}{/if}{/each}
			</p>
		</section>
	{/each}
</div>
