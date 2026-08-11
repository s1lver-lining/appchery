<script lang="ts">
	import { t } from '$lib/i18n';
	import { dateFormats } from '$lib/prefs';
	import { PROGRESSION_ARROWS, type EarnedBadge } from '$lib/domain/badges';
	import Icon from './Icon.svelte';

	/**
	 * One badge, earned or not. A locked badge is shown in full rather than hidden: what the app
	 * rewards is worth knowing before it is won, and a bar that is nearly full is the point of it.
	 */
	let { badge }: { badge: EarnedBadge } = $props();

	const key = $derived(badge.definition.key);
	const arrow = $derived(PROGRESSION_ARROWS.find((a) => a.key === key));

	/** The progression arrows all read the same way, so their rule is written from the data. */
	const hint = $derived.by(() => {
		if (!arrow) return $t(`badges.list.${key}.hint`);
		const params = { metres: arrow.metres, face: arrow.faceSize, score: arrow.score };
		return arrow.bowType
			? $t('badges.arrowHintBow', { ...params, bow: $t(`bow.${arrow.bowType}`) })
			: $t('badges.arrowHint', params);
	});

	const filled = $derived(badge.earnedAt !== null);
	const share = $derived(
		badge.progress && badge.progress.target > 0
			? Math.min(1, badge.progress.current / badge.progress.target)
			: 0
	);
</script>

<div
	class="flex gap-3 rounded-xl border p-3 {filled
		? 'border-accent/40 bg-surface'
		: 'border-line bg-surface/60'}"
>
	<span class={filled ? 'text-accent' : 'text-muted/50'}>
		<Icon name={badge.definition.icon} size={28} {filled} />
	</span>
	<div class="min-w-0 flex-1">
		<p class="truncate font-semibold {filled ? '' : 'text-muted'}">
			{$t(`badges.list.${key}.name`)}
		</p>
		<p class="text-xs text-muted">{hint}</p>

		{#if badge.earnedAt !== null}
			<p class="mt-1 text-xs font-medium text-accent">
				{$t('badges.earnedOn', { date: $dateFormats.date(badge.earnedAt) })}
			</p>
		{:else if badge.progress}
			<div class="mt-2 flex items-center gap-2">
				<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
					<div class="h-full rounded-full bg-brand" style="width: {share * 100}%"></div>
				</div>
				<span class="tabular shrink-0 text-[11px] text-muted">
					{$t('badges.progress', {
						current: Math.round(badge.progress.current),
						target: badge.progress.target
					})}
				</span>
			</div>
		{:else}
			<p class="mt-1 text-xs text-muted/70">{$t('badges.locked')}</p>
		{/if}
	</div>
</div>
