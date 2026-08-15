<script lang="ts">
	import { t } from '$lib/i18n';
	import type { EarnedBadge } from '$lib/domain/badges';
	import { closeOnBack } from './dismiss.svelte';
	import BadgeCard from './BadgeCard.svelte';
	import { scrim } from './statusBar';
	import { lockScroll } from './scrollLock';

	/** What a tile in the grid cannot say: the rule, and how far off it is. */
	let { badge, onclose }: { badge: EarnedBadge; onclose: () => void } = $props();

	closeOnBack(
		() => true,
		() => onclose()
	);
</script>

<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" use:lockScroll>
	<button class="absolute inset-0 bg-black/50" use:scrim={0.5} aria-label={$t('common.close')} onclick={onclose}
	></button>

	<div class="relative w-full max-w-xs" role="dialog" aria-label={$t(`badges.list.${badge.definition.key}.name`)}>
		<BadgeCard {badge} solid />
		<button
			class="mt-2 w-full rounded-lg border border-line bg-surface py-2 text-sm font-medium"
			onclick={onclose}
		>
			{$t('common.close')}
		</button>
	</div>
</div>
