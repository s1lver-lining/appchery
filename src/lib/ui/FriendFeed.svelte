<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { knownScoreSet } from '$lib/domain/rounds/seed';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import { GUIDE_STEPS } from '$lib/domain/tuning/guide';
	import { FREE_SCORE_KIND, parseFreeScore, freeScoreLabel } from '$lib/domain/freeScore';
	import { DRILL_KIND, drillFaceLabel, parseDrill, usesFace } from '$lib/domain/drills';
	import { STRENGTH_KIND, parseStrength, setsDone, setsPlanned } from '$lib/domain/strength';
	import { RUNNING_KIND, clock, parseRun } from '$lib/domain/running';
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
		if (kind === DRILL_KIND)
			return $t(`drill.game.${parseDrill(shared.activity.measurements as string | null).game}.name`);
		if (kind === STRENGTH_KIND) return $t('strength.title');
		if (kind === RUNNING_KIND) return $t('running.title');
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
		// Training shot nothing, so a count of arrows would be a nonsense rather than a small number.
		if (kind === STRENGTH_KIND) {
			const plan = parseStrength(shared.activity.measurements as string | null);
			return $t('strength.rowSummary', { done: setsDone(plan), total: setsPlanned(plan) });
		}
		if (kind === RUNNING_KIND) {
			const run = parseRun(shared.activity.measurements as string | null);
			return [
				run.distanceM === null
					? null
					: $t('running.kmValue', { km: Math.round(run.distanceM / 10) / 100 }),
				run.durationSeconds === null ? null : clock(run.durationSeconds)
			]
				.filter(Boolean)
				.join(' · ');
		}
		const shots = `${arrows} ${$t('score.arrow')}`;
		if (kind === DRILL_KIND) {
			const drill = parseDrill(shared.activity.measurements as string | null);
			return usesFace(drill) ? `${drillFaceLabel(drill.face)} · ${shots}` : shots;
		}
		if (kind === FREE_SCORE_KIND) {
			return `${freeScoreLabel(parseFreeScore(shared.activity.measurements as string | null))} · ${shots}`;
		}
		return shots;
	}

	/**
	 * A procedure has no total worth reading, and a free score's is not one that compares. Nor is a
	 * drill's: what it adds up to depends on the rule it was shot to and on how many arrows the
	 * archer chose, so putting it beside a round's score would invite a comparison that means nothing.
	 */
	const scoreOf = (shared: SharedActivity) =>
		kindOf(shared) === 'tuning' || kindOf(shared) === DRILL_KIND
			? null
			: Number(shared.activity.total_score ?? 0);

	/** One archer's rounds of one shape, which is the only grouping the shared rows can be compared in. */
	const shapeOf = (shared: SharedActivity) =>
		`${shared.ownerId}:${shared.activity.round_definition_id ?? roundOf(shared)?.name ?? ''}`;

	/**
	 * Their best on that round among what they shared, which is all this device can see: badges,
	 * records and the rest of the shooting stay on their phone, and a real personal best cannot be
	 * worked out from a feed. Only where they shared the same round more than once, because a lone
	 * round is trivially the best of itself and a marker that is always on says nothing.
	 */
	const bestShared = $derived.by(() => {
		const tally = new Map<string, { top: number; count: number }>();
		for (const shared of feed) {
			if (kindOf(shared) !== 'scoring') continue;
			const key = shapeOf(shared);
			const seen = tally.get(key) ?? { top: -Infinity, count: 0 };
			tally.set(key, { top: Math.max(seen.top, Number(shared.activity.total_score ?? 0)), count: seen.count + 1 });
		}
		return tally;
	});

	function isBest(shared: SharedActivity): boolean {
		if (kindOf(shared) !== 'scoring') return false;
		const group = bestShared.get(shapeOf(shared));
		return !!group && group.count > 1 && Number(shared.activity.total_score ?? 0) === group.top;
	}
</script>

{#if feed.length === 0}
	{#if empty}
		<EmptyState title={$t('friends.emptyFeedTitle')} body={$t('friends.emptyFeedBody')} />
	{/if}
{:else}
	{#each feed as shared (shared.id)}
		{@const sharer = known.get(shared.ownerId)}
		{@const kind = kindOf(shared)}
		{@const round = roundOf(shared)}
		{@const template = kind === 'tuning' ? templateOf(shared) : null}
		{@const score = scoreOf(shared)}
		{@const best = isBest(shared)}
		<!-- Each kind carries its own colour, so a procedure and a scored round are told apart before
			either is read. A round they beat their own shared best on takes the medal colour the rest of
			the app already spends on a record. -->
		<a
			class="press flex items-center gap-3 rounded-xl border p-3 {best
				? 'border-accent/60 bg-gradient-to-r from-accent/10 to-surface'
				: kind === 'scoring'
					? 'border-line bg-gradient-to-r from-brand/6 to-surface'
					: kind === 'tuning'
						? 'border-line bg-sunk/40'
						: 'border-line bg-surface'}"
			href={sharer ? `/friends/${sharer.handle}` : '/friends'}
		>
			<!-- Dropped where the screen cannot spare the width, as in the session's own list. -->
			<span class="hidden shrink-0 min-[301px]:flex">
				{#if round && knownScoreSet(round.scoreSetId)}
					<span class="h-9 w-9">
						<TargetFace scoreSet={knownScoreSet(round.scoreSetId)!} />
					</span>
				{:else if kind === STRENGTH_KIND || kind === RUNNING_KIND}
					<span
						class="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-sunk text-muted"
					>
						<Icon name={kind === STRENGTH_KIND ? 'exercise' : 'run'} size={18} />
					</span>
				{:else if kind === 'tuning'}
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
				<p class="flex items-center gap-1.5">
					<span class="truncate text-sm font-medium">{title(shared)}</span>
					{#if best}
						<span
							class="flex shrink-0 items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
						>
							<Icon name="medal" size={10} filled />
							{$t('feed.bestShared')}
						</span>
					{/if}
				</p>
				<p class="tabular mt-0.5 truncate text-xs text-muted">
					{sharer ? `${shownName(sharer)} · ` : ''}{shownDate(
						Number(shared.activity.started_at ?? shared.sharedAt)
					)} · {detail(shared)}
				</p>
			</div>

			{#if score !== null}
				<span
					class="tabular shrink-0 text-xl {kind === FREE_SCORE_KIND
						? 'font-semibold text-muted'
						: best
							? 'font-bold text-accent'
							: 'font-bold'}">{score}</span
				>
			{/if}
		</a>
	{/each}
{/if}
