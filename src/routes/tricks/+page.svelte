<script lang="ts">
	import { page } from '$app/stores';
	import { t, tricks } from '$lib/i18n';
	import { matchesQuery } from '$lib/domain/search';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	/**
	 * Everything the app does that it never says out loud, grouped by where it is done. Read like
	 * the help pages: the move leads the paragraph, so the page can be scanned rather than read.
	 */
	const from = $derived(originOf($page.url, '/settings'));
	$effect(() => setPageUp(from));

	/**
	 * Eighty odd tips over fifteen headings is a page to read once and a page to search after that:
	 * somebody who half remembers that the app does something needs the one paragraph, not the list.
	 */
	let query = $state('');

	const groups = $derived(
		$tricks.groups
			.map((group) => ({
				...group,
				// The heading counts as part of every tip under it, so "match" finds the whole section.
				tricks: group.tricks.filter((trick) =>
					matchesQuery(query, [trick.lead, trick.body, group.title])
				)
			}))
			.filter((group) => group.tricks.length > 0)
	);
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

	<div
		class="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm
			focus-within:border-brand"
	>
		<span class="shrink-0 text-muted"><Icon name="search" size={18} /></span>
		<input
			bind:value={query}
			type="search"
			autocomplete="off"
			autocapitalize="none"
			spellcheck="false"
			class="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
			placeholder={$tricks.search}
			aria-label={$tricks.search}
		/>
		{#if query}
			<button
				class="shrink-0 text-muted"
				aria-label={$t('common.close')}
				onclick={() => (query = '')}
			>
				<Icon name="close" size={18} />
			</button>
		{/if}
	</div>

	{#if groups.length === 0}
		<p class="px-1 py-8 text-center text-sm text-muted">
			{$tricks.searchEmpty.replace('{q}', query.trim())}
		</p>
	{/if}

	{#each groups as group (group.key)}
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
