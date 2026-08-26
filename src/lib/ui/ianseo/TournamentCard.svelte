<script lang="ts">
	import { locale, t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import type { Tournament } from '$lib/ianseo/types';
	import type { When } from '$lib/ianseo/select';
	import { roundKm } from '$lib/competitions/distance';
	import { competitionDates } from '$lib/competitions/dates';

	/**
	 * One competition in a list. The dates lead rather than the name, because a list of competitions
	 * is read to find out what is on: the name only matters once the day has already caught the eye.
	 */
	let {
		tournament,
		when,
		href,
		following = false,
		fresh = false,
		km = null
	}: {
		tournament: Tournament;
		when: When;
		href: string;
		following?: boolean;
		/** Something has been published since the archer last opened it. */
		fresh?: boolean;
		/** How far away it is, where the town has been located. */
		km?: number | null;
	} = $props();

	/** ianseo writes `25-28 Aug` for a French competition as readily as for an English one. */
	const days = $derived(competitionDates($locale, tournament));
</script>

<a
	{href}
	class="relative flex items-start gap-3 rounded-2xl border bg-surface p-3 {when === 'running'
		? 'border-brand/40 bg-gradient-to-r from-brand/8 to-surface'
		: 'border-line'}"
>
	<!-- The date block is fixed width so a column of cards lines its names up down the page. -->
	<span
		class="flex w-14 shrink-0 flex-col items-center rounded-xl px-1 py-1.5 text-center {when ===
		'running'
			? 'bg-brand/15 text-brand-text'
			: 'bg-line/40 text-muted'}"
	>
		<span class="text-[11px] leading-tight font-semibold break-words">{days}</span>
	</span>

	<span class="min-w-0 flex-1">
		<span class="flex flex-wrap items-center gap-1.5">
			{#if tournament.country}
				<!-- The code, not the flag: ianseo draws flags as images, and a code is legible at any size. -->
				<span class="tabular rounded bg-line/50 px-1 text-[10px] font-bold text-muted">
					{tournament.country.code}
				</span>
			{/if}
			{#if tournament.major}
				<span class="rounded bg-brand/15 px-1 text-[10px] font-bold text-brand-text">
					<Icon name="podium" size={11} />
				</span>
			{/if}
			{#if following}
				<span class="text-brand-text"><Icon name="star" size={13} filled /></span>
			{/if}
			{#if fresh}
				<span class="rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-ink">
					{$t('ianseo.newResults')}
				</span>
			{/if}
		</span>
		<span class="mt-0.5 block font-semibold break-words">{tournament.name}</span>
		<span class="mt-0.5 block truncate text-xs text-muted">
			{#if km !== null}
				<!-- In front of the town, because it is the thing being asked about when it is on show. -->
				<span class="font-medium text-brand-text">{$t('ianseo.away', { km: roundKm(km) })}</span>
				·
			{/if}{[tournament.city, tournament.organiser].filter(Boolean).join(' · ')}
		</span>
	</span>
</a>
