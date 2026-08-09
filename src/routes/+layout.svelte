<script lang="ts">
	import '../app.css';
	import { App } from '@capacitor/app';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { initDb, dbInfo } from '$lib/db';
	import { neighbourPage, pageTabs, pageUp, parentPath } from '$lib/nav';
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
		{ href: '/', key: 'nav.home', icon: 'home' },
		{ href: '/sessions', key: 'nav.sessions', icon: 'target' },
		{ href: '/equipment', key: 'nav.equipment', icon: 'bow' },
		{ href: '/stats', key: 'nav.stats', icon: 'chart' },
		{ href: '/settings', key: 'nav.settings', icon: 'sliders' }
	];

	// The hardware key climbs the tree rather than unwinding history, so a long detour inside one
	// section still leaves the app in one press from its root.
	$effect(() => {
		const listener = App.addListener('backButton', () => {
			const up = $pageUp ?? parentPath($page.url.pathname);
			if (up) goto(up);
			else App.exitApp();
		});
		return () => {
			listener.then((l) => l.remove());
		};
	});

	const SWIPE_MIN = 60;
	let touch: { x: number; y: number } | null = null;

	function swipe(direction: 1 | -1) {
		const tabs = $pageTabs;
		const next = tabs ? tabs.index + direction : -1;
		// Past the last tab the swipe carries on to the next page, so the gesture never dead ends.
		if (tabs && next >= 0 && next < tabs.count) {
			tabs.select(next);
			return;
		}
		const target = neighbourPage($page.url.pathname, direction);
		if (target) goto(target);
	}

	function onTouchEnd(event: TouchEvent) {
		const start = touch;
		touch = null;
		if (!start || event.changedTouches.length !== 1) return;
		const dx = event.changedTouches[0].clientX - start.x;
		const dy = event.changedTouches[0].clientY - start.y;
		// Twice as far across as down, otherwise a slanted scroll would count as a swipe.
		if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 2) return;
		swipe(dx < 0 ? 1 : -1);
	}

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

		<main
			class="flex-1 overflow-y-auto"
			ontouchstart={(e) => {
				// A page that drags, such as a target face, opts out so a shot is never read as a swipe.
				const inert = (e.target as Element | null)?.closest('[data-noswipe]');
				touch =
					!inert && e.touches.length === 1
						? { x: e.touches[0].clientX, y: e.touches[0].clientY }
						: null;
			}}
			ontouchend={onTouchEnd}
			ontouchcancel={() => (touch = null)}
		>
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
