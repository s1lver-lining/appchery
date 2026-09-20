<script lang="ts">
	import { t } from '$lib/i18n';
	import { pace, clock, validateRun, type RunRecord } from '$lib/domain/running';
	import TimePicker from './TimePicker.svelte';
	import DistanceField from './DistanceField.svelte';

	/**
	 * The two numbers, typed. A watch, a treadmill and a friend's phone all know them already, so this
	 * stays the way in whenever the satellites are not worth waiting for, and the way to put a tracked
	 * run right when the receiver spent the first kilometre under a bridge.
	 */
	let { run, onchange }: { run: RunRecord; onchange: (run: RunRecord) => void } = $props();

	const errors = $derived(validateRun(run));
	const perKm = $derived(pace(run));
</script>

<div class="grid gap-3 sm:grid-cols-2">
	<DistanceField
		metres={run.distanceM}
		label={$t('running.distance')}
		invalid={errors.includes('distance')}
		onchange={(metres) => onchange({ ...run, distanceM: metres })}
	/>
	<TimePicker
		seconds={run.durationSeconds ?? 0}
		label={$t('running.duration')}
		onchange={(seconds) => onchange({ ...run, durationSeconds: seconds === 0 ? null : seconds })}
	/>
</div>

{#if errors.length > 0}
	<p class="mt-2 text-xs text-danger">{$t('running.outOfRange')}</p>
{/if}

{#if perKm !== null}
	<p class="mt-3 text-sm text-muted tabular">
		{$t('running.pace')}
		<span class="ml-1 text-lg font-bold text-ink">{clock(perKm)}</span>
		{$t('running.perKm')}
	</p>
{/if}
