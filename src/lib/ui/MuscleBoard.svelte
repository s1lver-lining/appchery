<script lang="ts">
	import { t } from '$lib/i18n';
	import type { LoadMap, MuscleId, ShotPhase } from '$lib/domain/muscles';
	import MuscleMap from './MuscleMap.svelte';

	/**
	 * Both figures at once, back beside front. The shot works the two sides against each other — the
	 * back pulls while the front holds the bow out — so seeing them apart hides the half of the
	 * picture that makes the other half make sense. Narrow enough for a phone in one column, and it
	 * splits the moment there is room for two.
	 */
	let {
		selected = [],
		phase = null,
		load = null,
		class: className = 'w-full',
		onpick
	}: {
		selected?: MuscleId[];
		phase?: ShotPhase | null;
		load?: LoadMap | null;
		class?: string;
		onpick?: (id: MuscleId) => void;
	} = $props();
</script>

<div class="grid grid-cols-2 gap-2">
	{#each ['back', 'front'] as const as side (side)}
		<figure class="min-w-0">
			<MuscleMap view={side} {selected} {phase} {load} class={className} {onpick} />
			<figcaption class="mt-1 text-center text-[11px] text-muted">
				{$t(`muscles.view.${side}`)}
			</figcaption>
		</figure>
	{/each}
</div>
