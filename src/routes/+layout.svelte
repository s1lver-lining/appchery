<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { initDb, dbInfo } from '$lib/db';
	import { t } from '$lib/i18n';
	import { theme } from '$lib/theme';
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';

	let { children } = $props();

	let ready = $state(false);
	let error = $state<string | null>(null);
	let volatileStorage = $state(false);

	$effect(() => {
		// Touch the store so the theme attribute is applied before the shell first paints.
		void $theme;
		initDb()
			.then(() => {
				volatileStorage = !dbInfo().persistent;
				ready = true;
			})
			.catch((e) => (error = e instanceof Error ? e.message : String(e)));
	});

	const tabs: { href: string; key: string; icon: IconName }[] = [
		{ href: '/', key: 'nav.stats', icon: 'chart' },
		{ href: '/sessions', key: 'nav.sessions', icon: 'target' },
		{ href: '/equipment', key: 'nav.equipment', icon: 'bow' },
		{ href: '/settings', key: 'nav.settings', icon: 'sliders' }
	];

	const isActive = (href: string) =>
		href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href);
</script>

<div class="flex h-full flex-col bg-bg text-ink">
	{#if error}
		<div class="m-4 rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">
			<p class="font-semibold">Database failed to open</p>
			<p class="mt-1 text-sm">{error}</p>
		</div>
	{:else if !ready}
		<div class="flex flex-1 items-center justify-center text-muted">{$t('common.loading')}</div>
	{:else}
		{#if volatileStorage}
			<p class="safe-top bg-accent/20 px-4 py-2 text-sm">{$t('storage.volatileWarning')}</p>
		{/if}

		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>

		<nav class="safe-bottom flex border-t border-line bg-surface">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class="flex flex-1 flex-col items-center gap-0.5 py-2
						{isActive(tab.href) ? 'text-brand-text' : 'text-muted'}"
					aria-current={isActive(tab.href) ? 'page' : undefined}
				>
					<Icon name={tab.icon} size={24} filled={isActive(tab.href)} />
					<span class="text-[11px] leading-none font-medium">{$t(tab.key)}</span>
				</a>
			{/each}
		</nav>
	{/if}
</div>
