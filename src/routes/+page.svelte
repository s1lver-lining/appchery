<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { listSessions, listAllActivities, createSession } from '$lib/db/repository';
	import { overview, inRange, type ScoredActivity } from '$lib/domain/stats';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import { defaultBowId, formatDayDateTime } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';

	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let scored = $state<ScoredActivity[]>([]);
	let counts = $state<Record<string, number>>({});

	async function refresh() {
		sessions = await listSessions();
		const activities = await listAllActivities();
		counts = activities.reduce<Record<string, number>>((acc, a) => {
			acc[a.sessionId] = (acc[a.sessionId] ?? 0) + a.arrowsShot;
			return acc;
		}, {});
		scored = activities
			.filter((a) => a.kind === 'scoring')
			.map((a) => ({
				id: a.id,
				sessionId: a.sessionId,
				startedAt: a.startedAt,
				totalScore: a.totalScore,
				arrowsShot: a.arrowsShot,
				count10s: a.count10s,
				countX: a.countX,
				roundDefinitionId: a.roundDefinitionId,
				round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
			}));
	}
	$effect(() => {
		refresh();
	});

	async function start() {
		goto(`/sessions/${await createSession({ bowId: $defaultBowId })}`);
	}

	const month = $derived(overview(inRange(scored, 'month')));
	const allTime = $derived(overview(scored));
	const recent = $derived(sessions.slice(0, 3));
</script>

<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
	<header class="mt-2">
		<p class="text-sm text-muted">{$t('home.greeting')}</p>
		<h1 class="text-2xl font-bold tracking-tight">{$t('home.title')}</h1>
	</header>

	<section class="grid grid-cols-2 gap-3">
		<div class="rounded-xl border border-line bg-surface p-4">
			<p class="tabular text-3xl leading-none font-bold text-brand-text">{month.arrows}</p>
			<p class="mt-1 text-xs text-muted">{$t('home.thisMonth')}</p>
		</div>
		<div class="rounded-xl border border-line bg-surface p-4">
			<p class="tabular text-3xl leading-none font-bold">{allTime.arrows}</p>
			<p class="mt-1 text-xs text-muted">{$t('stats.totalArrows')}</p>
		</div>
	</section>

	<section>
		<div class="mb-2 flex items-baseline justify-between">
			<h2 class="text-sm font-semibold">{$t('home.recent')}</h2>
			{#if sessions.length > recent.length}
				<a class="text-xs text-brand-text" href="/sessions">{$t('home.seeAll')}</a>
			{/if}
		</div>

		{#if recent.length === 0}
			<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
				{$t('home.neverShot')}
			</p>
		{:else}
			<ul class="space-y-2">
				{#each recent as s (s.id)}
					<li>
						<a
							href="/sessions/{s.id}"
							class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
						>
							<div class="min-w-0">
								<p class="truncate font-semibold">{s.label ?? $t('sessions.untitled')}</p>
								<p class="text-xs text-muted">{$formatDayDateTime(s.startedAt)}</p>
							</div>
							<div class="text-right">
								<p class="tabular text-lg leading-none font-bold">{counts[s.id] ?? 0}</p>
								<p class="text-[11px] text-muted">{$t('sessions.arrows')}</p>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<!-- The one action this page exists for, kept where the thumb lands. -->
<div class="sticky bottom-0 border-t border-line bg-bg/95 p-4 backdrop-blur">
	<button
		class="mx-auto flex w-full max-w-2xl items-center justify-center gap-1.5 rounded-xl bg-brand py-3 font-semibold text-brand-ink"
		onclick={start}
	>
		<Icon name="plus" size={20} />
		{$t('sessions.new')}
	</button>
</div>
