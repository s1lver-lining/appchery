<script lang="ts">
	import { flatten, type RunWorkout } from '$lib/domain/run/workout';
	import { blockColour } from './kinds';

	/**
	 * A programme as the bands it is made of, in the order they are run and as wide as they are long.
	 *
	 * A list of names and totals says what a programme comes to and nothing about what it is: warm
	 * up, seven hard and easy, way down reads off a strip of colour at a glance and off a sentence
	 * only after reading it. The colours are the four the blocks already wear everywhere else.
	 */
	let { workout }: { workout: RunWorkout } = $props();

	/**
	 * A block with no distance and no time of its own still has to be visible, so every band is
	 * given a floor. Which means the strip is the shape of the session rather than a measurement of
	 * it, which is all it is being read for.
	 */
	const bands = $derived.by(() => {
		const steps = flatten(workout);
		const sized = steps.map((step) => ({
			kind: step.kind,
			size:
				step.goal.type === 'distance'
					? step.goal.metres
					: step.goal.type === 'time'
						? // A minute of running is about two hundred metres, which is close enough to put a
							// timed block and a measured one on one strip.
							(step.goal.seconds / 60) * 200
						: 300
		}));
		const total = sized.reduce((sum, band) => sum + band.size, 0);
		if (total <= 0) return [];
		return sized.map((band) => ({ ...band, share: Math.max(2, (band.size / total) * 100) }));
	});
</script>

{#if bands.length > 0}
	<span class="mt-1.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full">
		{#each bands as band, i (i)}
			<span style="flex:{band.share};background:{blockColour(band.kind)}"></span>
		{/each}
	</span>
{/if}
