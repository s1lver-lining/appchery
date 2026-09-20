<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { listRunWorkouts, saveRunWorkout } from '$lib/db/repository';
	import type { RunWorkout } from '$lib/domain/run/workout';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import PageSkeleton from '$lib/ui/PageSkeleton.svelte';
	import WorkoutEditor from '$lib/ui/run/WorkoutEditor.svelte';

	/** Saved as it is edited, like everything else in the app: there is no draft of a programme. */
	const id = $derived($page.params.id);
	// Opened from a run as often as from the list, and the way back is wherever it was opened from.
	const origin = $derived(originOf($page.url, '/workouts'));
	$effect(() => setPageUp(origin));

	let workout = $state<RunWorkout | null>(null);

	$effect(() => {
		const wanted = id;
		listRunWorkouts().then((all) => {
			workout = all.find((one) => one.id === wanted) ?? null;
		});
	});

	async function edit(next: RunWorkout) {
		workout = next;
		await saveRunWorkout(next);
	}
</script>

<PageHeader motif="sessions" title={workout?.name || $t('workouts.title')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page p-4">
	{#if workout}
		<WorkoutEditor {workout} onchange={edit} />
	{:else}
		<PageSkeleton />
	{/if}
</div>
