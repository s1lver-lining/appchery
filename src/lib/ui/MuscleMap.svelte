<script lang="ts">
	import { t } from '$lib/i18n';
	import {
		MUSCLES,
		loadAt,
		type Load,
		type MuscleId,
		type MuscleView,
		type ShotPhase
	} from '$lib/domain/muscles';
	import { BACK, BODY, FRONT, mirror, smooth } from './muscleMap';

	/**
	 * The archer's muscles, drawn to be pointed at. Every shape here was drawn for this app rather
	 * than traced from a chart, which is why it is a stylised body and not an anatomy plate: the job
	 * is to let a thumb pick the rhomboids on a phone, not to teach dissection.
	 *
	 * Two of the drawing's compromises are worth saying out loud. The muscles that lie on top of each
	 * other are laid out side by side instead, so the rhomboids sit next to the mid trapezius rather
	 * than beneath it and both can be tapped. And the muscles no silhouette can show at all are not
	 * on the figure: they are in the close ups, which is the only honest place to put them.
	 */
	let {
		view = 'back',
		selected = [],
		phase = null,
		onpick
	}: {
		view?: MuscleView;
		selected?: MuscleId[];
		/** When set, every muscle is shaded by how hard this moment of the shot works it. */
		phase?: ShotPhase | null;
		onpick?: (id: MuscleId) => void;
	} = $props();

	const regions = $derived(view === 'front' ? FRONT : view === 'back' ? BACK : []);


	/**
	 * How hard a muscle works is one quantity, so it is shown as one colour getting stronger rather
	 * than as three colours the eye has to look up. The only hue change is the fault muscles: an
	 * upper trapezius doing work is not the same news as a rhomboid doing work.
	 */
	function fill(id: MuscleId): string {
		if (selected.includes(id)) return 'var(--c-brand)';
		if (!phase || loadAt(phase, id) === 0) return 'var(--c-sunk)';
		const fault = MUSCLES.find((entry) => entry.id === id)?.role === 'fault';
		return fault ? 'var(--c-danger)' : 'var(--c-accent)';
	}

	function opacity(id: MuscleId): number {
		if (selected.includes(id)) return 0.9;
		if (!phase) return 1;
		const load: 0 | Load = loadAt(phase, id);
		return [1, 0.3, 0.6, 1][load];
	}
</script>

<svg viewBox="0 0 200 398" class="w-full" role="group" aria-label={$t(`muscles.view.${view}`)}>
	<!-- One body, arms included: a shoulder is not a seam between two drawings. -->
	<path d={BODY} fill="var(--c-surface)" stroke="var(--c-line)" stroke-width="1.4" />

	{#each regions as region (region.id)}
		{@const label = $t(`muscles.name.${region.id}`)}
		<g
			role="checkbox"
			tabindex="0"
			aria-checked={selected.includes(region.id)}
			aria-label={label}
			class="cursor-pointer outline-none"
			onclick={() => onpick?.(region.id)}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onpick?.(region.id);
				}
			}}
		>
			<title>{label}</title>
			{#each [region.points, mirror(region.points)] as half}
				<path
					d={smooth(half)}
					fill={fill(region.id)}
					fill-opacity={opacity(region.id)}
					stroke={selected.includes(region.id) ? 'var(--c-brand)' : 'var(--c-line)'}
					stroke-width={selected.includes(region.id) ? 1.4 : 0.7}
					class="transition-[fill,fill-opacity] duration-300"
				/>
			{/each}
		</g>
	{/each}
</svg>
