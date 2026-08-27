<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { syncAlertUnread } from '$lib/sync/alert';
	import { favourites, isNew } from '$lib/ianseo/store';
	import Icon, { type IconName } from './Icon.svelte';

	/**
	 * What the bottom tab bar becomes once there is room down the side of the screen. Same
	 * destinations in the same order, so an archer who learned the app on a phone already knows
	 * where everything is: it is the shape that changes, not the map.
	 *
	 * It also carries the shortcuts the phone keeps on the home page, because a rail has room for
	 * them and hiding a dozen pages one tap deeper is a phone compromise, not a decision.
	 */
	let { tabs }: { tabs: { href: string; key: string; icon: IconName }[] } = $props();

	let freshResults = $state(false);
	$effect(() => {
		void (async () => {
			try {
				freshResults = (await favourites()).some(isNew);
			} catch {
				// The database is not open yet, which it very shortly will be.
			}
		})();
	});

	const SHORTCUTS = $derived<{ href: string; icon: IconName; label: string; alert?: boolean }[]>([
		{ href: '/badges', icon: 'medal', label: $t('settings.linkBadges') },
		{ href: '/experience', icon: 'level', label: $t('experience.title') },
		{ href: '/plans', icon: 'chart', label: $t('plans.title') },
		{ href: '/tuning', icon: 'wrench', label: $t('tuning.guideTitle') },
		{ href: '/exercises', icon: 'exercise', label: $t('exercises.title') },
		{ href: '/muscles', icon: 'muscle', label: $t('settings.linkMuscles') },
		{ href: '/friends', icon: 'friends', label: $t('friends.title') },
		{ href: '/ianseo', icon: 'podium', label: $t('ianseo.title'), alert: freshResults },
		{ href: '/timer', icon: 'clock', label: $t('timer.title') },
		{ href: '/share', icon: 'qr', label: $t('settings.linkShare') },
		{ href: '/tricks', icon: 'bulb', label: $t('settings.linkTricks') }
	]);

	const isActive = (href: string) =>
		href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href.split('?')[0]);
</script>

<nav
	class="safe-top safe-bottom hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex"
	aria-label={$t('app.name')}
>
	<!-- The name, once, where a window has a place for one and a phone never did. -->
	<p class="mb-3 px-3 pt-1 text-lg leading-tight font-bold tracking-tight">{$t('app.name')}</p>

	{#each tabs as tab (tab.href)}
		{@const active = isActive(tab.href)}
		<a
			href={tab.href}
			class="press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium
				{active ? 'bg-brand/12 text-brand-text' : 'text-muted'}"
			aria-current={active ? 'page' : undefined}
		>
			<span class="relative shrink-0">
				<Icon name={tab.icon} size={22} filled={active} />
				{#if tab.href === '/settings' && $syncAlertUnread}
					<span class="absolute -top-0.5 -right-1 size-2 rounded-full bg-danger"></span>
				{/if}
			</span>
			{$t(tab.key)}
		</a>
	{/each}

	<!-- Everywhere else, which on a phone lives behind the home page and here simply fits. -->
	<p class="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">
		{$t('home.elsewhere')}
	</p>

	{#each SHORTCUTS as item (item.href)}
		{@const active = isActive(item.href)}
		<a
			href={item.href}
			class="press flex items-center gap-3 rounded-lg px-3 py-2 text-sm
				{active ? 'bg-brand/12 font-medium text-brand-text' : 'text-muted'}"
			aria-current={active ? 'page' : undefined}
		>
			<span class="relative shrink-0">
				<Icon name={item.icon} size={18} />
				{#if item.alert}
					<span class="absolute -top-0.5 -right-1 size-2 rounded-full bg-brand"></span>
				{/if}
			</span>
			<span class="truncate">{item.label}</span>
		</a>
	{/each}
</nav>
