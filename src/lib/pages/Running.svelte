<script lang="ts">
	import { t } from '$lib/i18n';
	import {
		EFFORTS,
		clock,
		isRunDone,
		pace,
		parseRun,
		validateRun,
		type Effort,
		type RunRecord
	} from '$lib/domain/running';
	import { exercise } from '$lib/domain/exercises';
	import { updateRun, type ActivityRow } from '$lib/db/repository';
	import type { Load, MuscleId } from '$lib/domain/muscles';
	import MovementFigure from '$lib/ui/MovementFigure.svelte';
	import MuscleBoard from '$lib/ui/MuscleBoard.svelte';

	/**
	 * A run, written down. Two numbers and how it felt, which is everything a run is worth keeping
	 * without a satellite: the pace falls out of the first two and is never entered, so the three
	 * figures on the card can never disagree with each other.
	 */
	let { activity, onchange }: { activity: ActivityRow; onchange: () => void } = $props();

	let run = $state<RunRecord>({ distanceM: null, durationSeconds: null, effort: null });
	let loadedFrom = $state<string | null>(null);
	$effect(() => {
		if (loadedFrom === activity.id) return;
		run = parseRun(activity.measurements);
		loadedFrom = activity.id;
	});

	/**
	 * Entered in kilometres, in minutes and in seconds, because that is how a watch reports a run and
	 * how a runner says it. Metres and seconds are what is stored, so the display can change without
	 * touching a record.
	 */
	const km = $derived(run.distanceM === null ? '' : String(Math.round(run.distanceM / 10) / 100));
	const minutes = $derived(
		run.durationSeconds === null ? '' : String(Math.floor(run.durationSeconds / 60))
	);
	const seconds = $derived(run.durationSeconds === null ? '' : String(run.durationSeconds % 60));

	const errors = $derived(validateRun(run));
	const perKm = $derived(pace(run));
	const running = $derived(exercise('running'));
	const load = $derived((running?.load ?? {}) as Partial<Record<MuscleId, Load>>);

	async function save() {
		if (errors.length > 0) return;
		await updateRun(activity.id, run);
		onchange();
	}

	function setDistance(value: string) {
		const parsed = Number(value.replace(',', '.'));
		run.distanceM = value.trim() === '' || !Number.isFinite(parsed) ? null : Math.round(parsed * 1000);
		save();
	}

	/** The two halves of a time are one number, so either being typed rebuilds the whole of it. */
	function setDuration(part: 'minutes' | 'seconds', value: string) {
		const current = run.durationSeconds ?? 0;
		const parsed = Math.max(0, Math.floor(Number(value) || 0));
		const next =
			part === 'minutes' ? parsed * 60 + (current % 60) : Math.floor(current / 60) * 60 + parsed;
		run.durationSeconds = next === 0 ? null : next;
		save();
	}
</script>

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<section class="rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-3 text-sm font-semibold text-muted">{$t('running.what')}</h2>

		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block">
				<span class="text-sm text-muted">{$t('running.distance')}</span>
				<div class="mt-1 flex items-center gap-2">
					<input
						class="w-full rounded-lg border bg-bg px-3 py-2 text-lg tabular {errors.includes('distance')
							? 'border-danger'
							: 'border-line'}"
						type="text"
						inputmode="decimal"
						placeholder="5"
						value={km}
						onchange={(event) => setDistance(event.currentTarget.value)}
					/>
					<span class="shrink-0 text-sm text-muted">{$t('running.km')}</span>
				</div>
			</label>

			<div>
				<span class="text-sm text-muted">{$t('running.duration')}</span>
				<div class="mt-1 flex items-center gap-2">
					<input
						class="w-full rounded-lg border bg-bg px-3 py-2 text-lg tabular {errors.includes('duration')
							? 'border-danger'
							: 'border-line'}"
						type="text"
						inputmode="numeric"
						placeholder="27"
						value={minutes}
						onchange={(event) => setDuration('minutes', event.currentTarget.value)}
					/>
					<span class="shrink-0 text-sm text-muted">{$t('running.minutesShort')}</span>
					<input
						class="w-full rounded-lg border border-line bg-bg px-3 py-2 text-lg tabular"
						type="text"
						inputmode="numeric"
						placeholder="30"
						value={seconds}
						onchange={(event) => setDuration('seconds', event.currentTarget.value)}
					/>
					<span class="shrink-0 text-sm text-muted">{$t('running.secondsShort')}</span>
				</div>
			</div>
		</div>

		{#if errors.length > 0}
			<p class="mt-2 text-xs text-danger">{$t('running.outOfRange')}</p>
		{/if}
	</section>

	<!-- Worked out rather than asked for, so the card can never hold a pace its own numbers deny. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.pace')}</h2>
		{#if perKm === null}
			<p class="text-sm text-muted">{$t('running.paceWaiting')}</p>
		{:else}
			<p class="text-3xl font-bold tabular">
				{clock(perKm)}
				<span class="text-base font-medium text-muted">{$t('running.perKm')}</span>
			</p>
		{/if}
	</section>

	<section class="rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.effort')}</h2>
		<p class="mb-3 text-xs text-muted">{$t('running.effortHint')}</p>
		<div class="flex gap-1">
			{#each EFFORTS as level (level)}
				<button
					class="press flex-1 rounded-lg border py-2 text-xs font-medium {run.effort === level
						? 'border-brand bg-brand/10 font-semibold'
						: 'border-line'}"
					onclick={() => {
						run.effort = run.effort === level ? null : (level as Effort);
						save();
					}}
				>
					{$t(`running.efforts.${level}`)}
				</button>
			{/each}
		</div>
	</section>

	<section class="rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.whatItWorks')}</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			{#if running}
				<MovementFigure movement={running.movement} class="w-full max-h-[26vh]" />
			{/if}
			<div class="mx-auto max-w-[13rem]">
				<MuscleBoard {load} class="max-h-[28vh] w-full" />
			</div>
		</div>
	</section>

	{#if !isRunDone(run)}
		<p class="text-center text-xs text-muted">{$t('running.unfinished')}</p>
	{/if}
</div>
