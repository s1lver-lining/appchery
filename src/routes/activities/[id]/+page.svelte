<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { getScoreSet, roundNeedsVerification } from '$lib/domain/rounds/seed';
	import {
		endSlots,
		scorableZones,
		missZone,
		scoreAt,
		groupMetrics,
		type EndSlot
	} from '$lib/domain/rounds/geometry';
	import { formatDistance, mmToInches, inchesToMm } from '$lib/domain/units';
	import { getTemplate } from '$lib/domain/tuning/templates';
	import { schemaFor, diffSettings, type BowSettings, type SettingField } from '$lib/domain/equipment/schemas';
	import type { BowType } from '$lib/domain/tuning/templates';
	import type { RoundDefinition, Shot, Zone } from '$lib/domain/rounds/types';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import {
		getActivity,
		getSession,
		getBow,
		currentRevision,
		createRevision,
		linkResultingRevision,
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
		type ShotRow,
		type BowRow
	} from '$lib/db/repository';

	const activityId = $derived($page.params.id as string);

	let activity = $state<ActivityRow | null>(null);
	let stored = $state<{ end: EndRow; shots: ShotRow[] }[]>([]);
	/**
	 * Ends committed locally whose write has not landed yet. Keeping a list rather than a single
	 * slot is what lets the archer keep scoring while the previous end is still being written.
	 */
	let queued = $state<{ key: string; shots: Omit<Shot, 'ordinal'>[] }[]>([]);
	/** Rows hidden by an undo that is still in flight. */
	let hiddenTail = $state(0);
	let pending = $state<Omit<Shot, 'ordinal'>[]>([]);
	let editing = $state<{ endId: string; shotId: string; endNo: number; ordinal: number } | null>(
		null
	);
	let plotting = $state(false);
	let openEnd = $state<number | null>(null);
	/** Shot id being retapped inside the end modal. */
	let modalEditing = $state<string | null>(null);
	let observations = $state('');
	let adjustment = $state('');
	let saved = $state(false);

	let bow = $state<BowRow | null>(null);
	let draft = $state<BowSettings>({});
	let savedSettings = $state<BowSettings>({});
	let applied = $state(false);

	let sheetScroller = $state<HTMLDivElement | null>(null);

	const round = $derived<RoundDefinition | null>(
		activity?.roundDefinition ? JSON.parse(activity.roundDefinition) : null
	);
	const scoreSet = $derived(round ? getScoreSet(round.scoreSetId) : null);
	const unverified = $derived(round ? roundNeedsVerification(round) : false);
	const slots = $derived(round ? endSlots(round) : []);
	const keypad = $derived<Zone[]>(scoreSet ? scorableZones(scoreSet) : []);
	const template = $derived(activity?.templateKey ? getTemplate(activity.templateKey) : undefined);

	interface SheetRow {
		key: string;
		shots: {
			id: string | null;
			ordinal: number;
			zoneLabel: string;
			x: number | null;
			y: number | null;
		}[];
		subtotal: number;
		endId: string | null;
	}

	const sheetRows = $derived<SheetRow[]>(
		[
			...stored.map((row) => ({
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
			...queued.map((q) => ({
				key: q.key,
				endId: null,
				subtotal: q.shots.reduce((sum, s) => sum + s.value, 0),
				shots: q.shots.map((s, i) => ({
					id: null,
					ordinal: i + 1,
					zoneLabel: s.zoneLabel,
					x: s.x,
					y: s.y
				}))
			}))
		].slice(0, stored.length + queued.length - hiddenTail)
	);

	/** Counted from what is on screen, so the next end opens the moment the last one is entered. */
	const currentSlot = $derived(slots[sheetRows.length] ?? null);
	const complete = $derived(slots.length > 0 && sheetRows.length >= slots.length);

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

	const storedPlotted = $derived<Shot[]>(toShots(shownShots).filter((s) => s.x !== null));
	const livePlotted = $derived<Shot[]>(toShots(pending).filter((s) => s.x !== null));
	const metrics = $derived(groupMetrics([...storedPlotted, ...livePlotted]));

	const openRow = $derived(openEnd !== null ? sheetRows[openEnd] : null);
	const openRowShots = $derived<Shot[]>(
		openRow ? toShots(openRow.shots).filter((s) => s.x !== null) : []
	);

	/**
	 * Follow the shooting: the row being filled must stay in view, whether that is on first load of a
	 * part shot round or after each arrow pushes the sheet down.
	 */
	$effect(() => {
		// Touch both so the effect reruns as arrows and ends are added.
		void sheetRows.length;
		void pending.length;
		if (!sheetScroller) return;
		const el = sheetScroller;
		requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
	});

	async function loadRows() {
		const { ends, shotsByEnd } = await loadSheet(activityId);
		return ends.map((end) => ({ end, shots: shotsByEnd.get(end.id) ?? [] }));
	}

	async function refresh() {
		activity = await getActivity(activityId);
		observations = activity?.observations ?? '';
		adjustment = activity?.adjustmentMade ?? '';
		stored = await loadRows();

		if (activity?.kind === 'tuning') {
			const session = await getSession(activity.sessionId);
			bow = session?.bowId ? await getBow(session.bowId) : null;
			const revision = bow ? await currentRevision(bow.id) : null;
			savedSettings = revision ? JSON.parse(revision.settings) : {};
			draft = { ...savedSettings };
		}
	}
	$effect(() => {
		refresh();
	});

	// Writes are chained so ends reach the database in the order they were shot.
	let writes = Promise.resolve();

	function enqueueEnd(slot: EndSlot, shots: Omit<Shot, 'ordinal'>[]) {
		// Arrows are written highest first, the order a paper scoresheet uses.
		const ordered = [...shots].sort((a, b) => b.value - a.value);
		const key = crypto.randomUUID();
		queued = [...queued, { key, shots: ordered }];
		pending = [];

		writes = writes.then(async () => {
			await recordEnd(activityId, slot.stageIndex, slot.endNo, ordered);
			const fresh = await loadRows();
			// Swap both together so the row never exists twice or vanishes between the two updates.
			stored = fresh;
			queued = queued.filter((q) => q.key !== key);
			activity = await getActivity(activityId);
		});
	}

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
		enqueueEnd(currentSlot, next);
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
		enqueueEnd(currentSlot, next);
	}

	function closeModal() {
		openEnd = null;
		modalEditing = null;
	}

	/** Editing from the modal keeps it open, so several arrows of one end can be fixed in a row. */
	async function editModalShot(zone: Zone) {
		const row = openRow;
		if (!modalEditing || !row?.endId) return;
		await updateShot(modalEditing, row.endId, activityId, zone);
		modalEditing = null;
		stored = await loadRows();
		activity = await getActivity(activityId);
	}

	function undo() {
		pending = pending.slice(0, -1);
	}

	/** Undo for an end already entered: hide it at once, then wait for queued writes before deleting. */
	async function undoEnd() {
		if (sheetRows.length === 0) return;
		hiddenTail += 1;
		try {
			await writes;
			await deleteLastEnd(activityId);
			stored = await loadRows();
			activity = await getActivity(activityId);
		} finally {
			hiddenTail = Math.max(0, hiddenTail - 1);
		}
	}

	async function saveTuning() {
		await updateActivity(activityId, { observations, adjustmentMade: adjustment });
		saved = true;
		setTimeout(() => (saved = false), 1500);
	}

	const bowType = $derived((bow?.type ?? 'recurve') as BowType);
	const bowFields = $derived(bow ? schemaFor(bowType) : []);
	const settingChanges = $derived(bow ? diffSettings(bowType, savedSettings, draft) : []);

	function displayValue(field: SettingField): string {
		const value = draft[field.key];
		if (value === null || value === undefined || value === '') return '';
		if (field.kind === 'lengthMm') return String(Math.round(mmToInches(Number(value)) * 100) / 100);
		return String(value);
	}

	function setValue(field: SettingField, raw: string) {
		if (raw === '') draft = { ...draft, [field.key]: null };
		else if (field.kind === 'lengthMm')
			draft = { ...draft, [field.key]: Math.round(inchesToMm(Number(raw)) * 10) / 10 };
		else if (field.kind === 'number') draft = { ...draft, [field.key]: Number(raw) };
		else draft = { ...draft, [field.key]: raw };
	}

	function formatStored(field: SettingField, value: string | number | null): string {
		if (value === null || value === '') return '—';
		if (field.kind === 'lengthMm') return `${Math.round(mmToInches(Number(value)) * 100) / 100}"`;
		return field.unit ? `${value} ${field.unit}` : String(value);
	}

	/**
	 * Closes the loop: the adjustment becomes a bow revision, and the activity records which
	 * revision it produced, so a later score traces back to the test that caused the change.
	 */
	async function applyAdjustment() {
		if (!bow || settingChanges.length === 0) return;
		const reason = [template?.name, adjustment.trim() || observations.trim()]
			.filter(Boolean)
			.join(': ');
		const revisionId = await createRevision(bow.id, draft, reason);
		await linkResultingRevision(activityId, revisionId);
		await updateActivity(activityId, { observations, adjustmentMade: adjustment });
		applied = true;
		await refresh();
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

	// Outline rather than ring: the chip sets an inline box-shadow, which a ring would lose to.
	const cursorClass = 'outline outline-2 outline-brand outline-offset-2';
</script>

{#if activity && activity.kind === 'tuning'}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
		<header>
			<a href="/sessions/{activity.sessionId}" class="text-sm text-muted">‹ {$t('common.back')}</a>
			<h1 class="text-2xl font-bold tracking-tight">{template?.name ?? $t('tuning.title')}</h1>
			{#if bow}
				<p class="text-sm text-muted">{bow.name}</p>
			{/if}
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
				class="w-full rounded-lg border border-line py-2 font-semibold"
				onclick={saveTuning}
			>
				{saved ? $t('common.done') : $t('common.save')}
			</button>
		</section>

		{#if activity.resultingRevisionId}
			<section class="rounded-xl border border-brand bg-brand/10 p-4 text-sm">
				<p class="font-semibold">{$t('tuning.applied')}</p>
				<a class="text-brand-text" href="/equipment/{bow?.id}">{$t('tuning.viewHistory')}</a>
			</section>
		{:else if bow}
			<section class="rounded-xl border border-line bg-surface p-4">
				<h2 class="text-sm font-semibold">{$t('tuning.applyTitle')}</h2>
				<p class="mt-0.5 mb-3 text-sm text-muted">{$t('tuning.applyHint')}</p>

				<div class="grid gap-3 sm:grid-cols-2">
					{#each bowFields as field (field.key)}
						<label class="text-sm">
							{field.label}
							{#if field.unit}<span class="text-muted">({field.unit})</span>{/if}
							{#if field.kind === 'select'}
								<select
									class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
									value={displayValue(field)}
									oninput={(e) => setValue(field, e.currentTarget.value)}
								>
									<option value=""></option>
									{#each field.options ?? [] as option (option)}
										<option value={option}>{option}</option>
									{/each}
								</select>
							{:else}
								<input
									type={field.kind === 'text' ? 'text' : 'number'}
									step={field.kind === 'lengthMm' ? '0.05' : 'any'}
									class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
									value={displayValue(field)}
									oninput={(e) => setValue(field, e.currentTarget.value)}
								/>
							{/if}
						</label>
					{/each}
				</div>

				{#if settingChanges.length > 0}
					<ul class="mt-3 space-y-1 text-sm">
						{#each settingChanges as change (change.field.key)}
							<li class="flex justify-between gap-2">
								<span class="text-muted">{change.field.label}</span>
								<span>
									{formatStored(change.field, change.before)} → <strong
										>{formatStored(change.field, change.after)}</strong
									>
								</span>
							</li>
						{/each}
					</ul>
				{/if}

				<button
					class="mt-3 w-full rounded-lg bg-brand py-2 font-semibold text-brand-ink disabled:opacity-50"
					disabled={settingChanges.length === 0 || applied}
					onclick={applyAdjustment}
				>
					{$t('tuning.apply')}
				</button>
			</section>
		{:else}
			<p class="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
				{$t('tuning.noBowSelected')}
			</p>
		{/if}

		<button class="flex items-center gap-1.5 text-sm text-danger" onclick={remove}>
			<Icon name="trash" size={16} />
			{$t('activity.delete')}
		</button>
	</div>
{:else if activity && round && scoreSet}
	<div class="mx-auto flex w-full max-w-2xl flex-col">
		<!-- A fixed height, not a minimum: the sheet must scroll so the keypad stays on screen. -->
		<!-- Capped rather than fixed, so a short sheet leaves no dead space under the keypad. -->
<div class="safe-top flex max-h-[calc(100dvh-4.6rem)] flex-col gap-3 p-4 pt-6">
		<div class="shrink-0">
			<header class="flex items-center gap-2">
				<a
					href="/sessions/{activity.sessionId}"
					class="shrink-0 text-muted"
					aria-label={$t('common.back')}
				>
					<Icon name="back" size={22} />
				</a>
				<h1 class="min-w-0 flex-1 truncate text-center text-base font-bold">{round.name}</h1>
				<div class="shrink-0 text-right">
					<p class="tabular text-xl leading-none font-bold">{shownTotal}</p>
					<p class="text-[10px] text-muted">{$t('score.total')}</p>
				</div>
			</header>

			{#if unverified}
				<p class="mt-2 rounded-lg border border-accent/50 bg-accent/10 p-2 text-xs">
					{$t('round.unverified')}
				</p>
			{/if}
		</div>

		<!-- Sized by its rows rather than stretched: an empty sheet should not draw a tall empty box. -->
		<section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
			<div
				class="flex shrink-0 items-center gap-1 border-b border-line bg-sunk px-2 py-1.5 text-[11px] font-semibold text-muted"
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

			<!-- The cap is what keeps the keypad on screen once the sheet has more ends than fit. -->
			<div bind:this={sheetScroller} class="max-h-[42dvh] overflow-y-auto">
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
						<span class="tabular w-5 text-xs font-bold text-brand-text">{sheetRows.length + 1}</span>
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
			</div>
		</section>

		<div class="shrink-0">
			{#if currentSlot}
				<p class="mb-2 text-sm text-muted">
					{$t('score.endOf', { n: sheetRows.length + 1, total: slots.length })} ·
					{currentSlot.stage.distance
						? formatDistance(currentSlot.stage.distance.value, currentSlot.stage.distance.unit)
						: $t('round.unmarked')} ·
					{$t('round.face', { size: currentSlot.stage.faceSize })}
				</p>
			{/if}

			{#if currentSlot || editing}
				<div class="mb-2 flex gap-2">
					<button
						class="rounded-lg border px-3 py-1.5 text-sm font-medium
							{plotting ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
						onclick={() => (plotting = !plotting)}
					>
						{$t('score.plotMode')}
					</button>
					{#if sheetRows.length > 0 && !editing}
						<button class="rounded-lg border border-line px-3 py-1.5 text-sm" onclick={undoEnd}>
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
				{/if}
			{/if}
		</div>

		{#if (currentSlot || editing) && !plotting}
			<div class="flex items-center gap-2">
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

		</div>

		<div class="space-y-3 p-4 pt-0">
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
	</div>

	{#if openRow}
		<!-- The backdrop is a button so a tap outside closes, which is what a modal is expected to do. -->
		<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
			<button
				class="absolute inset-0 bg-black/40"
				aria-label={$t('common.close')}
				onclick={closeModal}
			></button>

			<div
				class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
			>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-bold">{$t('score.end', { n: (openEnd ?? 0) + 1 })}</h2>
					<button class="text-muted" aria-label={$t('common.close')} onclick={closeModal}>
						<Icon name="close" size={20} />
					</button>
				</div>

				<div class="mb-3 flex flex-wrap gap-1">
					{#each openRow.shots as shot (shot.ordinal)}
						{#if shot.id}
							<button
								class="tabular flex h-9 w-9 items-center justify-center rounded text-sm font-bold
									{modalEditing === shot.id ? cursorClass : ''}"
								style={chipStyle(shot.zoneLabel)}
								aria-label={$t('score.editArrow', { n: shot.ordinal, end: (openEnd ?? 0) + 1 })}
								onclick={() => (modalEditing = modalEditing === shot.id ? null : shot.id)}
							>
								{shot.zoneLabel}
							</button>
						{:else}
							<span
								class="tabular flex h-9 w-9 items-center justify-center rounded text-sm font-bold"
								style={chipStyle(shot.zoneLabel)}
							>
								{shot.zoneLabel}
							</span>
						{/if}
					{/each}
				</div>

				{#if modalEditing}
					<div class="mb-3 grid grid-cols-6 gap-1">
						{#each keypad as zone (zone.label)}
							<button
								class="tabular rounded py-2 text-sm font-bold"
								style={chipStyle(zone.label)}
								onclick={() => editModalShot(zone)}
							>
								{zone.label}
							</button>
						{/each}
						<button
							class="rounded border border-line py-2 text-sm font-bold"
							onclick={() => editModalShot(missZone(scoreSet))}
						>
							{$t('score.miss')}
						</button>
					</div>
				{:else}
					<dl class="mb-3 flex justify-between text-sm">
						<div>
							<dt class="text-muted">{$t('score.endTotalLong')}</dt>
							<dd class="tabular text-xl font-bold">{openRow.subtotal}</dd>
						</div>
						<div class="text-right">
							<dt class="text-muted">{$t('score.runningTotalLong')}</dt>
							<dd class="tabular text-xl font-bold">{runningTotals[openEnd ?? 0]}</dd>
						</div>
					</dl>
				{/if}

				{#if openRowShots.length > 0}
					<div class="mx-auto aspect-square w-full max-w-64 rounded-xl border border-line p-2">
						<!-- Only this end's arrows, with their centre and spread on by default. -->
						<TargetFace
							{scoreSet}
							shots={openRowShots}
							showCentreToggle
							showCentreDefault
							showPerimeter
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
