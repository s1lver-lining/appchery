<script lang="ts">
	import type { ScoreSet, Shot } from '$lib/domain/rounds/types';
	import { groupMetrics, groupHull, scoreAt, decimalScore } from '$lib/domain/rounds/geometry';
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

	/** What this position would score, shown while dragging so the value is known before releasing. */
	const previewZone = $derived(cursor ? scoreAt(scoreSet, cursor.x, cursor.y) : null);
	/** One decimal of depth into the ring, which is what tells a scraped 8 from a solid one. */
	const previewDecimal = $derived(cursor ? decimalScore(scoreSet, cursor.x, cursor.y) : null);

	/**
	 * Pinching sets the magnification, so a distant ring can be worked at whatever zoom the archer
	 * wants rather than the one chosen here.
	 */
	const MIN_ZOOM = 1.4;
	const MAX_ZOOM = 6;
	let zoom = $state(2.6);

	/**
	 * The plot sits above the touch point so a finger does not cover the arrow being placed. Roughly
	 * a centimetre of clearance on a phone, which is what it takes to see past a thumb.
	 */
	const FINGER_OFFSET = 0.34;

	/** Live pointers, so a second finger turns the drag into a pinch rather than moving the arrow. */
	const active = new Map<number, { x: number; y: number }>();
	let pinchStart: { distance: number; zoom: number } | null = null;

	function toFace(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * 2.1 - 1.05;
		const y = ((event.clientY - rect.top) / rect.height) * 2.1 - 1.05 - FINGER_OFFSET;
		return { x, y };
	}

	function spread(): number {
		const [a, b] = [...active.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function down(event: PointerEvent) {
		if (!interactive) return;
		(event.target as Element).setPointerCapture?.(event.pointerId);
		active.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (active.size === 2) {
			// The arrow stays where the first finger left it while the second one only scales.
			pinchStart = { distance: spread(), zoom };
			return;
		}
		cursor = toFace(event);
	}

	function move(event: PointerEvent) {
		if (!interactive) return;
		if (!active.has(event.pointerId)) return;
		active.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (active.size >= 2 && pinchStart) {
			const scale = spread() / (pinchStart.distance || 1);
			zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStart.zoom * scale));
			return;
		}
		if (cursor) cursor = toFace(event);
	}

	/** Committing on release is what makes the drag useful: the archer can correct before letting go. */
	function up(event: PointerEvent) {
		if (!interactive) return;
		active.delete(event.pointerId);

		if (pinchStart) {
			// Lifting out of a pinch must not drop an arrow wherever the fingers happened to be.
			if (active.size === 0) {
				pinchStart = null;
				cursor = null;
			}
			return;
		}
		if (!cursor) return;
		const { x, y } = cursor;
		cursor = null;
		if (Math.hypot(x, y) <= 1.15) onplot?.(x, y);
	}

	function cancel(event: PointerEvent) {
		active.delete(event.pointerId);
		if (active.size === 0) {
			pinchStart = null;
			cursor = null;
		}
	}

	/** Trackpad and mouse wheel, so the same control works on the desktop build. */
	function wheel(event: WheelEvent) {
		if (!interactive) return;
		event.preventDefault();
		zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
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
		onpointercancel={cancel}
		onwheel={wheel}
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
					? `translate(${-cursor.x * (zoom - 1)} ${-cursor.y * (zoom - 1)}) scale(${zoom})`
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
							stroke-width={0.005 / (cursor ? zoom : 1)}
						/>
					{:else if zone.shape.kind === 'ellipse'}
						<ellipse
							cx={zone.shape.cx}
							cy={zone.shape.cy}
							rx={zone.shape.rx}
							ry={zone.shape.ry}
							fill={zone.color}
							stroke={zone.strokeColor}
							stroke-width={0.005 / (cursor ? zoom : 1)}
						/>
					{:else}
						<polygon
							points={polygonPoints(zone.shape.points)}
							fill={zone.color}
							stroke={zone.strokeColor}
							stroke-width={0.005 / (cursor ? zoom : 1)}
						/>
					{/if}
				{/each}

				{#each visibleOther as shot, i (i)}
					{#if shot.x !== null && shot.y !== null}
						<!-- Pale fill with a dark rim, so a faded arrow reads on both the black and white rings. -->
						<circle
							cx={shot.x}
							cy={shot.y}
							r={0.028 / (cursor ? zoom : 1)}
							fill="#f4f1ea"
							fill-opacity="0.55"
							stroke="#23282c"
							stroke-opacity="0.3"
							stroke-width={0.01 / (cursor ? zoom : 1)}
						/>
					{/if}
				{/each}

				{#if hull.length >= 3}
					<polygon
						points={hull.map(([x, y]) => `${x},${y}`).join(' ')}
						fill="var(--c-brand)"
						fill-opacity="0.12"
						stroke="var(--c-brand)"
						stroke-width={0.01 / (cursor ? zoom : 1)}
						stroke-dasharray="0.03 0.02"
					/>
				{/if}

				{#each shots as shot, i (i)}
					{#if shot.x !== null && shot.y !== null}
						<circle
							cx={shot.x}
							cy={shot.y}
							r={0.034 / (cursor ? zoom : 1)}
							fill="var(--c-brand)"
							stroke="var(--c-ink)"
							stroke-width={0.012 / (cursor ? zoom : 1)}
						/>
					{/if}
				{/each}

				{#if centre}
					<g
						stroke="var(--c-danger)"
						stroke-width={0.014 / (cursor ? zoom : 1)}
						fill="none"
						opacity="0.95"
					>
						<circle cx={centre.centerX} cy={centre.centerY} r={0.07 / (cursor ? zoom : 1)} />
						<path
							d="M{centre.centerX - 0.12 / (cursor ? zoom : 1)},{centre.centerY}h{0.1 /
								(cursor ? zoom : 1)}M{centre.centerX + 0.02 / (cursor ? zoom : 1)},{centre.centerY}h{0.1 /
								(cursor ? zoom : 1)}M{centre.centerX},{centre.centerY -
								0.12 / (cursor ? zoom : 1)}v{0.1 / (cursor ? zoom : 1)}M{centre.centerX},{centre.centerY +
								0.02 / (cursor ? zoom : 1)}v{0.1 / (cursor ? zoom : 1)}"
						/>
					</g>
				{/if}

				{#if cursor}
					<!-- The crosshair has to be big to be seen past a thumb, so a small dot marks the exact
					     point the arrow will take. -->
					<circle
						cx={cursor.x}
						cy={cursor.y}
						r={0.012 / zoom}
						fill="var(--c-danger)"
						stroke="#ffffff"
						stroke-width={0.006 / zoom}
					/>
					<!-- Drawn twice: a pale halo under a dark line, so the crosshair reads on gold and on black. -->
					{#each [{ colour: '#ffffff', width: 0.026 }, { colour: 'var(--c-danger)', width: 0.012 }] as pen (pen.colour)}
						<g
							stroke={pen.colour}
							stroke-width={pen.width / zoom}
							stroke-linecap="round"
							fill="none"
						>
							<circle cx={cursor.x} cy={cursor.y} r={0.07 / zoom} />
							<path
								d="M{cursor.x - 0.15 / zoom},{cursor.y}h{0.09 / zoom}M{cursor.x +
									0.06 / zoom},{cursor.y}h{0.09 / zoom}M{cursor.x},{cursor.y -
									0.15 / zoom}v{0.09 / zoom}M{cursor.x},{cursor.y + 0.06 / zoom}v{0.09 / zoom}"
							/>
						</g>
					{/each}
				{/if}
			</g>
		</g>
	</svg>

	{#if previewZone}
		<!-- The magnifier centres the touch point, so the middle of the face is where the arrow lands. -->
		<div class="pointer-events-none absolute inset-0 grid place-items-center">
			<span
				class="tabular -translate-y-[3.4rem] rounded-lg px-3 py-1 text-2xl font-bold"
				style={previewZone.countsAsHit
					? `background-color: ${previewZone.color}; color: ${previewZone.strokeColor}; box-shadow: 0 0 0 2px ${previewZone.strokeColor}`
					: 'background-color: var(--c-sunk); color: var(--c-muted);'}
			>
				{previewDecimal !== null ? previewDecimal.toFixed(1) : previewZone.label}
			</span>
		</div>
	{/if}

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
