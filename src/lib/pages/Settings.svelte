<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		SETTINGS_PAGES,
		pageSummary,
		pageTitle,
		searchSettings,
		settingHref,
		type SettingEntry
	} from '$lib/settings';
	import { appVersion, appBuild } from '$lib/build';
	import { syncAlertUnread } from '$lib/sync/alert';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	/** Named rather than read from package.json, which no bundle ships. */
	const LICENCE = 'AGPL-3.0-only';

	let query = $state('');
	const found = $derived(searchSettings(query, $t));

	function open(entry: SettingEntry) {
		const href = settingHref(entry.key);
		if (href) goto(href);
	}
</script>

<PageHeader motif="settings" title={$t('settings.title')} />

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<!-- What this build is, for a bug report: the release, the commit count behind it, and the
		licence the whole thing is under. -->
	<section class="rounded-xl border border-line bg-surface p-4 text-center">
		<p class="font-semibold">{$t('app.name')}</p>
		<p class="mt-0.5 text-xs text-muted">{$t('app.tagline')}</p>
		<p class="tabular mt-2 text-xs text-muted">
			{$t('settings.version', { version: appVersion })}
			{#if appBuild}· {$t('settings.build', { n: appBuild })}{/if}
		</p>
		<p class="mt-0.5 text-xs text-muted">{$t('settings.licence', { name: LICENCE })}</p>
		<a class="mt-2 inline-block text-xs font-semibold text-brand-text" href="/terms">
			{$t('terms.title')}
		</a>
	</section>

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
			class="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted"
			placeholder={$t('settings.searchPlaceholder')}
			aria-label={$t('settings.searchTitle')}
		/>
		{#if query}
			<button class="shrink-0 text-muted" aria-label={$t('common.close')} onclick={() => (query = '')}>
				<Icon name="close" size={18} />
			</button>
		{/if}
	</div>

	{#if query.trim()}
		{#if found.length === 0}
			<p class="px-1 py-8 text-center text-sm text-muted">
				{$t('settings.searchEmpty', { q: query.trim() })}
			</p>
		{:else}
			<div class="space-y-2">
				{#each found as entry (entry.key)}
					<button
						class="press flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3
							text-left"
						onclick={() => open(entry)}
					>
						<div class="min-w-0 flex-1">
							<p class="text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">
								{$t(pageTitle(entry.page))}
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
	{:else}
		<nav class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
			{#each SETTINGS_PAGES as entry (entry.key)}
				<a href="/settings/{entry.key}" class="press flex items-center gap-4 px-4 py-3.5">
					<span class="relative grid size-9 shrink-0 place-items-center rounded-full bg-sunk text-brand-text">
						<Icon name={entry.icon} size={20} />
						<!-- The sync warning is read on the data page, so the way there carries it. -->
						{#if entry.key === 'data' && $syncAlertUnread}
							<span class="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-danger"></span>
						{/if}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-medium">{$t(pageTitle(entry.key))}</span>
						<span class="block truncate text-sm text-muted">{$t(pageSummary(entry.key))}</span>
					</span>
					<span class="shrink-0 rotate-180 text-muted"><Icon name="back" size={18} /></span>
				</a>
			{/each}
		</nav>
	{/if}
</div>
