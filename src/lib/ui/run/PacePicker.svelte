<script lang="ts">
	import { t } from '$lib/i18n';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';
	import { formatPace } from '$lib/domain/run/workout';

	/**
	 * A pace, on one wheel in ten second steps. Two wheels were a drag each for a figure nobody sets
	 * to the second, and the first stop is "none", so a block with no target and a block at 3:40 are
	 * set the same way and neither needs a switch of its own.
	 */
	let {
		pace,
		onchange,
		label = null,
		item = 30
	}: {
		pace: number | null;
		onchange: (pace: number | null) => void;
		label?: string | null;
		item?: number;
	} = $props();

	const NONE = 0;
	/** Two and a half minutes to fifteen, which covers a sprint rep and a walk home. */
	const PACES = [NONE, ...Array.from({ length: 76 }, (_, i) => 150 + i * 10)];

	/** Snapped to the wheel's own steps, so a pace typed elsewhere still lands on a row. */
	const nearest = $derived(
		pace === null ? NONE : (PACES.find((value) => value >= pace - 5 && value !== NONE) ?? 900)
	);
</script>

<div>
	{#if label}<span class="text-sm text-muted">{label}</span>{/if}
	<WheelPicker
		values={PACES}
		value={nearest}
		{item}
		label={$t('workouts.targetPace')}
		labelHidden
		format={(value) => (value === NONE ? $t('workouts.noPace') : `${formatPace(value)} /km`)}
		onchange={(value) => onchange(value === NONE ? null : value)}
	/>
</div>
