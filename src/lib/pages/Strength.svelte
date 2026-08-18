<script lang="ts">
	import { t } from '$lib/i18n';
	import { tap } from '$lib/haptics';
	import {
		EXERCISES,
		KITS,
		byKit,
		exercise,
		primary,
		type Exercise,
		type ExerciseKit
	} from '$lib/domain/exercises';
	import {
		entryFor,
		isStrengthDone,
		nextSet,
		parseStrength,
		planLoad,
		restLeft,
		setsDone,
		setsPlanned,
		type StrengthPlan
	} from '$lib/domain/strength';
	import { clock } from '$lib/domain/running';
	import { updateStrengthPlan, type ActivityRow } from '$lib/db/repository';
	import type { Load, MuscleId } from '$lib/domain/muscles';
	import Icon from '$lib/ui/Icon.svelte';
	import MovementFigure from '$lib/ui/MovementFigure.svelte';
	import MuscleBoard from '$lib/ui/MuscleBoard.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { withOrigin } from '$lib/nav';

	/**
	 * A session of strength work, done set by set.
	 *
	 * The screen is built around the set the archer is on rather than around the plan, because that
	 * is what somebody standing in a doorway with a band actually needs: what to do next, how many
	 * are left, and how long to wait. Everything else is there to be corrected, not to be read.
	 */
	let { activity, onchange }: { activity: ActivityRow; onchange: () => void } = $props();

	let plan = $state<StrengthPlan>({ entries: [] });
	/** Read once per activity, not on every save: a reload mid session would undo what was just ticked. */
	let loadedFrom = $state<string | null>(null);
	$effect(() => {
		if (loadedFrom === activity.id) return;
		plan = parseStrength(activity.measurements);
		loadedFrom = activity.id;
	});

	let picking = $state(false);
	let kit = $state<ExerciseKit | null>(null);
	/** The exercise whose movement and muscles are open, or null. One at a time: it is a long page. */
	let showing = $state<string | null>(null);

	const done = $derived(setsDone(plan));
	const planned = $derived(setsPlanned(plan));
	const finished = $derived(isStrengthDone(plan));
	const upNext = $derived(nextSet(plan));
	const load = $derived(planLoad(plan) as Partial<Record<MuscleId, Load>>);

	/** Only strength exercises: a run is its own activity, not a set inside this one. */
	const offered = $derived(byKit(kit).filter((entry) => entry.activity === 'strength'));

	// A ticking clock rather than a stored one: the rest is worked out from the stamp on the last set.
	let now = $state(Date.now());
	$effect(() => {
		const tick = setInterval(() => (now = Date.now()), 500);
		return () => clearInterval(tick);
	});
	const resting = $derived(restLeft(plan, now));

	async function save() {
		await updateStrengthPlan(activity.id, plan);
		onchange();
	}

	function add(entry: Exercise) {
		plan = { entries: [...plan.entries, entryFor(entry)] };
		picking = false;
		save();
	}

	function remove(index: number) {
		plan = { entries: plan.entries.filter((_, i) => i !== index) };
		save();
	}

	/** Ticking is the whole interaction, so it is stamped, felt, and saved without a confirmation. */
	function tick(entryIndex: number, setIndex: number) {
		const set = plan.entries[entryIndex].sets[setIndex];
		set.doneAt = set.doneAt === null ? Date.now() : null;
		plan = { entries: [...plan.entries] };
		tap();
		save();
	}

	function addSet(index: number) {
		const entry = plan.entries[index];
		const last = entry.sets.at(-1);
		entry.sets = [...entry.sets, { reps: last?.reps ?? null, holdSeconds: last?.holdSeconds ?? null, doneAt: null }];
		plan = { entries: [...plan.entries] };
		save();
	}

	function dropSet(index: number) {
		const entry = plan.entries[index];
		if (entry.sets.length <= 1) return;
		entry.sets = entry.sets.slice(0, -1);
		plan = { entries: [...plan.entries] };
		save();
	}

	/** Editing one number edits every set of the exercise that has not been done yet. */
	function retarget(index: number, field: 'reps' | 'holdSeconds', value: number) {
		for (const set of plan.entries[index].sets) {
			if (set.doneAt === null) set[field] = value;
		}
		plan = { entries: [...plan.entries] };
		save();
	}

	const name = (key: string) => $t(`exercises.item.${key}.name`);
</script>

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<!-- What is left, and what to wait for: the two things asked of this page mid session. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold text-muted">{$t('strength.progress')}</h2>
				<p class="text-2xl font-bold tabular">
					{done}<span class="text-base font-medium text-muted">/{planned}</span>
					<span class="ml-1 text-sm font-medium text-muted">{$t('strength.sets')}</span>
				</p>
			</div>
			{#if finished}
				<span class="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent">
					<Icon name="check" size={16} />
					{$t('strength.finished')}
				</span>
			{:else if resting > 0}
				<!-- The rest, counted down from the set that was ticked: a slept phone wakes up rested. -->
				<span class="rounded-full bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-text tabular">
					{$t('strength.resting', { time: clock(resting) })}
				</span>
			{/if}
		</div>

		{#if planned > 0}
			<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-sunk">
				<div class="h-full rounded-full bg-brand transition-[width]" style="width: {(done / planned) * 100}%"></div>
			</div>
		{/if}

		{#if upNext}
			{@const entry = plan.entries[upNext.entry]}
			<p class="mt-3 text-sm text-muted">
				{$t('strength.upNext', {
					exercise: name(entry.exerciseKey),
					set: upNext.set + 1,
					of: entry.sets.length
				})}
			</p>
		{/if}
	</section>

	{#each plan.entries as entry, index (index)}
		{@const known = exercise(entry.exerciseKey)}
		<section class="rounded-2xl border border-line bg-surface p-4">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<h3 class="font-semibold">{name(entry.exerciseKey)}</h3>
					{#if known}
						<p class="text-xs text-muted">
							{$t(`exercises.kit.${known.kit}`)}
							·
							{$t(`exercises.measure.${known.measure}`)}
						</p>
					{/if}
				</div>
				<div class="flex shrink-0 items-center gap-1">
					{#if known}
						<button
							class="rounded-lg border border-line p-1.5 text-muted"
							aria-label={$t('exercises.movementTitle')}
							onclick={() => (showing = showing === entry.exerciseKey ? null : entry.exerciseKey)}
						>
							<Icon name="eye" size={16} />
						</button>
					{/if}
					<button
						class="rounded-lg border border-line p-1.5 text-muted"
						aria-label={$t('common.delete')}
						onclick={() => remove(index)}
					>
						<Icon name="trash" size={16} />
					</button>
				</div>
			</div>

			{#if known && showing === entry.exerciseKey}
				<div class="mt-3 grid gap-3 rounded-xl bg-sunk p-3 sm:grid-cols-2">
					<MovementFigure movement={known.movement} class="w-full max-h-[26vh]" />
					<div class="min-w-0 text-xs">
						<ol class="space-y-1">
							{#each Array.from({ length: known.steps }, (_, i) => i + 1) as step (step)}
								<li class="text-muted">{step}. {$t(`exercises.item.${entry.exerciseKey}.step${step}`)}</li>
							{/each}
						</ol>
						<a
							class="mt-2 inline-block font-medium text-brand-text"
							href={withOrigin(`/exercises/${entry.exerciseKey}`, `/activities/${activity.id}`)}
						>
							{$t('strength.openExercise')}
						</a>
					</div>
				</div>
			{/if}

			<!-- One number for the whole exercise: nobody sets a different target for set three. -->
			<div class="mt-3 flex flex-wrap items-center gap-2">
				{#if known?.measure === 'hold'}
					<label class="flex items-center gap-2 text-sm">
						<span class="text-muted">{$t('exercises.hold')}</span>
						<input
							class="w-20 rounded-lg border border-line bg-bg px-2 py-1 text-sm tabular"
							type="number"
							inputmode="numeric"
							min="1"
							max="600"
							value={entry.sets.find((set) => set.doneAt === null)?.holdSeconds ?? entry.sets[0].holdSeconds}
							onchange={(event) => retarget(index, 'holdSeconds', Number(event.currentTarget.value))}
						/>
						<span class="text-muted">{$t('strength.secondsShort')}</span>
					</label>
				{:else}
					<label class="flex items-center gap-2 text-sm">
						<span class="text-muted">{$t('exercises.reps')}</span>
						<input
							class="w-20 rounded-lg border border-line bg-bg px-2 py-1 text-sm tabular"
							type="number"
							inputmode="numeric"
							min="1"
							max="100"
							value={entry.sets.find((set) => set.doneAt === null)?.reps ?? entry.sets[0].reps}
							onchange={(event) => retarget(index, 'reps', Number(event.currentTarget.value))}
						/>
					</label>
				{/if}
			</div>

			<!-- A row of sets, tapped as they are done. Big enough to hit with a band still in hand. -->
			<div class="mt-3 flex flex-wrap gap-2">
				{#each entry.sets as set, setIndex (setIndex)}
					<button
						class="flex h-12 min-w-12 flex-col items-center justify-center rounded-xl border px-2 text-sm font-semibold tabular
							{set.doneAt !== null
							? 'border-brand bg-brand text-brand-ink'
							: upNext && upNext.entry === index && upNext.set === setIndex
								? 'border-brand bg-brand/10'
								: 'border-line'}"
						aria-pressed={set.doneAt !== null}
						aria-label={$t('strength.setNumber', { n: setIndex + 1 })}
						onclick={() => tick(index, setIndex)}
					>
						<span>{set.holdSeconds !== null ? `${set.holdSeconds}s` : set.reps}</span>
						<span class="text-[10px] font-medium opacity-70">{setIndex + 1}</span>
					</button>
				{/each}
				<div class="flex flex-col justify-center gap-1">
					<button
						class="rounded-lg border border-line px-2 py-0.5 text-xs text-muted"
						onclick={() => addSet(index)}
					>
						+
					</button>
					<button
						class="rounded-lg border border-line px-2 py-0.5 text-xs text-muted disabled:opacity-40"
						disabled={entry.sets.length <= 1}
						onclick={() => dropSet(index)}
					>
						−
					</button>
				</div>
			</div>
		</section>
	{/each}

	<button
		class="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface p-4 font-medium text-brand-text"
		onclick={() => (picking = true)}
	>
		<Icon name="plus" size={18} />
		{$t('strength.addExercise')}
	</button>

	<!-- What the session as a whole worked, once it is worth drawing: the reason for choosing these. -->
	{#if plan.entries.length > 0}
		<section class="rounded-2xl border border-line bg-surface p-4">
			<h2 class="mb-2 text-sm font-semibold text-muted">{$t('strength.worked')}</h2>
			<div class="mx-auto max-w-[16rem]">
				<MuscleBoard {load} class="max-h-[34vh] w-full" />
			</div>
		</section>
	{/if}
</div>

<Sheet open={picking} title={$t('strength.addExercise')} onclose={() => (picking = false)}>
	<div class="space-y-3">
		<div class="flex flex-wrap gap-1.5">
			<button
				class="rounded-full border px-3 py-1.5 text-sm {kit === null
					? 'border-brand bg-brand/10 font-semibold'
					: 'border-line'}"
				onclick={() => (kit = null)}
			>
				{$t('exercises.all')}
			</button>
			{#each KITS as entry (entry)}
				<button
					class="rounded-full border px-3 py-1.5 text-sm {kit === entry
						? 'border-brand bg-brand/10 font-semibold'
						: 'border-line'}"
					onclick={() => (kit = kit === entry ? null : entry)}
				>
					{$t(`exercises.kit.${entry}`)}
				</button>
			{/each}
		</div>

		<ul class="space-y-2">
			{#each offered as entry (entry.key)}
				<li>
					<button
						class="flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left"
						onclick={() => add(entry)}
					>
						<span class="min-w-0 flex-1">
							<span class="block font-medium">{name(entry.key)}</span>
							<span class="mt-0.5 block text-xs text-muted">
								{primary(entry)
									.map((id) => $t(`muscles.name.${id}`))
									.join(' · ')}
							</span>
						</span>
						<span class="shrink-0 text-xs text-muted">
							{entry.defaults.sets}×{entry.measure === 'hold'
								? `${entry.defaults.holdSeconds}s`
								: entry.defaults.reps}
						</span>
					</button>
				</li>
			{:else}
				<li class="text-sm text-muted">{$t('exercises.empty')}</li>
			{/each}
		</ul>
		{#if offered.length < EXERCISES.length}
			<p class="text-[11px] text-muted">{$t('strength.runningElsewhere')}</p>
		{/if}
	</div>
</Sheet>
