<script lang="ts">
	import type { ScoreSet, Shot } from '$lib/domain/rounds/types';
	import { groupMetrics, groupHull } from '$lib/domain/rounds/geometry';
	import Icon from './Icon.svelte';

	/**
	 * Renders a face from the same zone geometry that scores a tap, so what is drawn and what is
	 * scored cannot disagree. Coordinates are normalised, so one definition serves every face size.
	 */
	let {
		scoreSet,
		shots = [],
		otherShots = [],
		interactive = false,
		showOtherToggle = false,
		showOtherDefault = true,
		showCentreToggle = false,
		showCentreDefault = false,
		showPerimeter = false,
		onplot
	}: {
		scoreSet: ScoreSet;
		/** Arrows of the current context, drawn at full strength. */
		shots?: Shot[];
		/** Arrows from other ends, drawn faded so the current ones stay readable. */
		otherShots?: Shot[];
		interactive?: boolean;
		showOtherToggle?: boolean;
		showOtherDefault?: boolean;
		showCentreToggle?: boolean;
		showCentreDefault?: boolean;
		/** Outline around the group, which reads its spread faster than a radius figure. */
		showPerimeter?: boolean;
		onplot?: (x: number, y: number) => void;
	} = $props();

	// Initial value only: the toggle is the archer's from then on, not the caller's.
	// svelte-ignore state_referenced_locally
	let showOther = $state(showOtherDefault);
	// svelte-ignore state_referenced_locally
	let showCentre = $state(showCentreDefault);

	let svg = $state<SVGSVGElement | null>(null);
	/** Live position while dragging, which is what the magnifier follows. */
	let cursor = $state<{ x: number; y: number } | null>(null);

	const drawable = $derived(
		scoreSet.zones.filter(
			(z) => z.countsAsHit && (z.shape.kind !== 'circle' || Number.isFinite(z.shape.r))
		)
	);

	function polygonPoints(points: [number, number][]): string {
		return points.map(([x, y]) => `${x},${y}`).join(' ');
	}

	const visibleOther = $derived(showOther ? otherShots : []);
	const centre = $derived(showCentre ? groupMetrics([...otherShots, ...shots]) : null);
	const hull = $derived(showPerimeter ? groupHull(shots) : []);

	const ZOOM = 2.6;
	/** The plot sits above the touch point so a finger does not cover the arrow being placed. */
	const FINGER_OFFSET = 0.16;

	function toFace(event: PointerEvent): { x: number; y: number } | null {
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * 2.1 - 1.05;
		const y = ((event.clientY - rect.top) / rect.height) * 2.1 - 1.05 - FINGER_OFFSET;
		return { x, y };
	}

	function down(event: PointerEvent) {
		if (!interactive) return;
		(event.target as Element).setPointerCapture?.(event.pointerId);
		cursor = toFace(event);
	}

	function move(event: PointerEvent) {
		if (!interactive || !cursor) return;
		cursor = toFace(event);
	}

	/** Committing on release is what makes the drag useful: the archer can correct before letting go. */
	function up() {
		if (!interactive || !cursor) return;
		const { x, y } = cursor;
		cursor = null;
		if (Math.hypot(x, y) <= 1.15) onplot?.(x, y);
	}
</script>

<div class="relative h-full w-full">
	<svg
		bind:this={svg}
		viewBox="-1.05 -1.05 2.1 2.1"
		class="h-full w-full touch-none select-none {interactive ? 'cursor-crosshair' : ''}"
		aria-label="Target face"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={() => (cursor = null)}
		{...interactive ? { role: 'button', tabindex: 0 } : { role: 'img' }}
	>
		<defs>
			<clipPath id="face-clip">
				<circle cx="0" cy="0" r="1.04" />
			</clipPath>
		</defs>

		<g clip-path="url(#face-clip)">
			<!-- The whole face scales and translates under the magnifier, so rings stay aligned with arrows. -->
			<g
				transform={cursor
					? `translate(${-cursor.x * (ZOOM - 1)} ${-cursor.y * (ZOOM - 1)}) scale(${ZOOM})`
					: ''}
			>
				{#each drawable as zone (zone.label)}
					{#if zone.shape.kind === 'circle'}
						<circle
							cx={zone.shape.cx ?? 0}
							cy={zone.shape.cy ?? 0}
							r={zone.shape.r}
							fill={zone.color}
							stroke={zone.strokeColor}
							stroke-width={0.005 / (cursor ? ZOOM : 1)}
						/>
					{:else if zone.shape.kind === 'ellipse'}
						<ellipse
							cx={zone.shape.cx}
							cy={zone.shape.cy}
							rx={zone.shape.rx}
							ry={zone.shape.ry}
							fill={zone.color}
							stroke={zone.strokeColor}
							stroke-width={0.005 / (cursor ? ZOOM : 1)}
						/>
					{:else}
						<polygon
							points={polygonPoints(zone.shape.points)}
							fill={zone.color}
							stroke={zone.strokeColor}
							stroke-width={0.005 / (cursor ? ZOOM : 1)}
						/>
					{/if}
				{/each}

				{#each visibleOther as shot, i (i)}
					{#if shot.x !== null && shot.y !== null}
						<!-- Pale fill with a dark rim, so a faded arrow reads on both the black and white rings. -->
						<circle
							cx={shot.x}
							cy={shot.y}
							r={0.028 / (cursor ? ZOOM : 1)}
							fill="#f4f1ea"
							fill-opacity="0.55"
							stroke="#23282c"
							stroke-opacity="0.3"
							stroke-width={0.01 / (cursor ? ZOOM : 1)}
						/>
					{/if}
				{/each}

				{#if hull.length >= 3}
					<polygon
						points={hull.map(([x, y]) => `${x},${y}`).join(' ')}
						fill="var(--c-brand)"
						fill-opacity="0.12"
						stroke="var(--c-brand)"
						stroke-width={0.01 / (cursor ? ZOOM : 1)}
						stroke-dasharray="0.03 0.02"
					/>
				{/if}

				{#each shots as shot, i (i)}
					{#if shot.x !== null && shot.y !== null}
						<circle
							cx={shot.x}
							cy={shot.y}
							r={0.034 / (cursor ? ZOOM : 1)}
							fill="var(--c-brand)"
							stroke="var(--c-ink)"
							stroke-width={0.012 / (cursor ? ZOOM : 1)}
						/>
					{/if}
				{/each}

				{#if centre}
					<g
						stroke="var(--c-danger)"
						stroke-width={0.014 / (cursor ? ZOOM : 1)}
						fill="none"
						opacity="0.95"
					>
						<circle cx={centre.centerX} cy={centre.centerY} r={0.07 / (cursor ? ZOOM : 1)} />
						<path
							d="M{centre.centerX - 0.12 / (cursor ? ZOOM : 1)},{centre.centerY}h{0.1 /
								(cursor ? ZOOM : 1)}M{centre.centerX + 0.02 / (cursor ? ZOOM : 1)},{centre.centerY}h{0.1 /
								(cursor ? ZOOM : 1)}M{centre.centerX},{centre.centerY -
								0.12 / (cursor ? ZOOM : 1)}v{0.1 / (cursor ? ZOOM : 1)}M{centre.centerX},{centre.centerY +
								0.02 / (cursor ? ZOOM : 1)}v{0.1 / (cursor ? ZOOM : 1)}"
						/>
					</g>
				{/if}

				{#if cursor}
					<g stroke="var(--c-ink)" stroke-width={0.008 / ZOOM} fill="none">
						<circle cx={cursor.x} cy={cursor.y} r={0.05 / ZOOM} />
						<path
							d="M{cursor.x - 0.1 / ZOOM},{cursor.y}h{0.16 / ZOOM}M{cursor.x},{cursor.y -
								0.1 / ZOOM}v{0.16 / ZOOM}"
						/>
					</g>
				{/if}
			</g>
		</g>
	</svg>

	{#if showOtherToggle || showCentreToggle}
		<div class="absolute right-1 bottom-1 flex gap-1">
			{#if showCentreToggle}
				<button
					class="rounded-lg border p-1.5 shadow-sm
						{showCentre ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-muted'}"
					aria-label="Group centre"
					aria-pressed={showCentre}
					onclick={() => (showCentre = !showCentre)}
				>
					<Icon name="sight" size={18} />
				</button>
			{/if}
			{#if showOtherToggle}
				<button
					class="rounded-lg border p-1.5 shadow-sm
						{showOther ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-muted'}"
					aria-label="Other ends"
					aria-pressed={showOther}
					onclick={() => (showOther = !showOther)}
				>
					<Icon name={showOther ? 'eye' : 'eyeOff'} size={18} />
				</button>
			{/if}
		</div>
	{/if}
</div>
