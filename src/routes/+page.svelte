<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { ROUNDS, getRound, getScoreSet } from '$lib/domain/rounds/seed';
	import { maxScore, totalArrows } from '$lib/domain/rounds/geometry';
	import { listSessions, createSession } from '$lib/db/repository';
	import { formatDistance } from '$lib/domain/units';

	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let picking = $state(false);

	async function refresh() {
		sessions = await listSessions();
	}
	$effect(() => {
		refresh();
	});

	async function start(roundId: string) {
		const round = getRound(roundId);
		if (!round) return;
		const id = await createSession(round);
		goto(`/sessions/${id}`);
	}

	function roundName(id: string) {
		return getRound(id)?.name ?? id;
	}

	function summarise(round: (typeof ROUNDS)[number]) {
		const distances = round.stages
			.map((s) => (s.distance ? formatDistance(s.distance.value, s.distance.unit) : $t('round.unmarked')))
			.join(' · ');
		return `${distances} — ${$t('round.arrows', { n: totalArrows(round) })}`;
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl p-4">
	<header class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-bold">{$t('sessions.title')}</h1>
		<button
			class="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
			onclick={() => (picking = !picking)}
		>
			{picking ? $t('common.cancel') : $t('sessions.new')}
		</button>
	</header>

	{#if picking}
		<section class="mb-6">
			<h2 class="mb-2 text-sm font-semibold text-slate-500">{$t('sessions.chooseRound')}</h2>
			<ul class="space-y-2">
				{#each ROUNDS as round (round.id)}
					<li>
						<button
							class="w-full rounded-xl border border-slate-200 bg-white p-3 text-left dark:border-slate-800 dark:bg-slate-900"
							onclick={() => start(round.id)}
						>
							<div class="flex items-baseline justify-between gap-2">
								<span class="font-medium">{round.name}</span>
								<span class="text-xs text-slate-500">
									{$t('round.max', { n: maxScore(round, getScoreSet(round.scoreSetId)) })}
								</span>
							</div>
							<p class="mt-0.5 text-sm text-slate-500">{summarise(round)}</p>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if sessions.length === 0}
		<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
			{$t('sessions.empty')}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each sessions as s (s.id)}
				<li>
					<a
						href="/sessions/{s.id}"
						class="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
					>
						<div>
							<p class="font-medium">{roundName(s.roundDefinitionId)}</p>
							<p class="text-sm text-slate-500">
								{new Date(s.startedAt).toLocaleDateString()}
								{#if s.status === 'in_progress'}
									· <span class="text-amber-600">{$t('sessions.inProgress')}</span>
								{/if}
							</p>
						</div>
						<div class="text-right">
							<p class="text-xl font-bold tabular-nums">{s.totalScore}</p>
							<p class="text-xs text-slate-500">{s.arrowsShot} · {s.countX}X</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
