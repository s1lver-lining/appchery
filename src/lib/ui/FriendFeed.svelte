<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import { GUIDE_STEPS } from '$lib/domain/tuning/guide';
	import { FREE_SCORE_KIND, parseFreeScore, freeScoreLabel } from '$lib/domain/freeScore';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import EmptyState from './EmptyState.svelte';
	import Icon from './Icon.svelte';
	import TargetFace from './TargetFace.svelte';
	import TuningDiagram from './TuningDiagram.svelte';
	import type { Profile, SharedActivity } from '$lib/sync/social';

	/**
	 * The shared activities, drawn the same way on the home page and on the friends page: two places
	 * read the same feed, and a card that changed shape between them would read as two features.
	 *
	 * Laid out like the activity list of a session, because it is the same thing seen from outside:
	 * the picture it was shot on, what it was, and the score off to the right. A match never reaches
	 * here, so there is no result to draw, but anything else an archer can share does.
	 */
	let {
		feed,
		known,
		empty = true
	}: { feed: SharedActivity[]; known: Map<string, Profile>; empty?: boolean } = $props();

	function shownName(profile: Profile) {
		return profile.displayName || `@${profile.handle}`;
	}

	function shownDate(at: number) {
		return new Date(at).toLocaleDateString($locale, { dateStyle: 'medium' });
	}

	/** The server row as it stands, which is snake_case: nothing between here and it renames anything. */
	const kindOf = (shared: SharedActivity) => String(shared.activity.kind ?? 'scoring');

	function roundOf(shared: SharedActivity): RoundDefinition | null {
		try {
			return JSON.parse(String(shared.activity.round_definition ?? 'null'));
		} catch {
			// A definition this build cannot read still leaves a row worth showing, minus its face.
			return null;
		}
	}

	const templateOf = (shared: SharedActivity) => {
		const key = shared.activity.template_key ? String(shared.activity.template_key) : null;
		return key && getTemplate(key) ? key : null;
	};

	const diagramOf = (templateKey: string) =>
		GUIDE_STEPS.find((step) => step.templateKey === templateKey)?.diagram ?? null;

	function title(shared: SharedActivity) {
		const kind = kindOf(shared);
		if (kind === FREE_SCORE_KIND) return $t('freeScore.title');
		if (kind === 'tuning') {
			const key = templateOf(shared);
			return key ? $t(`tuning.template.${key}`) : $t('tuning.title');
		}
		return roundOf(shared)?.name ?? $t('friends.anActivity');
	}

	function detail(shared: SharedActivity) {
		const kind = kindOf(shared);
		const arrows = Number(shared.activity.arrows_shot ?? 0);
		if (kind === 'tuning') return $t('tuning.title');
		const shots = `${arrows} ${$t('score.arrow')}`;
		if (kind === FREE_SCORE_KIND) {
			return `${freeScoreLabel(parseFreeScore(shared.activity.measurements as string | null))} · ${shots}`;
		}
		return shots;
	}

	/** A procedure has no total worth reading, and a free score's is not one that compares. */
	const scoreOf = (shared: SharedActivity) =>
		kindOf(shared) === 'tuning' ? null : Number(shared.activity.total_score ?? 0);
</script>

{#if feed.length === 0}
	{#if empty}
		<EmptyState title={$t('friends.emptyFeedTitle')} body={$t('friends.emptyFeedBody')} />
	{/if}
{:else}
	{#each feed as shared (shared.id)}
		{@const sharer = known.get(shared.ownerId)}
		{@const round = roundOf(shared)}
		{@const template = kindOf(shared) === 'tuning' ? templateOf(shared) : null}
		{@const score = scoreOf(shared)}
		<a
			class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
			href={sharer ? `/friends/${sharer.handle}` : '/friends'}
		>
			<!-- Dropped where the screen cannot spare the width, as in the session's own list. -->
			<span class="hidden shrink-0 min-[301px]:flex">
				{#if round}
					<span class="h-9 w-9">
						<TargetFace scoreSet={getScoreSet(round.scoreSetId)} />
					</span>
				{:else if kindOf(shared) === 'tuning'}
					<span
						class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border"
						style="background: color-mix(in srgb, var(--color-ink) 82%, var(--color-brand));
							border-color: color-mix(in srgb, var(--color-ink) 45%, var(--color-line))"
					>
						{#if template && diagramOf(template)}
							<TuningDiagram name={diagramOf(template)!} tone="inverted" />
						{:else}
							<span class="text-bg"><Icon name="wrench" size={18} /></span>
						{/if}
					</span>
				{:else}
					<!-- The face it was shot on, with no rings drawn: there are no arrows to place. -->
					<span
						class="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-sunk text-muted"
					>
						<Icon name="target" size={18} />
					</span>
				{/if}
			</span>

			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium">{title(shared)}</p>
				<p class="tabular mt-0.5 truncate text-xs text-muted">
					{sharer ? `${shownName(sharer)} · ` : ''}{shownDate(
						Number(shared.activity.started_at ?? shared.sharedAt)
					)} · {detail(shared)}
				</p>
			</div>

			{#if score !== null}
				<span
					class="tabular text-xl font-bold {kindOf(shared) === FREE_SCORE_KIND
						? 'font-semibold text-muted'
						: ''}">{score}</span
				>
			{/if}
		</a>
	{/each}
{/if}
