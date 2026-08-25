<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import type { BracketDocument, BracketMatch } from '$lib/ianseo/types';

	/**
	 * An elimination bracket. Drawn as a round at a time rather than as the wall chart ianseo prints:
	 * a chart wide enough to hold thirty two archers is unreadable on a phone at any zoom, and what
	 * is actually wanted from it is who beat whom, which a round of cards says at a glance.
	 */
	let {
		document,
		followedLabels,
		onfollow
	}: {
		document: BracketDocument;
		followedLabels: Set<string>;
		onfollow: (kind: 'archer' | 'club', label: string) => void;
	} = $props();

	/** The higher score takes the match. A match nobody has shot has no winner, and says nothing. */
	function winner(match: BracketMatch): number | null {
		const scores = match.entries.map((entry) => Number(entry.score));
		if (scores.some((score) => !Number.isFinite(score))) return null;
		if (scores.length < 2 || scores[0] === scores[1]) return null;
		return scores[0] > scores[1] ? 0 : 1;
	}

	const shown = $derived(document.rounds.filter((round) => round.matches.length > 0));
	let round = $state(0);
	const current = $derived(shown[Math.min(round, shown.length - 1)]);
</script>

{#if shown.length === 0}
	<p class="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">
		{$t('ianseo.bracketEmpty')}
	</p>
{:else}
	<!-- The rounds as a strip of tabs: the final is the one worth landing on, so it sits at the end. -->
	<div class="-mx-4 mb-3 overflow-x-auto px-4">
		<div class="flex w-max gap-1.5">
			{#each shown as one, index (one.title + index)}
				<button
					class="rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap {index === round
						? 'border-brand/40 bg-brand/10 text-brand-text'
						: 'border-line text-muted'}"
					aria-pressed={index === round}
					onclick={() => (round = index)}
				>
					{one.title || `${index + 1}`}
					<span class="ml-1 font-normal opacity-70">{one.matches.length}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="space-y-2">
		{#each current.matches as match, index (index)}
			{@const won = winner(match)}
			<div class="overflow-hidden rounded-2xl border border-line bg-surface">
				{#each match.entries as entry, side (side)}
					{@const mine = followedLabels.has(entry.name.trim().toLowerCase())}
					<div
						class="flex items-center gap-2 px-3 py-2 {side === 1
							? 'border-t border-line'
							: ''} {mine ? 'bg-brand/10' : ''} {won === side ? 'font-semibold' : ''} {won !== null &&
						won !== side
							? 'text-muted'
							: ''}"
					>
						{#if entry.seed}
							<span class="tabular w-6 shrink-0 text-[11px] text-muted">{entry.seed}</span>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="flex items-center gap-1 break-words">
								{#if mine}
									<span class="shrink-0 text-brand-text"><Icon name="star" size={12} filled /></span>
								{/if}
								{entry.name || '—'}
							</p>
							{#if entry.club || entry.country}
								<p class="truncate text-xs text-muted">{entry.country?.name ?? entry.club}</p>
							{/if}
						</div>
						{#if match.sets[side]?.length}
							<!-- What each set was shot for, which is the whole story of a match won 6 to 4. -->
							<div class="hidden shrink-0 gap-1 min-[380px]:flex">
								{#each match.sets[side] as value, at (at)}
									<span class="tabular w-7 rounded bg-line/40 py-0.5 text-center text-[11px] text-muted">
										{value}
									</span>
								{/each}
							</div>
						{/if}
						<span
							class="tabular w-7 shrink-0 text-right text-lg leading-none {won === side
								? 'text-brand-text'
								: ''}"
						>
							{entry.score ?? ''}
						</span>
						{#if entry.name}
							<button
								class="shrink-0 rounded p-1 {mine ? 'text-brand-text' : 'text-muted/50'}"
								aria-pressed={mine}
								aria-label={mine
									? $t('ianseo.unfollowName', { name: entry.name })
									: $t('ianseo.followName', { name: entry.name })}
								onclick={() => onfollow('archer', entry.name)}
							>
								<Icon name="star" size={14} filled={mine} />
							</button>
						{/if}
					</div>
				{/each}

				{#if match.sets.length > 0}
					<!-- Under 380 pixels the set scores will not sit beside the names, so they take their own line. -->
					<div class="flex flex-col gap-0.5 border-t border-line bg-line/15 px-3 py-1.5 min-[380px]:hidden">
						{#each match.sets as line, side (side)}
							<div class="flex gap-1">
								{#each line as value, at (at)}
									<span class="tabular w-7 rounded bg-surface py-0.5 text-center text-[11px] text-muted">
										{value}
									</span>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
