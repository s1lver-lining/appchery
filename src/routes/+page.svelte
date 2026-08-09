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

<div class="flex min-h-full flex-col">
<!--
	The header carries the app's own geometry: concentric arcs struck from off screen, so the curves
	read as part of a target face rather than as decoration borrowed from somewhere else.
-->
<header class="safe-top relative overflow-hidden bg-brand/10 pt-6 pb-9">
	<svg
		class="pointer-events-none absolute -top-16 -right-24 h-72 w-72 text-brand"
		viewBox="0 0 100 100"
		fill="none"
		aria-hidden="true"
	>
		{#each [46, 36, 26, 16] as r, i (r)}
			<circle cx="50" cy="50" {r} stroke="currentColor" stroke-width="6" opacity={0.08 + i * 0.05} />
		{/each}
		<circle cx="50" cy="50" r="7" fill="currentColor" opacity="0.35" />
	</svg>

	<div class="relative mx-auto w-full max-w-2xl px-4">
		<p class="text-sm font-medium text-brand-text">{$t('home.greeting')}</p>
		<h1 class="text-3xl font-bold tracking-tight">{$t('home.title')}</h1>

		<!-- The two figures sit in the header rather than under it, so the curves frame real data. -->
		<dl class="mt-5 flex items-end gap-6">
			<div>
				<dd class="tabular text-4xl leading-none font-bold text-brand-text">{month.arrows}</dd>
				<dt class="mt-1 text-xs text-muted">{$t('home.thisMonth')}</dt>
			</div>
			<div class="h-8 w-px bg-line"></div>
			<div>
				<dd class="tabular text-2xl leading-none font-semibold">{allTime.arrows}</dd>
				<dt class="mt-1 text-xs text-muted">{$t('stats.totalArrows')}</dt>
			</div>
		</dl>
	</div>

	<!-- A drawn edge instead of a hard line, which is what stops the block reading as a coloured box. -->
	<svg
		class="absolute inset-x-0 -bottom-px h-9 w-full text-bg"
		viewBox="0 0 100 12"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<path d="M0 12 V8 C22 -1 62 1 100 6 V12 Z" fill="currentColor" />
	</svg>
</header>

<div class="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
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
</div>
