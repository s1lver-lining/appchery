<script lang="ts">
	import { t } from '$lib/i18n';
	import { withOrigin } from '$lib/nav';
	import Icon, { type IconName } from './Icon.svelte';
	import { favourites, isNew } from '$lib/ianseo/store';

	/** Pages that live nowhere else in the tab bar, gathered in the one place they are all reachable. */
	let { from }: { from: string } = $props();

	/**
	 * A competition being followed has published something since it was last opened. Read here rather
	 * than announced by the ianseo page, because this grid is the only place that page is offered
	 * from, and a result nobody is told about is a result nobody reads.
	 */
	let freshResults = $state(0);
	$effect(() => {
		void (async () => {
			try {
				freshResults = (await favourites()).filter(isNew).length;
			} catch {
				// The database is not open yet, which on this page it very shortly will be.
			}
		})();
	});

	const SHORTCUTS = $derived<{ href: string; icon: IconName; label: string; alert?: number }[]>([
		{ href: '/badges', icon: 'medal', label: $t('settings.linkBadges') },
		{ href: '/experience', icon: 'level', label: $t('experience.title') },
		{ href: '/timer', icon: 'clock', label: $t('timer.title') },
		{ href: '/share', icon: 'qr', label: $t('settings.linkShare') },
		{ href: '/tuning', icon: 'wrench', label: $t('tuning.guideTitle') },
		{ href: '/exercises', icon: 'exercise', label: $t('exercises.title') },
		{ href: '/muscles', icon: 'muscle', label: $t('settings.linkMuscles') },
		{ href: '/tricks', icon: 'bulb', label: $t('settings.linkTricks') },
		{ href: '/friends', icon: 'friends', label: $t('friends.title') },
		{ href: '/ianseo', icon: 'podium', label: $t('ianseo.title'), alert: freshResults },
		{ href: '/equipment?list=1', icon: 'bow', label: $t('settings.linkEquipment') },
		{ href: '/plans', icon: 'chart', label: $t('plans.title') }
	]);
</script>

<!-- Four across, icon over word, and the icon takes whatever room the word does not. -->
<nav class="grid grid-cols-4 gap-2">
	{#each SHORTCUTS as item (item.href)}
		<a
			href={withOrigin(item.href, from)}
			class="press relative flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-1 text-center"
		>
			<span class="text-brand-text"><Icon name={item.icon} size={32} /></span>
			{#if item.alert}
				<!--
					How many, not just that there are some: an archer following one competition and an
					archer following six are being told different things, and the tile has room to say so.
				-->
				<span
					class="tabular absolute top-1 right-1 min-w-4 rounded-full bg-brand px-1 text-[10px] leading-4 font-bold text-brand-ink"
				>
					{item.alert}
				</span>
			{/if}
			<span class="text-[11px] leading-tight text-muted">{item.label}</span>
		</a>
	{/each}
</nav>
