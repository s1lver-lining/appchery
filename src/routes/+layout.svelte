<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { initDb, dbInfo } from '$lib/db';
	import { t } from '$lib/i18n';

	let { children } = $props();

	let ready = $state(false);
	let error = $state<string | null>(null);
	let volatileStorage = $state(false);

	$effect(() => {
		initDb()
			.then(() => {
				volatileStorage = !dbInfo().persistent;
				ready = true;
			})
			.catch((e) => (error = e instanceof Error ? e.message : String(e)));
	});

	const tabs = [
		{ href: '/', key: 'nav.sessions', icon: '🎯' },
		{ href: '/equipment', key: 'nav.equipment', icon: '🏹' },
		{ href: '/tuning', key: 'nav.tuning', icon: '🔧' },
		{ href: '/settings', key: 'nav.settings', icon: '⚙️' }
	];

	const isActive = (href: string) =>
		href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href);
</script>

<div class="flex h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
	{#if error}
		<div class="m-4 rounded-lg bg-red-100 p-4 text-red-900 dark:bg-red-950 dark:text-red-200">
			<p class="font-semibold">Database failed to open</p>
			<p class="mt-1 text-sm">{error}</p>
		</div>
	{:else if !ready}
		<div class="flex flex-1 items-center justify-center text-slate-500">{$t('common.loading')}</div>
	{:else}
		{#if volatileStorage}
			<p
				class="safe-top bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
			>
				{$t('storage.volatileWarning')}
			</p>
		{/if}

		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>

		<nav
			class="safe-bottom flex border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
		>
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs
						{isActive(tab.href)
						? 'text-slate-900 dark:text-white'
						: 'text-slate-400 dark:text-slate-500'}"
				>
					<span class="text-lg" aria-hidden="true">{tab.icon}</span>
					{$t(tab.key)}
				</a>
			{/each}
		</nav>
	{/if}
</div>
