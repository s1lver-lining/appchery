<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import {
		endSlots,
		scorableZones,
		missZone,
		scoreAt,
		groupMetrics,
		type EndSlot
	} from '$lib/domain/rounds/geometry';
	import { formatDistance } from '$lib/domain/units';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import {
		getActivity,
		loadSheet,
		recordEnd,
		updateShot,
		updateActivity,
		finishActivity,
		deleteActivity,
		deleteLastEnd,
		shotFromZone,
		shotFromPlot,
		type ActivityRow,
		type EndRow,
		type ShotRow
	} from '$lib/db/repository';

	const activityId = $derived($page.params.id as string);

	let activity = $state<ActivityRow | null>(null);
	let rows = $state<{ end: EndRow; shots: ShotRow[] }[]>([]);
	/** Arrows of the end being shot, held here until the end fills and commits itself. */
	let pending = $state<Omit<Shot, 'ordinal'>[]>([]);
	/** The end being written, kept on screen so the row never blinks out while the write lands. */
	let committing = $state<Omit<Shot, 'ordinal'>[] | null>(null);
	let editing = $state<{ endId: string; shotId: string; endNo: number; ordinal: number } | null>(
		null
	);
	let plotting = $state(false);
	let openEnd = $state<number | null>(null);
	let observations = $state('');
	let adjustment = $state('');
	let saved = $state(false);

	const round = $derived<RoundDefinition | null>(
		activity?.roundDefinition ? JSON.parse(activity.roundDefinition) : null
	);
	const scoreSet = $derived(round ? getScoreSet(round.scoreSetId) : null);
	const slots = $derived(round ? endSlots(round) : []);
	const currentSlot = $derived(committing ? null : (slots[rows.length] ?? null));
	const keypad = $derived<Zone[]>(scoreSet ? scorableZones(scoreSet) : []);
	const template = $derived(activity?.templateKey ? getTemplate(activity.templateKey) : undefined);
	/** True only once every end is stored, so a write in flight never reads as a finished round. */
	const complete = $derived(!committing && slots.length > 0 && rows.length >= slots.length);

	interface SheetRow {
		key: string;
		shots: { id: string | null; ordinal: number; zoneLabel: string; x: number | null; y: number | null }[];
		subtotal: number;
		endId: string | null;
	}

	const sheetRows = $derived<SheetRow[]>([
		...rows.map((row) => ({
			key: row.end.id,
			endId: row.end.id,
			subtotal: row.end.subtotal,
			shots: row.shots.map((s) => ({
				id: s.id,
				ordinal: s.ordinal,
				zoneLabel: s.zoneLabel,
				x: s.x,
				y: s.y
			}))
		})),
		...(committing
			? [
					{
						key: 'committing',
						endId: null,
						subtotal: committing.reduce((sum, s) => sum + s.value, 0),
						shots: committing.map((s, i) => ({
							id: null,
							ordinal: i + 1,
							zoneLabel: s.zoneLabel,
							x: s.x,
							y: s.y
						}))
					}
				]
			: [])
	]);

	const runningTotals = $derived(
		sheetRows.reduce<number[]>((acc, row) => {
			acc.push((acc[acc.length - 1] ?? 0) + row.subtotal);
			return acc;
		}, [])
	);

	/**
	 * Totals shown come from the sheet, not from the stored activity row. The row is refreshed a
	 * moment later, and reading it here made the header lag behind every commit and undo.
	 */
	const shownShots = $derived(sheetRows.flatMap((r) => r.shots));
	const shownTotal = $derived(runningTotals[runningTotals.length - 1] ?? 0);
	const shownTens = $derived(
		shownShots.filter((s) => s.zoneLabel === '10' || s.zoneLabel === 'X').length
	);
	const shownXs = $derived(shownShots.filter((s) => s.zoneLabel === 'X').length);

	function toShots(list: { x: number | null; y: number | null; zoneLabel: string }[]): Shot[] {
		return list.map((s, i) => ({
			ordinal: i + 1,
			value: 0,
			zoneLabel: s.zoneLabel,
			x: s.x,
			y: s.y,
			source: 'plotted' as const
		}));
	}

	/** Arrows already stored, for the faded layer behind whatever is being placed now. */
	const storedPlotted = $derived<Shot[]>(
		toShots(rows.flatMap((r) => r.shots)).filter((s) => s.x !== null)
	);
	/** The end in progress, drawn at full strength so the newest arrow is unmistakable. */
	const livePlotted = $derived<Shot[]>(toShots(pending).filter((s) => s.x !== null));
	const metrics = $derived(groupMetrics([...storedPlotted, ...livePlotted]));

	const openRow = $derived(openEnd !== null ? sheetRows[openEnd] : null);
	const openRowShots = $derived<Shot[]>(openRow ? toShots(openRow.shots).filter((s) => s.x !== null) : []);
	const openRowOthers = $derived<Shot[]>(
		openRow
			? toShots(sheetRows.filter((r) => r.key !== openRow.key).flatMap((r) => r.shots)).filter(
					(s) => s.x !== null
				)
			: []
	);

	async function refresh() {
		activity = await getActivity(activityId);
		observations = activity?.observations ?? '';
		adjustment = activity?.adjustmentMade ?? '';
		const { ends, shotsByEnd } = await loadSheet(activityId);
		rows = ends.map((end) => ({ end, shots: shotsByEnd.get(end.id) ?? [] }));
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
		await commitEnd(currentSlot, next);
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
		await commitEnd(currentSlot, next);
	}

	/**
	 * The slot is passed in rather than read again: `currentSlot` derives from `committing`, so it
	 * turns null the moment the optimistic row is shown.
	 */
	async function commitEnd(slot: EndSlot, shots: Omit<Shot, 'ordinal'>[]) {
		// Arrows are written highest first, the order a paper scoresheet uses.
		const ordered = [...shots].sort((a, b) => b.value - a.value);
		committing = ordered;
		pending = [];
		await recordEnd(activityId, slot.stageIndex, slot.endNo, ordered);
		await refresh();
		committing = null;
	}

	function undo() {
		pending = pending.slice(0, -1);
	}

	/** Undo for an end already written: only ever the last one, never a gap in the middle. */
	async function undoEnd() {
		// Drop the row locally first so the sheet responds to the tap, not to the write finishing.
		rows = rows.slice(0, -1);
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

	async function remove() {
		const sessionId = activity?.sessionId;
		await deleteActivity(activityId);
		goto(sessionId ? `/sessions/${sessionId}` : '/');
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

	/** The slot the next tap will fill, so the archer never has to work out where they are. */
	const cursorClass = 'ring-2 ring-brand ring-offset-1 ring-offset-surface';
</script>

{#if activity && activity.kind === 'tuning'}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
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

		<button class="flex items-center gap-1.5 text-sm text-danger" onclick={remove}>
			<Icon name="trash" size={16} />
			{$t('activity.delete')}
		</button>
	</div>
{:else if activity && round && scoreSet}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
		<header class="flex items-baseline justify-between gap-2">
			<div>
				<a href="/sessions/{activity.sessionId}" class="text-sm text-muted">‹ {$t('common.back')}</a>
				<h1 class="text-xl font-bold tracking-tight">{round.name}</h1>
			</div>
			<div class="text-right">
				<p class="tabular text-3xl font-bold">{shownTotal}</p>
				<p class="text-xs text-muted">{$t('score.total')}</p>
			</div>
		</header>

		<section class="overflow-hidden rounded-xl border border-line bg-surface">
			<div
				class="flex items-center gap-1 border-b border-line bg-sunk px-2 py-1.5 text-[11px] font-semibold text-muted"
			>
				<span class="w-5">{$t('score.endColumn')}</span>
				<span class="flex-1">{$t('score.arrowsColumn')}</span>
				<span class="w-8 text-right" title={$t('score.endTotalLong')}>
					{$t('score.endTotalShort')}
				</span>
				<span class="w-9 text-right" title={$t('score.runningTotalLong')}>
					{$t('score.total')}
				</span>
			</div>

			{#each sheetRows as row, i (row.key)}
				<div class="flex items-center gap-1 border-b border-line px-2 py-1">
					<button
						class="tabular w-5 shrink-0 text-left text-xs font-medium text-brand-text"
						onclick={() => (openEnd = i)}
						aria-label={$t('score.end', { n: i + 1 })}
					>
						{i + 1}
					</button>
					<div class="flex flex-1 gap-0.5">
						{#each row.shots as shot (shot.ordinal)}
							{#if shot.id}
								<button
									class="tabular h-7 w-7 shrink-0 rounded text-[13px] font-bold
										{editing?.shotId === shot.id ? cursorClass : ''}"
									style={chipStyle(shot.zoneLabel)}
									aria-label={$t('score.editArrow', { n: shot.ordinal, end: i + 1 })}
									onclick={() =>
										(editing =
											editing?.shotId === shot.id
												? null
												: {
														endId: row.endId as string,
														shotId: shot.id as string,
														endNo: i + 1,
														ordinal: shot.ordinal
													})}
								>
									{shot.zoneLabel}
								</button>
							{:else}
								<span
									class="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded text-[13px] font-bold"
									style={chipStyle(shot.zoneLabel)}
								>
									{shot.zoneLabel}
								</span>
							{/if}
						{/each}
					</div>
					<span class="tabular w-8 text-right text-sm font-semibold">{row.subtotal}</span>
					<span class="tabular w-9 text-right text-sm text-muted">{runningTotals[i]}</span>
				</div>
			{/each}

			{#if currentSlot}
				<div class="flex items-center gap-1 bg-brand/5 px-2 py-1">
					<span class="tabular w-5 text-xs font-bold text-brand-text">{rows.length + 1}</span>
					<div class="flex flex-1 gap-0.5">
						{#each Array(currentSlot.arrows) as _, i (i)}
							{#if pending[i]}
								<span
									class="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded text-[13px] font-bold"
									style={chipStyle(pending[i].zoneLabel)}
								>
									{pending[i].zoneLabel}
								</span>
							{:else}
								<span
									class="h-7 w-7 shrink-0 rounded border border-dashed
										{i === pending.length && !editing
										? 'border-brand bg-brand/15 ' + cursorClass
										: 'border-line'}"
								></span>
							{/if}
						{/each}
					</div>
					<span class="w-8"></span>
					<span class="w-9"></span>
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
							class="rounded-lg border border-line px-3 py-1.5 text-sm"
							onclick={undoEnd}
						>
							{$t('score.undoEnd')}
						</button>
					{/if}
				</div>

				{#if plotting}
					<div
						class="mx-auto aspect-square w-full max-w-80 rounded-xl border border-line bg-surface p-2"
					>
						<TargetFace
							{scoreSet}
							shots={livePlotted}
							otherShots={storedPlotted}
							interactive
							showOtherToggle
							showCentreToggle
							onplot={plot}
						/>
					</div>
					<p class="mt-2 text-center text-xs text-muted">{$t('score.plotHint')}</p>
				{:else}
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
				{/if}
			</section>
		{/if}

		{#if complete}
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
			<strong class="tabular">
				{(shownTotal / Math.max(shownShots.length, 1)).toFixed(2)}
			</strong>
			· {$t('score.tens')} {shownTens} · {$t('score.xs')}
			{shownXs}
		</p>

		<button class="flex items-center gap-1.5 text-sm text-danger" onclick={remove}>
			<Icon name="trash" size={16} />
			{$t('activity.delete')}
		</button>
	</div>

	{#if openRow}
		<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
			<div class="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-bold">{$t('score.end', { n: (openEnd ?? 0) + 1 })}</h2>
					<button
						class="text-muted"
						aria-label={$t('common.close')}
						onclick={() => (openEnd = null)}
					>
						<Icon name="close" size={20} />
					</button>
				</div>

				<div class="mb-3 flex flex-wrap gap-1">
					{#each openRow.shots as shot (shot.ordinal)}
						<span
							class="tabular flex h-9 w-9 items-center justify-center rounded text-sm font-bold"
							style={chipStyle(shot.zoneLabel)}
						>
							{shot.zoneLabel}
						</span>
					{/each}
				</div>

				<dl class="mb-3 flex justify-between text-sm">
					<div><dt class="text-muted">{$t('score.endTotalLong')}</dt>
						<dd class="tabular text-xl font-bold">{openRow.subtotal}</dd></div>
					<div class="text-right"><dt class="text-muted">{$t('score.runningTotalLong')}</dt>
						<dd class="tabular text-xl font-bold">{runningTotals[openEnd ?? 0]}</dd></div>
				</dl>

				{#if openRowShots.length > 0 || openRowOthers.length > 0}
					<div class="mx-auto aspect-square w-full max-w-64 rounded-xl border border-line p-2">
						<TargetFace
							{scoreSet}
							shots={openRowShots}
							otherShots={openRowOthers}
							showOtherToggle
						/>
					</div>
				{:else}
					<p class="text-center text-sm text-muted">{$t('score.noPlots')}</p>
				{/if}
			</div>
		</div>
	{/if}
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}
