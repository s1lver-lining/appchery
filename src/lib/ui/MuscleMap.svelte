<script lang="ts">
	import { t } from '$lib/i18n';
	import {
		MUSCLES,
		loadAt,
		type Load,
		type LoadMap,
		type MuscleId,
		type MuscleView,
		type ShotPhase
	} from '$lib/domain/muscles';
	import {
		BACK,
		BODY,
		EXTENSOR_TENDONS,
		FLEXOR_TENDONS,
		FRONT,
		HAND_LINES,
		PALM,
		THENAR,
		mirror,
		smooth
	} from './muscleMap';

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
		load = null,
		class: className = 'w-full',
		onpick
	}: {
		view?: MuscleView;
		selected?: MuscleId[];
		/** When set, every muscle is shaded by how hard this moment of the shot works it. */
		phase?: ShotPhase | null;
		/** Shading read from a load map instead of a phase, for whatever else works the same muscles. */
		load?: LoadMap | null;
		class?: string;
		onpick?: (id: MuscleId) => void;
	} = $props();

	/** One shading rule whatever asked for it, so a phase and an exercise never read differently. */
	const worked = $derived((id: MuscleId): 0 | Load => (load ? (load[id] ?? 0) : phase ? loadAt(phase, id) : 0));
	const shaded = $derived(Boolean(load ?? phase));

	const regions = $derived(view === 'front' ? FRONT : view === 'back' ? BACK : []);

	/**
	 * The tendons in the hand. On the front they belong to the finger flexors, which are what a
	 * string hangs from; on the back to the extensors, which open a hand and take no part in a shot.
	 * They light with their muscle, so the release reads as the flexors going quiet rather than as
	 * anything on the back of the arm switching on.
	 */
	const tendons = $derived(view === 'front' ? FLEXOR_TENDONS : EXTENSOR_TENDONS);
	const tendonOwner = $derived<MuscleId>(
		view === 'front' ? 'fingerFlexors' : 'forearmExtensors'
	);
	const handLabel = $derived($t(`muscles.name.${tendonOwner}`));
	/** Mirroring a path is a flip about the midline, which SVG can do without rewriting the numbers. */
	const FLIP = 'translate(200 0) scale(-1 1)';

	/**
	 * How hard a muscle works is one quantity, so it is shown as one colour getting stronger rather
	 * than as three colours the eye has to look up. The only hue change is the fault muscles: an
	 * upper trapezius doing work is not the same news as a rhomboid doing work.
	 */
	function fill(id: MuscleId): string {
		if (selected.includes(id)) return 'var(--c-brand)';
		if (!shaded || worked(id) === 0) return 'var(--c-sunk)';
		const fault = MUSCLES.find((entry) => entry.id === id)?.role === 'fault';
		return fault ? 'var(--c-danger)' : 'var(--c-accent)';
	}

	function opacity(id: MuscleId): number {
		if (selected.includes(id)) return 0.9;
		if (!shaded) return 1;
		return [1, 0.3, 0.6, 1][worked(id)];
	}
</script>

<svg viewBox="0 0 200 398" class={className} role="group" aria-label={$t(`muscles.view.${view}`)}>
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
					d={smooth(half, region.corners)}
					fill={fill(region.id)}
					fill-opacity={opacity(region.id)}
					stroke={selected.includes(region.id) ? 'var(--c-brand)' : 'var(--c-muted)'}
					stroke-opacity={selected.includes(region.id) ? 1 : 0.45}
					stroke-width={selected.includes(region.id) ? 1.4 : 0.9}
					class="transition-[fill,fill-opacity] duration-300"
				/>
			{/each}
		</g>
	{/each}

	<!--
		The hand. It is shaded and shaped like the muscles around it, so it has to answer to a tap like
		one: the pad at the base of the thumb and the tendons crossing the palm belong to the muscle
		that works the fingers, and picking either of them picks that muscle.
	-->
	<g
		role="checkbox"
		tabindex="0"
		aria-checked={selected.includes(tendonOwner)}
		aria-label={handLabel}
		class="cursor-pointer outline-none"
		onclick={() => onpick?.(tendonOwner)}
		onkeydown={(event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				onpick?.(tendonOwner);
			}
		}}
	>
		<title>{handLabel}</title>
		{#each [null, FLIP] as flip (flip)}
			<!-- The palm itself, invisible but there to be hit: tendons are too thin to aim a thumb at. -->
			<path d={smooth(PALM)} transform={flip} fill="transparent" stroke="none" />
			{#if view === 'front'}
				<path
					d={smooth(THENAR)}
					transform={flip}
					fill={fill(tendonOwner)}
					fill-opacity={shaded ? opacity(tendonOwner) : 1}
					stroke="var(--c-muted)"
					stroke-opacity="0.45"
					stroke-width="0.9"
					class="transition-[fill,fill-opacity] duration-300"
				/>
			{/if}
			<g
				stroke={fill(tendonOwner)}
				stroke-opacity={shaded ? opacity(tendonOwner) : 0.55}
				stroke-width="1.1"
				fill="none"
				stroke-linecap="round"
				class="transition-[stroke,stroke-opacity] duration-300"
			>
				{#each tendons as tendon (tendon)}
					<path d={tendon} transform={flip} />
				{/each}
			</g>
		{/each}
	</g>

	<!-- What makes a hand read as a hand: the wrist crease, the knuckles, and the fingers. -->
	<g stroke="var(--c-line)" stroke-width="0.8" fill="none" stroke-linecap="round">
		{#each [null, FLIP] as flip (flip)}
			{#each HAND_LINES as line (line)}
				<path d={line} transform={flip} />
			{/each}
		{/each}
	</g>
</svg>
