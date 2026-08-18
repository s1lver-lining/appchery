<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import MovementFigure from '$lib/ui/MovementFigure.svelte';
	import { SAMPLE_EXERCISE } from '../lib/sample';

	/**
	 * A strength session as the app works one: sets ticked off as they are done, the count and the
	 * bar following, and the movement playing beside them so there is no doubt what a set is.
	 */
	const REPS = 15;
	let done = $state([true, false, false]);

	const count = $derived(done.filter(Boolean).length);
	const finished = $derived(count === done.length);
	const next = $derived(done.indexOf(false));
</script>

<div class="space-y-2.5 p-3">
	<section class="rounded-xl border border-line bg-surface p-3">
		<div class="flex items-center justify-between gap-2">
			<div>
				<h2 class="text-[11px] font-semibold text-muted">{$t('strength.progress')}</h2>
				<p class="tabular text-xl font-bold">
					{count}<span class="text-sm font-medium text-muted">/{done.length}</span>
					<span class="ml-1 text-[11px] font-medium text-muted">{$t('strength.sets')}</span>
				</p>
			</div>
			{#if finished}
				<span
					class="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent"
				>
					<Icon name="check" size={14} />
					{$t('strength.finished')}
				</span>
			{/if}
		</div>
		<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk">
			<div
				class="h-full rounded-full bg-brand transition-[width]"
				style="width: {(count / done.length) * 100}%"
			></div>
		</div>
	</section>

	<section class="rounded-xl border border-line bg-surface p-3">
		<h3 class="font-semibold">{$t(`exercises.item.${SAMPLE_EXERCISE.key}.name`)}</h3>
		<div class="mt-1"><MovementFigure movement={SAMPLE_EXERCISE.movement} class="max-h-32 w-full" /></div>

		<!-- A row of sets, tapped as they are done, in the app's own shapes and colours. -->
		<div class="mt-2 flex gap-2">
			{#each done as ticked, i (i)}
				<button
					class="tabular flex h-11 min-w-11 flex-col items-center justify-center rounded-xl border px-2 text-sm font-semibold
						{ticked ? 'border-brand bg-brand text-brand-ink' : i === next ? 'border-brand bg-brand/10' : 'border-line'}"
					aria-pressed={ticked}
					aria-label={$t('strength.setNumber', { n: i + 1 })}
					onclick={() => (done = done.map((value, at) => (at === i ? !value : value)))}
				>
					<span>{REPS}</span>
					<span class="text-[10px] font-medium opacity-70">{i + 1}</span>
				</button>
			{/each}
		</div>
	</section>
</div>
