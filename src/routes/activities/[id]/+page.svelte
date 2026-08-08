<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import {
		endSlots,
		scorableZones,
		missZone,
		scoreAt,
		groupMetrics
	} from '$lib/domain/rounds/geometry';
	import { formatDistance } from '$lib/domain/units';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import {
		getActivity,
		listEnds,
		listShots,
		recordEnd,
		updateShot,
		updateActivity,
		finishActivity,
		shotFromZone,
		shotFromPlot,
		deleteLastEnd,
		type ActivityRow,
		type EndRow,
		type ShotRow
	} from '$lib/db/repository';

	const activityId = $derived($page.params.id as string);


	let activity = $state<ActivityRow | null>(null);
	let rows = $state<{ end: EndRow; shots: ShotRow[] }[]>([]);
	/** Arrows of the end being shot, held here until the end fills and commits itself. */
	let pending = $state<Omit<Shot, 'ordinal'>[]>([]);
	/** Set while retapping an already recorded arrow on the sheet. */
	let editing = $state<{ endId: string; shotId: string; endNo: number; ordinal: number } | null>(
		null
	);
	let plotting = $state(false);
	let observations = $state('');
	let adjustment = $state('');
	let saved = $state(false);

	const round = $derived<RoundDefinition | null>(
		activity?.roundDefinition ? JSON.parse(activity.roundDefinition) : null
	);
	const scoreSet = $derived(round ? getScoreSet(round.scoreSetId) : null);
	const slots = $derived(round ? endSlots(round) : []);
	const currentSlot = $derived(slots[rows.length] ?? null);
	const keypad = $derived<Zone[]>(scoreSet ? scorableZones(scoreSet) : []);
	const template = $derived(activity?.templateKey ? getTemplate(activity.templateKey) : undefined);

	/** Every plotted arrow of the activity, for the group plot and its metrics. */
	const plottedShots = $derived<Shot[]>(
		rows.flatMap((row) =>
			row.shots
				.filter((s) => s.x !== null && s.y !== null)
				.map((s) => ({
					ordinal: s.ordinal,
					value: s.value,
					zoneLabel: s.zoneLabel,
					x: s.x,
					y: s.y,
					source: s.source as Shot['source']
				}))
		)
	);
	const metrics = $derived(groupMetrics(plottedShots));

	/** Running totals per end, so the sheet reads like a paper scorecard. */
	const runningTotals = $derived(
		rows.reduce<number[]>((acc, row) => {
			acc.push((acc[acc.length - 1] ?? 0) + row.end.subtotal);
			return acc;
		}, [])
	);

	async function refresh() {
		activity = await getActivity(activityId);
		observations = activity?.observations ?? '';
		adjustment = activity?.adjustmentMade ?? '';
		const ends = await listEnds(activityId);
		rows = await Promise.all(ends.map(async (end) => ({ end, shots: await listShots(end.id) })));
	}
	$effect(() => {
		refresh();
	});

	async function tapZone(zone: Zone) {
		if (editing) {
			await updateShot(editing.shotId, editing.endId, activityId, zone);
			editing = null;
			await refresh();
			return;
		}
		if (!currentSlot || pending.length >= currentSlot.arrows) return;

		const next = [...pending, shotFromZone(zone)];
		if (next.length < currentSlot.arrows) {
			pending = next;
			return;
		}

		// The end commits itself once full, so there is nothing to confirm and the sheet just advances.
		pending = [];
		// Arrows are written highest first, the order a paper scoresheet uses.
		await recordEnd(
			activityId,
			currentSlot.stageIndex,
			currentSlot.endNo,
			[...next].sort((a, b) => b.value - a.value)
		);
		await refresh();
	}

	/** Plotting derives the value from where the arrow landed, so score and position cannot disagree. */
	async function plot(x: number, y: number) {
		if (!scoreSet) return;
		const zone = scoreAt(scoreSet, x, y);

		if (editing) {
			await updateShot(editing.shotId, editing.endId, activityId, zone, { x, y });
			editing = null;
			await refresh();
			return;
		}
		if (!currentSlot || pending.length >= currentSlot.arrows) return;

		const next = [...pending, shotFromPlot(zone, x, y)];
		if (next.length < currentSlot.arrows) {
			pending = next;
			return;
		}
		pending = [];
		await recordEnd(
			activityId,
			currentSlot.stageIndex,
			currentSlot.endNo,
			[...next].sort((a, b) => b.value - a.value)
		);
		await refresh();
	}

	function undo() {
		pending = pending.slice(0, -1);
	}

	/** Undo for an end already written: only ever the last one, never a gap in the middle. */
	async function undoEnd() {
		await deleteLastEnd(activityId);
		await refresh();
	}

	async function saveTuning() {
		await updateActivity(activityId, { observations, adjustmentMade: adjustment });
		saved = true;
		setTimeout(() => (saved = false), 1500);
	}

	async function finish() {
		await finishActivity(activityId);
		await refresh();
	}

	function zoneFor(label: string): Zone {
		if (!scoreSet) throw new Error('No score set');
		return scoreSet.zones.find((z) => z.label === label) ?? missZone(scoreSet);
	}

	/** A miss has no fill of its own, so it borrows the surface instead of rendering invisible. */
	function chipStyle(label: string): string {
		const zone = zoneFor(label);
		if (!zone.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor}; box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	}
</script>

{#if activity && activity.kind === 'tuning'}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4">
		<header>
			<a href="/sessions/{activity.sessionId}" class="text-sm text-muted">‹ {$t('common.back')}</a>
			<h1 class="text-2xl font-bold tracking-tight">{template?.name ?? $t('tuning.title')}</h1>
		</header>

		{#if template}
			<section class="rounded-xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold">{$t('tuning.steps')}</h2>
				<ol class="list-decimal space-y-1 pl-5 text-sm">
					{#each template.steps as step (step)}
						<li>{step}</li>
					{/each}
				</ol>
			</section>

			<section class="rounded-xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold">{$t('tuning.interpretation')}</h2>
				<ul class="space-y-2 text-sm">
					{#each template.interpretation as row (row.observation)}
						<li>
							<span class="font-medium">{row.observation}</span>
							<span class="block text-muted">{row.suggests}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="space-y-3 rounded-xl border border-line bg-surface p-4">
			<label class="block text-sm font-semibold">
				{$t('tuning.observation')}
				<textarea
					class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
					rows="3"
					bind:value={observations}
				></textarea>
			</label>
			<label class="block text-sm font-semibold">
				{$t('tuning.adjustment')}
				<textarea
					class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
					rows="2"
					bind:value={adjustment}
				></textarea>
			</label>
			<button
				class="w-full rounded-lg bg-brand py-2 font-semibold text-brand-ink"
				onclick={saveTuning}
			>
				{saved ? $t('common.done') : $t('common.save')}
			</button>
		</section>
	</div>
{:else if activity && round && scoreSet}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4">
		<header class="flex items-baseline justify-between gap-2">
			<div>
				<a href="/sessions/{activity.sessionId}" class="text-sm text-muted">‹ {$t('common.back')}</a>
				<h1 class="text-xl font-bold tracking-tight">{round.name}</h1>
			</div>
			<div class="text-right">
				<p class="tabular text-3xl font-bold">{activity.totalScore}</p>
				<p class="text-xs text-muted">{$t('score.total')}</p>
			</div>
		</header>

		<section class="overflow-hidden rounded-xl border border-line bg-surface">
			<div
				class="flex items-center gap-2 border-b border-line bg-sunk px-3 py-2 text-xs font-semibold text-muted"
			>
				<span class="w-8">{$t('score.endColumn')}</span>
				<span class="flex-1">{$t('score.arrowsColumn')}</span>
				<span class="w-10 text-right" title={$t('score.endTotalLong')}>
					{$t('score.endTotalShort')}
				</span>
				<span class="w-12 text-right" title={$t('score.runningTotalLong')}>
					{$t('score.total')}
				</span>
			</div>

			{#each rows as row, i (row.end.id)}
				<div class="flex items-center gap-2 border-b border-line px-3 py-1.5">
					<span class="tabular w-8 text-sm text-muted">{i + 1}</span>
					<div class="flex flex-1 flex-wrap gap-1">
						{#each row.shots as shot (shot.id)}
							<button
								class="tabular h-8 w-8 rounded text-sm font-bold
									{editing?.shotId === shot.id ? 'ring-2 ring-brand' : ''}"
								style={chipStyle(shot.zoneLabel)}
								aria-label={$t('score.editArrow', { n: shot.ordinal, end: i + 1 })}
								onclick={() =>
									(editing =
										editing?.shotId === shot.id
											? null
											: {
													endId: row.end.id,
													shotId: shot.id,
													endNo: i + 1,
													ordinal: shot.ordinal
												})}
							>
								{shot.zoneLabel}
							</button>
						{/each}
					</div>
					<span class="tabular w-10 text-right font-semibold">{row.end.subtotal}</span>
					<span class="tabular w-12 text-right text-muted">{runningTotals[i]}</span>
				</div>
			{/each}

			{#if currentSlot}
				<div class="flex items-center gap-2 bg-brand/5 px-3 py-1.5">
					<span class="tabular w-8 text-sm font-bold text-brand">{rows.length + 1}</span>
					<div class="flex flex-1 flex-wrap gap-1">
						{#each Array(currentSlot.arrows) as _, i (i)}
							{#if pending[i]}
								<span
									class="tabular flex h-8 w-8 items-center justify-center rounded text-sm font-bold"
									style={chipStyle(pending[i].zoneLabel)}
								>
									{pending[i].zoneLabel}
								</span>
							{:else}
								<span class="h-8 w-8 rounded border border-dashed border-line"></span>
							{/if}
						{/each}
					</div>
					<span class="w-10"></span>
					<span class="w-12"></span>
				</div>
			{/if}
		</section>

		{#if currentSlot}
			<p class="text-sm text-muted">
				{$t('score.endOf', { n: rows.length + 1, total: slots.length })} ·
				{currentSlot.stage.distance
					? formatDistance(currentSlot.stage.distance.value, currentSlot.stage.distance.unit)
					: $t('round.unmarked')} ·
				{$t('round.face', { size: currentSlot.stage.faceSize })}
			</p>
		{/if}

		{#if editing}
			<p class="rounded-lg border border-brand/40 bg-brand/10 p-2 text-sm">
				{$t('score.editArrow', { n: editing.ordinal, end: editing.endNo })}
			</p>
		{/if}

		{#if currentSlot || editing}
			<section>
				<div class="mb-2 flex gap-2">
					<button
						class="rounded-lg border px-3 py-1.5 text-sm font-medium
							{plotting ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
						onclick={() => (plotting = !plotting)}
					>
						{$t('score.plotMode')}
					</button>
					{#if rows.length > 0 && !editing}
						<button
							class="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm"
							onclick={undoEnd}
						>
							{$t('score.undoEnd')}
						</button>
					{/if}
				</div>

				{#if plotting}
					<div class="mx-auto mb-3 aspect-square max-w-80 rounded-xl border border-line bg-surface p-2">
						<TargetFace {scoreSet} shots={plottedShots} interactive onplot={plot} />
					</div>
				{/if}

				<div class="grid grid-cols-4 gap-2">
					{#each keypad as zone (zone.label)}
						<button
							class="tabular rounded-lg py-3 text-lg font-bold"
							style={chipStyle(zone.label)}
							onclick={() => tapZone(zone)}
						>
							{zone.label}
						</button>
					{/each}
					<button
						class="rounded-lg border border-line py-3 text-lg font-bold"
						onclick={() => tapZone(missZone(scoreSet))}
					>
						{$t('score.miss')}
					</button>
				</div>
				<div class="mt-2 flex items-center gap-2">
					{#if editing}
						<button
							class="rounded-lg border border-line px-4 py-2 text-sm"
							onclick={() => (editing = null)}
						>
							{$t('common.cancel')}
						</button>
					{:else}
						<button
							class="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-40"
							disabled={pending.length === 0}
							onclick={undo}
						>
							{$t('common.undo')}
						</button>
					{/if}
				</div>
			</section>
		{:else}
			<div class="space-y-2">
				<p class="text-sm text-muted">{$t('score.roundComplete')}</p>
				{#if activity.status !== 'complete'}
					<button
						class="w-full rounded-lg bg-brand py-3 font-semibold text-brand-ink"
						onclick={finish}
					>
						{$t('score.finishActivity')}
					</button>
				{/if}
			</div>
		{/if}

		{#if metrics}
			<section class="rounded-xl border border-line bg-surface p-4 text-sm">
				<h2 class="mb-2 font-semibold">{$t('score.group')}</h2>
				<p class="text-muted">
					{$t('score.groupCentre')}:
					<strong class="tabular text-ink">
						{(metrics.centerX * 100).toFixed(0)}, {(metrics.centerY * 100).toFixed(0)}
					</strong>
					· {$t('score.meanRadius')}:
					<strong class="tabular text-ink">{(metrics.meanRadius * 100).toFixed(1)}</strong>
					· {$t('score.plottedArrows', { n: metrics.sampleSize })}
				</p>
				{#if metrics.sampleSize < 6}
					<p class="mt-1 text-xs text-muted">{$t('score.smallSample')}</p>
				{/if}
			</section>
		{/if}

		<p class="text-sm text-muted">
			{$t('score.average')}:
			<strong class="tabular"
				>{(activity.totalScore / Math.max(activity.arrowsShot, 1)).toFixed(2)}</strong
			>
			· {$t('score.tens')} {activity.count10s} · {$t('score.xs')}
			{activity.countX}
		</p>
	</div>
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}
