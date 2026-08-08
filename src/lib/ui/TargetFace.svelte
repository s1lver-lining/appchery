<script lang="ts">
	import type { ScoreSet, Shot } from '$lib/domain/rounds/types';

	/**
	 * Renders a target face from a ScoreSet's zone geometry — the same geometry
	 * that scores a tap. Because both read one definition, what is drawn and what
	 * is scored cannot disagree.
	 *
	 * The face is drawn in normalised coordinates via a -1..1 viewBox, so it is
	 * resolution-independent and identical for a 40cm or 122cm face.
	 */
	let {
		scoreSet,
		shots = [],
		interactive = false,
		onplot
	}: {
		scoreSet: ScoreSet;
		shots?: Shot[];
		interactive?: boolean;
		onplot?: (x: number, y: number) => void;
	} = $props();

	// Outermost first so inner rings paint over them. The miss zone has no
	// geometry to draw.
	const rings = $derived(
		scoreSet.zones.filter(
			(z) => z.countsAsHit && z.shape.kind === 'circle' && Number.isFinite(z.shape.r)
		)
	);

	let svg: SVGSVGElement;

	function handleClick(event: MouseEvent) {
		if (!interactive || !onplot) return;
		const rect = svg.getBoundingClientRect();
		// Map viewport pixels back into the -1..1 face space.
		const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
		if (Math.hypot(x, y) > 1.15) return; // Well outside the face: ignore stray taps.
		onplot(x, y);
	}
</script>

<svg
	bind:this={svg}
	viewBox="-1.05 -1.05 2.1 2.1"
	class="h-full w-full {interactive ? 'cursor-crosshair' : ''}"
	aria-label="Target face"
	onclick={handleClick}
	{...interactive ? { role: 'button', tabindex: 0 } : { role: 'img' }}
>
	{#each rings as zone (zone.label)}
		{#if zone.shape.kind === 'circle'}
			<circle
				cx={zone.shape.cx ?? 0}
				cy={zone.shape.cy ?? 0}
				r={zone.shape.r}
				fill={zone.color}
				stroke={zone.strokeColor}
				stroke-width="0.005"
			/>
		{/if}
	{/each}

	{#each shots as shot, i (i)}
		{#if shot.x !== null && shot.y !== null}
			<circle
				cx={shot.x}
				cy={shot.y}
				r="0.035"
				fill="#22c55e"
				stroke="#052e16"
				stroke-width="0.012"
			/>
		{/if}
	{/each}
</svg>
