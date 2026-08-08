<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { getRound, getScoreSet } from '$lib/domain/rounds/seed';
	import { endSlots, scorableZones } from '$lib/domain/rounds/geometry';
	import { formatDistance } from '$lib/domain/units';
	import type { Shot, Zone } from '$lib/domain/rounds/types';
	import {
		getSession,
		listEnds,
		recordEnd,
		finishSession,
		shotFromZone
	} from '$lib/db/repository';
	import TargetFace from '$lib/ui/TargetFace.svelte';

	// The route only matches with an id present; the param type is optional.
	const sessionId = $derived($page.params.id as string);

	let session = $state<Awaited<ReturnType<typeof getSession>>>(null);
	let ends = $state<Awaited<ReturnType<typeof listEnds>>>([]);
	/** Arrows entered for the end in progress, not yet committed to the database. */
	let pending = $state<Omit<Shot, 'ordinal'>[]>([]);

	const round = $derived(session ? getRound(session.roundDefinitionId) : undefined);
	const scoreSet = $derived(round ? getScoreSet(round.scoreSetId) : undefined);
	const slots = $derived(round ? endSlots(round) : []);
	const currentSlot = $derived(slots[ends.length] ?? null);
	const keypad = $derived<Zone[]>(scoreSet ? scorableZones(scoreSet) : []);
	const pendingTotal = $derived(pending.reduce((sum, s) => sum + s.value, 0));

	async function refresh() {
		session = await getSession(sessionId);
		ends = await listEnds(sessionId);
	}
	$effect(() => {
		refresh();
	});

	function addArrow(zone: Zone) {
		if (!currentSlot || pending.length >= currentSlot.arrows) return;
		pending = [...pending, shotFromZone(zone)];
	}

	function undo() {
		pending = pending.slice(0, -1);
	}

	async function commit() {
		if (!currentSlot || pending.length !== currentSlot.arrows) return;
		// Arrows are scored highest first by convention, and the stored order is
		// what a scoresheet would show.
		const ordered = [...pending].sort((a, b) => b.value - a.value);
		await recordEnd(sessionId, currentSlot.stageIndex, currentSlot.endNo, ordered);
		pending = [];
		await refresh();
	}

	async function finish() {
		await finishSession(sessionId);
		goto('/');
	}
</script>

{#if session && round && scoreSet}
	<div class="safe-top mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
		<header class="flex items-baseline justify-between">
			<div>
				<a href="/" class="text-sm text-slate-500">← {$t('common.back')}</a>
				<h1 class="text-xl font-bold">{round.name}</h1>
			</div>
			<div class="text-right">
				<p class="text-3xl font-bold tabular-nums">{session.totalScore}</p>
				<p class="text-xs text-slate-500">{$t('score.runningTotal')}</p>
			</div>
		</header>

		{#if currentSlot}
			<section class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
				<div class="mb-3 flex items-baseline justify-between">
					<p class="font-medium">
						{$t('score.endOf', { n: ends.length + 1, total: slots.length })}
					</p>
					<p class="text-sm text-slate-500">
						{currentSlot.stage.distance
							? formatDistance(currentSlot.stage.distance.value, currentSlot.stage.distance.unit)
							: $t('round.unmarked')}
						· {$t('round.face', { size: currentSlot.stage.faceSize })}
					</p>
				</div>

				<!-- One slot per arrow, so the end's shape is visible before it is filled. -->
				<div class="mb-3 flex gap-2">
					{#each Array(currentSlot.arrows) as _, i (i)}
						<div
							class="flex h-12 flex-1 items-center justify-center rounded-lg border text-lg font-semibold tabular-nums
								{pending[i]
								? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
								: 'border-dashed border-slate-300 text-slate-300 dark:border-slate-700 dark:text-slate-700'}"
						>
							{pending[i]?.zoneLabel ?? '·'}
						</div>
					{/each}
				</div>

				<div class="grid grid-cols-4 gap-2">
					{#each keypad as zone (zone.label)}
						<button
							class="rounded-lg py-3 text-lg font-bold tabular-nums"
							style="background-color: {zone.color}; color: {zone.strokeColor};"
							disabled={pending.length >= currentSlot.arrows}
							onclick={() => addArrow(zone)}
						>
							{zone.label}
						</button>
					{/each}
					<button
						class="rounded-lg border border-slate-300 py-3 text-lg font-bold dark:border-slate-700"
						disabled={pending.length >= currentSlot.arrows}
						onclick={() => addArrow(scoreSet.zones[0])}
					>
						{$t('score.miss')}
					</button>
				</div>

				<div class="mt-3 flex items-center gap-2">
					<button
						class="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-slate-700"
						disabled={pending.length === 0}
						onclick={undo}
					>
						{$t('common.undo')}
					</button>
					<span class="text-sm text-slate-500">
						{$t('score.endTotal')}: <strong class="tabular-nums">{pendingTotal}</strong>
					</span>
					<button
						class="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
						disabled={pending.length !== currentSlot.arrows}
						onclick={commit}
					>
						{$t('score.confirmEnd')}
					</button>
				</div>
			</section>
		{:else}
			<button
				class="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white"
				onclick={finish}
			>
				{$t('score.finishSession')}
			</button>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			<section class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
				<div class="mx-auto aspect-square max-w-56">
					<TargetFace {scoreSet} />
				</div>
			</section>

			<section class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
				{#if ends.length === 0}
					<p class="text-sm text-slate-500">{$t('score.tapToScore')}</p>
				{:else}
					<ul class="space-y-1 text-sm">
						{#each ends as e, i (e.id)}
							<li class="flex justify-between border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
								<span class="text-slate-500">{$t('score.end', { n: i + 1 })}</span>
								<span class="font-semibold tabular-nums">{e.subtotal}</span>
							</li>
						{/each}
					</ul>
					<p class="mt-2 text-sm text-slate-500">
						{$t('score.average')}:
						<strong class="tabular-nums">
							{(session.totalScore / Math.max(session.arrowsShot, 1)).toFixed(2)}
						</strong>
					</p>
				{/if}
			</section>
		</div>
	</div>
{:else}
	<p class="p-8 text-center text-slate-500">{$t('common.loading')}</p>
{/if}
