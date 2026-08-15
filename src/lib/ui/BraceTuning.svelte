<script lang="ts">
	import { t } from '$lib/i18n';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import { scoreAt } from '$lib/domain/rounds/geometry';
	import { bracePoints, tightestBrace, type BraceGroup } from '$lib/domain/tuning/brace';
	import {
		loadSheet,
		recordEnd,
		deleteEnd,
		shotFromPlot,
		updateActivity,
		type ActivityRow,
		type EndRow,
		type ShotRow
	} from '$lib/db/repository';
	import type { Shot } from '$lib/domain/rounds/types';
	import BraceCurves from './BraceCurves.svelte';
	import Icon from './Icon.svelte';
	import TargetFace from './TargetFace.svelte';
	import { ownsStatusBar } from './statusBar';
	import { lockScroll } from './scrollLock';

	/**
	 * Brace height tuning as the archer actually does it: pick a height, shoot ends at it, twist the
	 * string, shoot again. The activity holds the heights tried and the arrows shot at each, and the
	 * answer comes out of the two curves rather than out of anything typed.
	 *
	 * The heights live in the activity's own record rather than on the ends, because a height being
	 * tried is a real state of the test before a single arrow has been shot at it.
	 */
	let { activity, onchange }: { activity: ActivityRow; onchange: () => void } = $props();

	interface Measurements {
		/** Face diameter in centimetres, which is what turns a plot into a distance on the boss. */
		faceCm: number;
		/** Heights tried, in millimetres, in the order they were added. */
		braces: number[];
	}

	const FACE_SIZES = [40, 60, 80, 122];
	const scoreSet = getScoreSet('wa-10-ring');

	const stored = $derived<Measurements>({
		faceCm: 40,
		braces: [],
		...(activity.measurements ? (JSON.parse(activity.measurements) as Partial<Measurements>) : {})
	});

	let sheet = $state<{ ends: EndRow[]; shotsByEnd: Map<string, ShotRow[]> }>({
		ends: [],
		shotsByEnd: new Map()
	});
	/** The height an end is being plotted for, in millimetres, and the arrows placed so far. */
	let plotting = $state<{ braceMm: number; shots: Omit<Shot, 'ordinal'>[] } | null>(null);
	let adding = $state(false);
	/** A number input binds a number, and an empty field binds null, so the value is not a string. */
	let newBrace = $state<number | null>(null);

	async function reload() {
		sheet = await loadSheet(activity.id);
	}
	$effect(() => {
		void activity.id;
		reload();
	});

	/** Every height tried, with the ends shot at it: the ones with no arrows yet included. */
	const groups = $derived<BraceGroup[]>(
		stored.braces.map((braceMm) => ({
			braceMm,
			ends: sheet.ends
				.filter((end) => end.settingValue === braceMm)
				.map((end) => ({ id: end.id, shots: (sheet.shotsByEnd.get(end.id) ?? []) as Shot[] }))
		}))
	);
	const points = $derived(bracePoints(groups, stored.faceCm));
	const best = $derived(tightestBrace(points));
	const sorted = $derived([...groups].sort((a, b) => a.braceMm - b.braceMm));

	async function save(next: Partial<Measurements>) {
		await updateActivity(activity.id, {
			measurements: JSON.stringify({ ...stored, ...next })
		});
		onchange();
	}

	async function addBrace() {
		const cm = Number(newBrace);
		if (!Number.isFinite(cm) || cm <= 0) return;
		const mm = Math.round(cm * 10);
		if (!stored.braces.includes(mm)) await save({ braces: [...stored.braces, mm] });
		newBrace = null;
		adding = false;
	}

	/** Removing a height takes its ends with it: they measured a setting that is no longer in the test. */
	async function removeBrace(braceMm: number) {
		for (const end of sheet.ends.filter((row) => row.settingValue === braceMm))
			await deleteEnd(activity.id, end.id);
		await save({ braces: stored.braces.filter((value) => value !== braceMm) });
		await reload();
	}

	function plot(x: number, y: number) {
		if (!plotting) return;
		plotting = {
			...plotting,
			shots: [...plotting.shots, shotFromPlot(scoreAt(scoreSet, x, y), x, y)]
		};
	}

	async function commit() {
		if (!plotting || plotting.shots.length === 0) return (plotting = null);
		const endNo = sheet.ends.length + 1;
		await recordEnd(activity.id, 0, endNo, plotting.shots, null, plotting.braceMm);
		plotting = null;
		await reload();
		onchange();
	}

	async function dropEnd(endId: string) {
		await deleteEnd(activity.id, endId);
		await reload();
		onchange();
	}

	const stats = $derived((braceMm: number) => points.find((p) => p.braceCm === braceMm / 10));
	const signed = (cm: number) => `${cm >= 0 ? '+' : '−'}${Math.abs(cm).toFixed(1)}`;
</script>

<section class="space-y-4 rounded-xl border border-line bg-surface p-4">
	<header class="flex items-start justify-between gap-3">
		<div>
			<h2 class="text-sm font-semibold">{$t('brace.title')}</h2>
			<p class="mt-0.5 text-xs text-muted">{$t('brace.hint')}</p>
		</div>
	</header>

	<!-- The face is what turns a plot into centimetres, so it is asked once and then left alone. -->
	<div class="flex items-center gap-2 text-xs">
		<span class="text-muted">{$t('brace.face')}</span>
		<div class="flex overflow-hidden rounded-full border border-line">
			{#each FACE_SIZES as size (size)}
				<button
					type="button"
					class="px-2.5 py-1 font-semibold {stored.faceCm === size
						? 'bg-brand text-brand-ink'
						: 'text-muted'}"
					onclick={() => save({ faceCm: size })}
				>
					{size}
				</button>
			{/each}
		</div>
	</div>

	<div class="space-y-2">
		{#each sorted as group (group.braceMm)}
			{@const point = stats(group.braceMm)}
			<div class="rounded-xl border border-line bg-bg p-3">
				<div class="flex items-center justify-between gap-3">
					<span class="tabular text-base font-bold">
						{(group.braceMm / 10).toFixed(1)}
						<span class="text-xs font-medium text-muted">cm</span>
					</span>
					<div class="flex items-center gap-2">
						{#if best && point && point.braceCm === best.braceCm && points.length > 1}
							<span
								class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
								style="background: color-mix(in srgb, var(--c-band-good) 18%, transparent); color: var(--c-band-good)"
							>
								{$t('brace.tightest')}
							</span>
						{/if}
						<button
							class="text-muted"
							aria-label={$t('common.delete')}
							onclick={() => removeBrace(group.braceMm)}
						>
							<Icon name="trash" size={16} />
						</button>
					</div>
				</div>

				{#if point}
					<div class="tabular mt-1 flex gap-4 text-xs text-muted">
						<span>{$t('brace.centre')} <strong class="text-ink">{signed(point.centreCm)} cm</strong></span>
						<span>{$t('brace.spread')} <strong class="text-ink">{point.spreadCm.toFixed(1)} cm</strong></span>
						<span>{$t('brace.arrows', { n: point.arrows })}</span>
					</div>
				{/if}

				<div class="mt-2 flex flex-wrap items-center gap-1.5">
					{#each group.ends as end, i (end.id)}
						<button
							class="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs"
							onclick={() => dropEnd(end.id)}
						>
							{$t('brace.end', { n: i + 1, arrows: end.shots.length })}
							<Icon name="close" size={12} />
						</button>
					{/each}
					<button
						class="rounded-full border border-dashed border-brand/60 px-2.5 py-1 text-xs font-semibold text-brand-text"
						onclick={() => (plotting = { braceMm: group.braceMm, shots: [] })}
					>
						{$t('brace.addEnd')}
					</button>
				</div>
			</div>
		{/each}

		{#if adding}
			<div class="flex items-center gap-2 rounded-xl border border-brand/60 bg-bg p-3">
				<input
					type="number"
					inputmode="decimal"
					step="0.1"
					class="tabular w-full rounded-lg border border-line bg-bg p-2 text-ink"
					placeholder={$t('brace.newPlaceholder')}
					bind:value={newBrace}
					onkeydown={(e) => e.key === 'Enter' && addBrace()}
				/>
				<button class="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-ink" onclick={addBrace}>
					{$t('common.save')}
				</button>
			</div>
		{:else}
			<button
				class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-brand-text"
				onclick={() => (adding = true)}
			>
				<Icon name="plus" size={16} />
				{$t('brace.addBrace')}
			</button>
		{/if}
	</div>

	<BraceCurves {points} />
</section>

{#if plotting}
	<div class="fixed inset-0 z-50 flex flex-col bg-bg" use:ownsStatusBar use:lockScroll>
		<header class="safe-top flex items-center gap-2 border-b border-line px-4 py-3 pt-6">
			<h2 class="min-w-0 flex-1 truncate text-lg font-bold">
				{$t('brace.plotTitle', { brace: (plotting.braceMm / 10).toFixed(1) })}
			</h2>
			<button class="text-muted" aria-label={$t('common.close')} onclick={() => (plotting = null)}>
				<Icon name="close" size={22} />
			</button>
		</header>

		<div class="mx-auto w-full max-w-md flex-1 space-y-3 overflow-y-auto p-4">
			<!-- Capped rather than filling: the face is square, and a tall phone would push the
				buttons that finish the end off the bottom of the screen. -->
			<div class="mx-auto w-full max-w-[min(80vw,22rem)]">
				<TargetFace
					{scoreSet}
					shots={plotting.shots.map((shot, index) => ({ ...shot, ordinal: index + 1 }))}
					interactive
					showPerimeter
					showCentreToggle
					onplot={plot}
				/>
			</div>
			<p class="text-center text-xs text-muted">{$t('brace.plotHint')}</p>

			<div class="flex gap-2">
				<button
					class="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold disabled:opacity-40"
					disabled={plotting.shots.length === 0}
					onclick={() =>
						plotting && (plotting = { ...plotting, shots: plotting.shots.slice(0, -1) })}
				>
					{$t('brace.undoArrow')}
				</button>
				<button
					class="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-40"
					disabled={plotting.shots.length === 0}
					onclick={commit}
				>
					{$t('brace.saveEnd')}
				</button>
			</div>
		</div>
	</div>
{/if}
