<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		defaultFreeScoreSetup,
		validateFreeScoreSetup,
		type FreeScoreSetup
	} from '$lib/domain/freeScore';
	import { FACE_SIZES, DISTANCES_M, DISTANCES_YD } from '$lib/domain/rounds/custom';
	import { createFreeScoreActivity } from '$lib/db/repository';
	import { setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';

	/**
	 * The custom round form with everything a round needs taken out of it. There are no ends here
	 * and no arrows per end, because the whole point of this kind of shooting is that nobody counted
	 * them that way: what is asked for is where it was shot, and the rest is entered as it happens.
	 */

	const sessionId = $derived($page.params.id as string);

	// Its route sits under the session, but the back key belongs to the activity picker it came from.
	$effect(() => setPageUp(`/sessions/${sessionId}`));

	let setup = $state<FreeScoreSetup>(defaultFreeScoreSetup());
	const errors = $derived(validateFreeScoreSetup(setup));
	const distances = $derived(setup.unit === 'm' ? DISTANCES_M : DISTANCES_YD);

	async function create() {
		if (errors.length > 0) return;
		goto(`/activities/${await createFreeScoreActivity(sessionId, setup)}`);
	}
</script>

<PageHeader motif="session">
	{#snippet lead()}
		<div class="flex items-center gap-2">
			<a href="/sessions/{sessionId}" class="-ml-1 text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
			<h1 class="truncate text-2xl font-bold tracking-tight">{$t('freeScore.title')}</h1>
		</div>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<section class="rounded-xl border border-line bg-surface p-4">
		<p class="text-sm text-muted">{$t('freeScore.setupHint')}</p>

		<div class="mt-3">
			<span class="text-sm text-muted">{$t('round.faceSize')}</span>
			<div class="mt-1 flex gap-2">
				{#each FACE_SIZES as size (size)}
					<button
						class="press flex-1 rounded-lg border py-2 text-sm font-medium
							{setup.faceSize === size ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
						onclick={() => (setup.faceSize = size)}
					>
						{size}
					</button>
				{/each}
			</div>
		</div>

		<div class="mt-3">
			<div class="mb-1 flex items-center justify-between">
				<span class="text-sm text-muted">{$t('round.distance')}</span>
				<div class="flex gap-1 rounded-lg bg-sunk p-0.5">
					{#each ['m', 'yd'] as const as unit (unit)}
						<button
							class="press rounded-md px-3 py-1 text-xs font-medium
								{setup.unit === unit ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
							onclick={() => {
								setup.unit = unit;
								const list = unit === 'm' ? DISTANCES_M : DISTANCES_YD;
								if (setup.distance !== null && !list.includes(setup.distance))
									setup.distance = list[0];
							}}
						>
							{unit}
						</button>
					{/each}
				</div>
			</div>
			<WheelPicker
				values={distances}
				value={setup.distance ?? distances[0]}
				label={$t('round.distance')}
				item={36}
				labelHidden
				format={(v) => `${v} ${setup.unit}`}
				onchange={(v) => (setup.distance = v)}
			/>
		</div>
	</section>
</div>

<div class="overbar sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<button
		class="press mx-auto flex w-full max-w-page items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-50"
		disabled={errors.length > 0}
		onclick={create}
	>
		<Icon name="plus" size={20} />
		{$t('freeScore.create')}
	</button>
</div>
