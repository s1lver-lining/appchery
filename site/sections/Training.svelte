<script lang="ts">
	import { t } from '$lib/i18n';
	import { defaultBoard } from '$lib/domain/exercises';
	import MovementFigure from '$lib/ui/MovementFigure.svelte';
	import MuscleMap from '$lib/ui/MuscleMap.svelte';
	import Feature from '../lib/Feature.svelte';
	import { SAMPLE_EXERCISE } from '../lib/sample';

	const board = defaultBoard(SAMPLE_EXERCISE);
	const view = board === 'front' ? 'front' : 'back';
</script>

<Feature
	title={$t('site.training.title')}
	body={$t('site.training.body')}
	note={$t('site.training.note')}
	tone="surface"
>
	{#snippet visual()}
		<div class="mx-auto max-w-md rounded-3xl border border-line bg-bg p-5 shadow-sm">
			<h3 class="text-lg font-black">{$t(`exercises.item.${SAMPLE_EXERCISE.key}.name`)}</h3>
			<p class="mt-1 text-sm text-muted">{$t(`exercises.item.${SAMPLE_EXERCISE.key}.summary`)}</p>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div class="rounded-2xl bg-surface p-2">
					<MovementFigure movement={SAMPLE_EXERCISE.movement} class="max-h-56 w-full" />
				</div>
				<div class="rounded-2xl bg-surface p-2">
					<MuscleMap {view} load={SAMPLE_EXERCISE.load} class="max-h-56 w-full" />
				</div>
			</div>

			<dl class="mt-4 flex gap-2 text-center text-sm">
				{#each [[$t('exercises.kit.band'), $t(`exercises.kit.${SAMPLE_EXERCISE.kit}`)], [$t('exercises.measure.reps'), `${SAMPLE_EXERCISE.defaults.sets} × ${SAMPLE_EXERCISE.defaults.reps}`]] as [label, value] (label)}
					<div class="flex-1 rounded-xl bg-sunk px-2 py-2">
						<dt class="text-xs text-muted">{label}</dt>
						<dd class="font-semibold">{value}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/snippet}
</Feature>
