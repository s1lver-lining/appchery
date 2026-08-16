<script lang="ts">
	import { t } from '$lib/i18n';
	import { dateFormats } from '$lib/prefs';
	import { PROGRESSION_ARROWS, type EarnedBadge } from '$lib/domain/badges';
	import BadgeGlyph from './BadgeGlyph.svelte';

	/**
	 * One badge, earned or not. A locked badge is shown in full rather than hidden: what the app
	 * rewards is worth knowing before it is won, and a bar that is nearly full is the point of it.
	 *
	 * `solid` is for the card standing on its own over a dimmed page, where a translucent surface
	 * would let the page show through it.
	 */
	let { badge, solid = false }: { badge: EarnedBadge; solid?: boolean } = $props();

	const key = $derived(badge.definition.key);
	const arrow = $derived(PROGRESSION_ARROWS.find((a) => a.key === key));

	/**
	 * The progression arrows all read the same way, so their rule is written from the data. The bow
	 * an arrow demands is in its name rather than here, where it would only be said twice.
	 */
	const hint = $derived(
		arrow
			? $t('badges.arrowHint', { metres: arrow.metres, face: arrow.faceSize, score: arrow.score })
			: $t(`badges.list.${key}.hint`, badge.definition.hintParams)
	);

	const filled = $derived(badge.earnedAt !== null);
	const share = $derived(
		badge.progress && badge.progress.target > 0
			? Math.min(1, badge.progress.current / badge.progress.target)
			: 0
	);
</script>

<div
	class="flex gap-3 rounded-xl border p-3 {filled ? 'border-accent/40' : 'border-line'} {solid ||
	filled
		? 'bg-surface'
		: 'bg-surface/60'}"
>
	<BadgeGlyph {badge} />
	<div class="min-w-0 flex-1">
		<p class="truncate font-semibold {filled ? '' : 'text-muted'}">
			{$t(`badges.list.${key}.name`)}
		</p>
		<!-- What it pays, on the end of the rule: it is part of what the badge is worth chasing. -->
		<p class="text-xs text-muted">
			{hint}
			<span class="whitespace-nowrap">{$t('badges.xpWorth', { xp: badge.definition.xp })}</span>
		</p>

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
