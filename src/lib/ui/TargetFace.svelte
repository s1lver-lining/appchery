<script lang="ts">
	import type { ScoreSet, Shot } from '$lib/domain/rounds/types';
	import { plotTapMs } from '$lib/prefs';
	import { tap as buzz } from '$lib/haptics';
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
		highlight = null,
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
		/**
		 * The arrow being replaced, ringed so the archer can see which one the next tap will move.
		 * Null when nothing is being edited, or when the arrow was typed in and has no place yet.
		 */
		highlight?: { x: number; y: number } | null;
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

	/**
	 * How far out an arrow may be placed. A little past the face itself, because a miss is worth
	 * recording where it went, but not into the corners of the box: nothing is shown out there, since
	 * showing a cursor where an arrow cannot land is the drawing promising something it will not do.
	 */
	const PLOT_RADIUS = 1.15;
	const plottable = (point: { x: number; y: number } | null) =>
		point && Math.hypot(point.x, point.y) <= PLOT_RADIUS ? point : null;

	/**
	 * A press short enough to be a tap rather than an aim. A tap means "the arrow is here", so it is
	 * taken at the point touched, with no clearance for a finger that was never in the way long
	 * enough to hide anything. How long that is belongs to the archer, so it is a setting.
	 */
	const tapMs = $derived($plotTapMs);
	let tap: { at: number; point: { x: number; y: number } | null } | null = null;
	/** Where the finger is, so the cursor can appear under it once the press outlives a tap. */
	let held: { clientX: number; clientY: number } | null = null;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function stopHold() {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}

	/** Live pointers, so a second finger turns the drag into a pinch rather than moving the arrow. */
	const active = new Map<number, { x: number; y: number }>();
	let pinchStart: { distance: number; zoom: number } | null = null;

	/**
	 * The magnifier scales the face about the cursor, so the cursor stays exactly where the finger
	 * put it and the badge can be anchored straight to that coordinate.
	 */
	const badgeLeft = $derived(cursor ? ((cursor.x + 1.05) / 2.1) * 100 : 50);
	const badgeTop = $derived(cursor ? ((cursor.y + 1.05) / 2.1) * 100 : 50);

	function toFace(
		event: { clientX: number; clientY: number },
		offset = FINGER_OFFSET
	): { x: number; y: number } | null {
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * 2.1 - 1.05;
		const y = ((event.clientY - rect.top) / rect.height) * 2.1 - 1.05 - offset;
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
			// A pinch is a zoom, not a placement: the cursor goes away so nothing looks selectable.
			pinchStart = { distance: spread(), zoom };
			cursor = null;
			tap = null;
			stopHold();
			return;
		}

		// Nothing is drawn while the press could still be a tap: a tap wants the face left alone, and
		// the magnifier appearing under every touch reads as a jump. Past that, the press is an aim.
		tap = { at: Date.now(), point: plottable(toFace(event, 0)) };
		held = { clientX: event.clientX, clientY: event.clientY };
		cursor = null;
		stopHold();
		holdTimer = setTimeout(() => {
			holdTimer = null;
			if (!held) return;
			cursor = plottable(toFace(held));
			// Felt at the moment the press becomes an aim, which is the only moment worth announcing.
			if (cursor) buzz();
		}, tapMs);
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
		const wasAiming = cursor !== null || holdTimer === null;
		held = { clientX: event.clientX, clientY: event.clientY };
		// The cursor comes and goes as the finger leaves and re-enters the reachable area.
		if (wasAiming) cursor = plottable(toFace(event));
	}

	/**
	 * Committing on release is what makes the drag useful: the archer can correct before letting go.
	 * A tap commits too, at the point it touched: both are ways of saying where the arrow went.
	 */
	function up(event: PointerEvent) {
		if (!interactive) return;
		active.delete(event.pointerId);

		if (pinchStart) {
			// Lifting out of a pinch must not drop an arrow wherever the fingers happened to be.
			if (active.size === 0) {
				pinchStart = null;
				cursor = null;
				tap = null;
			}
			return;
		}

		stopHold();
		const tapped = tap && Date.now() - tap.at < tapMs ? tap.point : null;
		// The last fallback covers the press that outlived a tap by less than the timer took to fire.
		const point = tapped ?? cursor ?? plottable(held ? toFace(held) : null);
		tap = null;
		held = null;
		cursor = null;
		if (point) onplot?.(point.x, point.y);
	}

	function cancel(event: PointerEvent) {
		active.delete(event.pointerId);
		if (active.size === 0) {
			stopHold();
			pinchStart = null;
			cursor = null;
			tap = null;
			held = null;
		}
	}

	/**
	 * Android fires its own buzz when a long press turns into a text selection or a context menu, which
	 * lands on top of the one this component fires when the press becomes an aim: two pulses for one
	 * gesture, and only when the browser felt like gesturing, so it is not even the same twice. None of
	 * touch-action, user-select or a cancelled contextmenu reach it: the gesture is recognised from the
	 * raw touch stream, before any of those are consulted. Refusing the touch itself is what stops it.
	 *
	 * The listener has to be attached by hand because Svelte registers ontouchstart as passive, where a
	 * cancelled default is ignored. Pointer events are unaffected and still carry the whole interaction.
	 */
	$effect(() => {
		const node = svg;
		if (!node || !interactive) return;
		const swallow = (event: TouchEvent) => event.preventDefault();
		node.addEventListener('touchstart', swallow, { passive: false });
		return () => node.removeEventListener('touchstart', swallow);
	});

	/** Trackpad and mouse wheel, so the same control works on the desktop build. */
	function wheel(event: WheelEvent) {
		if (!interactive) return;
		event.preventDefault();
		zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
	}

</script>

<div class="relative h-full w-full" data-noswipe>
	<svg
		bind:this={svg}
		viewBox="-1.05 -1.05 2.1 2.1"
		class="h-full w-full touch-none select-none outline-none focus-visible:outline-2
			focus-visible:outline-offset-2 focus-visible:outline-brand
			{interactive ? 'cursor-crosshair' : ''}"
		aria-label="Target face"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={cancel}
		onwheel={wheel}
		oncontextmenu={(event) => event.preventDefault()}
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

				<!--
					The arrow the next tap will move, ringed rather than recoloured: it is still an arrow.
					Laid over a pale halo so the ring is visible on gold, red, blue and black alike.
				-->
				{#if highlight}
					<g fill="none">
						<circle
							cx={highlight.x}
							cy={highlight.y}
							r={0.075 / (cursor ? zoom : 1)}
							stroke="var(--c-bg)"
							stroke-width={0.03 / (cursor ? zoom : 1)}
							opacity="0.85"
						/>
						<circle
							cx={highlight.x}
							cy={highlight.y}
							r={0.075 / (cursor ? zoom : 1)}
							stroke="var(--c-danger)"
							stroke-width={0.016 / (cursor ? zoom : 1)}
							stroke-dasharray="0.05 0.035"
						/>
					</g>
				{/if}

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

	{#if previewZone && cursor}
		<!--
			Anchored to the magnified position of the cursor rather than the middle of the face, and
			offset up and to the right, so the crosshair stays visible underneath it while the finger
			is held still.
		-->
		<div
			class="pointer-events-none absolute"
			style="left: {badgeLeft}%; top: {badgeTop}%; transform: translate(0.6rem, -2.4rem)"
		>
			<span
				class="tabular block rounded-lg px-2.5 py-0.5 text-xl font-bold"
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
					class="press rounded-lg border p-1.5 shadow-sm
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
					class="press rounded-lg border p-1.5 shadow-sm
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
