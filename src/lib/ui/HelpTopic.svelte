<script lang="ts">
	import { t } from '$lib/i18n';
	import { setPageUp } from '$lib/nav';
	import Icon from './Icon.svelte';
	import PageHeader, { type HeaderMotif } from './PageHeader.svelte';

	/**
	 * One page explaining one part of the app, in the words the app itself uses. Each help page names
	 * the page it was opened from, which is where its back key belongs.
	 */
	let {
		motif,
		from,
		terms
	}: { motif: HeaderMotif; from: string; terms: { term: string; body: string }[] } = $props();

	$effect(() => setPageUp(from));

	/**
	 * The emphasis lives in the translation as `**this**`, so a translator keeps it where it belongs
	 * in their own sentence. Split rather than rendered as HTML: no dictionary becomes markup.
	 */
	const parts = (body: string) => body.split(/\*\*(.+?)\*\*/g);
</script>

<PageHeader {motif} title={$t('help.title')}>
	{#snippet lead()}
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-3 p-4">
	{#each terms as item (item.term)}
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
