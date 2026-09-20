<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { listRunWorkouts, saveRunWorkout } from '$lib/db/repository';
	import { WORKOUT_LIMITS, type RunWorkout } from '$lib/domain/run/workout';
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
	/**
	 * The name is the title, edited where it is read, as a session's is. A field of its own said the
	 * same thing a second time and cost a line of a screen that is nothing but blocks.
	 */
	let renaming = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);

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

	async function startRename() {
		renaming = true;
		await tick();
		nameInput?.select();
	}

	async function saveName(name: string) {
		renaming = false;
		if (!workout) return;
		await edit({ ...workout, name: name.trim().slice(0, WORKOUT_LIMITS.name.max) });
	}
</script>

<PageHeader motif="sessions">
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
		{#if renaming}
			<input
				bind:this={nameInput}
				class="mt-1 w-full rounded-lg border-2 border-brand bg-surface px-3 py-2 text-2xl font-bold tracking-tight text-ink outline-none"
				type="text"
				maxlength={WORKOUT_LIMITS.name.max}
				value={workout?.name ?? ''}
				placeholder={$t('workouts.namePlaceholder')}
				onblur={(event) => saveName(event.currentTarget.value)}
				onkeydown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
					if (event.key === 'Escape') renaming = false;
				}}
			/>
		{:else}
			<button
				class="-mx-1 mt-1 rounded-lg px-1 text-left text-2xl font-bold tracking-tight
					{workout?.name ? 'text-ink' : 'text-muted'}"
				onclick={startRename}
			>
				{workout?.name || $t('workouts.namePlaceholder')}
			</button>
		{/if}
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page p-4">
	{#if workout}
		<WorkoutEditor {workout} onchange={edit} />
	{:else}
		<PageSkeleton />
	{/if}
</div>
