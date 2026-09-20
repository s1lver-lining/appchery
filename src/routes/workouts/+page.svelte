<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { deleteRunWorkout, listRunWorkouts, saveRunWorkout } from '$lib/db/repository';
	import {
		duplicateWorkout,
		emptyWorkout,
		flatten,
		type RunWorkout
	} from '$lib/domain/run/workout';
	import { STARTERS, starterWorkout, type StarterKey } from '$lib/domain/run/starters';
	import { workoutSummary } from '$lib/ui/run/summary';
	import { originOf, setPageUp, withOrigin } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import WorkoutBands from '$lib/ui/run/WorkoutBands.svelte';

	/**
	 * The programmes, kept apart from any one run: a Tuesday interval session is written once and run
	 * every Tuesday, and a copy per run would leave the archer editing history to change next week.
	 */
	const origin = $derived(originOf($page.url, '/sessions'));
	$effect(() => setPageUp(origin));
	/** Where this list itself is, so an editor opened from it comes back here and not one step further. */
	const here = $derived(withOrigin('/workouts', origin));

	let workouts = $state<RunWorkout[]>([]);
	let deleting = $state<RunWorkout | null>(null);

	async function refresh() {
		workouts = await listRunWorkouts();
	}
	$effect(() => {
		refresh();
	});

	async function add() {
		const workout = emptyWorkout($t('workouts.newWorkout'));
		await saveRunWorkout(workout);
		goto(withOrigin(`/workouts/${workout.id}`, here));
	}

	async function duplicate(workout: RunWorkout) {
		await saveRunWorkout(duplicateWorkout(workout, `${workout.name} ✱`));
		await refresh();
	}

	async function remove(workout: RunWorkout) {
		deleting = null;
		await deleteRunWorkout(workout.id);
		await refresh();
	}

	const summary = (workout: RunWorkout) => workoutSummary(workout, $t);

	/**
	 * One of the four to start from. Copied in as the archer's own, so the next thing they do is
	 * edit it into whatever their coach actually said rather than run somebody else's session.
	 */
	async function startFrom(key: StarterKey) {
		const workout = starterWorkout(key, $t(`workouts.starters.${key}.name`));
		await saveRunWorkout(workout);
		goto(withOrigin(`/workouts/${workout.id}`, here));
	}
</script>

<PageHeader motif="sessions" title={$t('workouts.title')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-2 p-4">
	{#if workouts.length === 0}
		<div class="rounded-2xl border border-line bg-surface p-6 text-center">
			<p class="font-semibold">{$t('workouts.empty')}</p>
			<p class="mt-1 text-sm text-muted">{$t('workouts.emptyHint')}</p>
		</div>

		<!--
			Four to start from, because an empty library is a blank page and nobody writes their first
			interval session into one. Each is a copy from the moment it is taken.
		-->
		<p class="pt-2 text-sm font-semibold text-muted">{$t('workouts.startFrom')}</p>
		{#each STARTERS as key (key)}
			{@const starter = starterWorkout(key, $t(`workouts.starters.${key}.name`))}
			<button
				class="press flex w-full items-center gap-2 rounded-xl border border-line bg-surface p-3 text-left"
				onclick={() => startFrom(key)}
			>
				<span class="min-w-0 flex-1">
					<span class="block truncate font-semibold">{$t(`workouts.starters.${key}.name`)}</span>
					<span class="block truncate text-xs text-muted">
						{$t(`workouts.starters.${key}.hint`)}
					</span>
					<WorkoutBands workout={starter} />
				</span>
				<span class="shrink-0 text-muted"><Icon name="plus" size={18} /></span>
			</button>
		{/each}
	{:else}
		{#each workouts as workout (workout.id)}
			<div class="flex items-center gap-2 rounded-xl border border-line bg-surface p-3">
				<a href={withOrigin(`/workouts/${workout.id}`, here)} class="press min-w-0 flex-1">
					<p class="truncate font-semibold">{workout.name || $t('workouts.newWorkout')}</p>
					<p class="text-xs text-muted tabular">
						{$t('workouts.blocks', { n: flatten(workout).length })} · {summary(workout)}
					</p>
					<!-- The shape of the session, which is how one is picked out of a list of them. -->
					<WorkoutBands {workout} />
				</a>
				<button
					class="press rounded-lg border border-line p-2 text-muted"
					aria-label={$t('workouts.duplicate')}
					onclick={() => duplicate(workout)}
				>
					<Icon name="copy" size={16} />
				</button>
				<button
					class="press rounded-lg border border-line p-2 text-muted"
					aria-label={$t('common.delete')}
					onclick={() => (deleting = workout)}
				>
					<Icon name="trash" size={16} />
				</button>
			</div>
		{/each}
	{/if}

	<button
		class="press w-full rounded-xl border border-line bg-surface py-3 font-semibold"
		onclick={add}
	>
		<span class="mr-1 inline-block align-[-2px]"><Icon name="plus" size={16} /></span>
		{$t('workouts.create')}
	</button>
</div>

{#if deleting}
	{@const going = deleting}
	<ConfirmDialog
		title={$t('workouts.deleteTitle')}
		message={$t('workouts.deleteBody')}
		onconfirm={() => remove(going)}
		oncancel={() => (deleting = null)}
	/>
{/if}
