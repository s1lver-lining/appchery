<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import { SETTINGS, searchSettings, type SettingEntry } from '$lib/settings';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	/**
	 * The settings by name rather than by tab. Three tabs of switches is a page you can read but not
	 * one you can look something up in, and being told to turn something on is no help if finding it
	 * is then the archer's problem.
	 */
	const from = $derived(originOf($page.url, '/settings'));
	$effect(() => setPageUp(from));

	let query = $state('');
	let field = $state<HTMLInputElement | null>(null);

	// Nobody opens a search page to look at it: the keyboard is up before the page has settled.
	$effect(() => {
		field?.focus();
	});

	const found = $derived(searchSettings(query, $t));
	/** Before a word is typed, the whole list: a page that opens empty says the search is broken. */
	const shown = $derived<SettingEntry[]>(query.trim() ? found : SETTINGS);

	function open(entry: SettingEntry) {
		goto(`/settings?setting=${entry.key}`);
	}
</script>

<PageHeader motif="settings" title={$t('settings.searchTitle')}>
	{#snippet lead()}
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<!-- The field is the page, so it wears the weight: everything under it is an answer to it. -->
	<div
		class="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm
			focus-within:border-brand"
	>
		<span class="shrink-0 text-muted"><Icon name="search" size={18} /></span>
		<input
			bind:this={field}
			bind:value={query}
			type="search"
			autocomplete="off"
			autocapitalize="none"
			spellcheck="false"
			class="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
			placeholder={$t('settings.searchPlaceholder')}
			aria-label={$t('settings.searchTitle')}
		/>
		{#if query}
			<button class="shrink-0 text-muted" aria-label={$t('common.close')} onclick={() => (query = '')}>
				<Icon name="close" size={18} />
			</button>
		{/if}
	</div>

	{#if !query.trim()}
		<p class="px-1 text-sm text-muted">{$t('settings.searchLead')}</p>
	{/if}

	{#if shown.length === 0}
		<p class="px-1 py-8 text-center text-sm text-muted">
			{$t('settings.searchEmpty', { q: query.trim() })}
		</p>
	{:else}
		<div class="space-y-2">
			{#each shown as entry (entry.key)}
				<button
					class="press flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3
						text-left"
					onclick={() => open(entry)}
				>
					<div class="min-w-0 flex-1">
						<p class="text-[11px] font-semibold tracking-wider text-muted uppercase">
							{$t(entry.section)}
						</p>
						<p class="mt-0.5 font-medium">{$t(entry.title)}</p>
						{#if entry.hint}
							<p class="mt-0.5 line-clamp-2 text-sm text-muted">{$t(entry.hint)}</p>
						{/if}
					</div>
					<span class="shrink-0 rotate-180 text-muted"><Icon name="back" size={18} /></span>
				</button>
			{/each}
		</div>
	{/if}
</div>
