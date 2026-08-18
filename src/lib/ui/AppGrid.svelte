<script lang="ts">
	import { t } from '$lib/i18n';
	import { withOrigin } from '$lib/nav';
	import Icon, { type IconName } from './Icon.svelte';

	/** Pages that live nowhere else in the tab bar, gathered in the one place they are all reachable. */
	let { from }: { from: string } = $props();

	const SHORTCUTS = $derived<{ href: string; icon: IconName; label: string }[]>([
		{ href: '/equipment?list=1', icon: 'bow', label: $t('settings.linkEquipment') },
		{ href: '/plans', icon: 'chart', label: $t('plans.title') },
		{ href: '/tuning', icon: 'wrench', label: $t('tuning.guideTitle') },
		{ href: '/badges', icon: 'medal', label: $t('settings.linkBadges') },
		{ href: '/experience', icon: 'level', label: $t('experience.title') },
		{ href: '/timer', icon: 'clock', label: $t('timer.title') },
		{ href: '/friends', icon: 'friends', label: $t('friends.title') },
		{ href: '/share', icon: 'qr', label: $t('settings.linkShare') },
		{ href: '/tricks', icon: 'bulb', label: $t('settings.linkTricks') },
		{ href: '/muscles', icon: 'muscle', label: $t('settings.linkMuscles') }
	]);
</script>

<!-- Four across, icon over word, and the icon takes whatever room the word does not. -->
<nav class="grid grid-cols-4 gap-2">
	{#each SHORTCUTS as item (item.href)}
		<a
			href={withOrigin(item.href, from)}
			class="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-1 text-center"
		>
			<span class="text-brand-text"><Icon name={item.icon} size={32} /></span>
			<span class="text-[11px] leading-tight text-muted">{item.label}</span>
		</a>
	{/each}
</nav>
