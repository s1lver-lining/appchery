<script lang="ts">
	import { page } from '$app/stores';
	import { t, tricks } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	/**
	 * Everything the app does that it never says out loud, grouped by where it is done. Read like
	 * the help pages: the move leads the paragraph, so the page can be scanned rather than read.
	 */
	const from = $derived(originOf($page.url, '/settings'));
	$effect(() => setPageUp(from));
</script>

<PageHeader motif="tricks" title={$tricks.title}>
	{#snippet lead()}
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-6 p-4">
	<p class="text-sm leading-relaxed text-muted">{$tricks.lead}</p>

	{#each $tricks.groups as group (group.key)}
		<section>
			<h2 class="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
				{group.title}
			</h2>
			<div class="space-y-2">
				{#each group.tricks as trick (trick.lead)}
					<article class="rounded-xl border border-line bg-surface p-4">
						<p class="text-[15px] leading-relaxed">
							<strong class="font-bold text-brand-text">{trick.lead}</strong>
							{trick.body}
						</p>
					</article>
				{/each}
			</div>
		</section>
	{/each}
</div>
