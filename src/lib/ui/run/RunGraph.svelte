<script lang="ts">
	import { t } from '$lib/i18n';
	import { clock } from '$lib/domain/running';
	import { formatPace } from '$lib/domain/run/workout';
	import { condense, type RunPause, type RunSample } from '$lib/domain/run/series';
	import { sayDistance } from './distance';

	/**
	 * A run as lines rather than as a table.
	 *
	 * The three are drawn over each other on purpose: the question the graph answers is why a
	 * kilometre was slow, and the answer is nearly always the hill under it or the heart rate that
	 * never came back down. Read apart they say nothing the splits do not.
	 *
	 * Each line keeps its own scale, because a pace in seconds, a climb in metres and a beat a
	 * minute share no axis. What they share is the ground underneath, which is the run. Two of them
	 * get an edge of the box to write their figures down, in their own colour so there is nothing to
	 * work out about which belongs to which.
	 */
	let {
		samples,
		pauses = [],
		onscrub = undefined,
		focus = null
	}: {
		samples: RunSample[];
		/** Where the run was held, which is what explains a gap in the lines. */
		pauses?: RunPause[];
		/** The run's clock where the finger is, so the route can mark the same moment. Null on release. */
		onscrub?: (seconds: number | null) => void;
		/**
		 * A moment to read the graph at without a finger on it, for a kilometre picked off the list
		 * next door. The finger wins while there is one, because it is the more recent of the two.
		 */
		focus?: number | null;
	} = $props();

	type Series = 'pace' | 'climb' | 'heart';
	type Axis = 'distance' | 'time';

	/** Pace alone to begin with: it is the line the run is actually read for. */
	let shown = $state<Record<Series, boolean>>({ pace: true, climb: false, heart: false });
	let axis = $state<Axis>('distance');
	/** Which sample the finger is on, or null while nobody is touching the graph. */
	let held = $state<number | null>(null);

	const W = 300;
	const H = 100;
	/**
	 * How much of each end of a series is left out of its scale. A twentieth either way is enough to
	 * lose the stops and the bad fixes and not enough to lose a hill.
	 */
	const OUTLIERS = 0.05;
	/**
	 * How many points the line is drawn from. Fewer than the pixels across, because the line is read
	 * for where the run went hard and where it went uphill, and neither of those is a second long.
	 */
	const GRAPH_POINTS = 120;

	/**
	 * At most one point per pixel of width, each the average of the stretch behind it. Past that a
	 * path is cost with nothing drawn for it, and picking one fix in every nine would draw the noise
	 * rather than the run.
	 */
	const points = $derived(condense(samples, GRAPH_POINTS));

	const valueOf = (sample: RunSample, series: Series) =>
		series === 'pace' ? sample.pace : series === 'climb' ? sample.climbM : sample.heartRate;

	const span = $derived.by(() => {
		const last = points[points.length - 1];
		return (axis === 'distance' ? (last?.distanceM ?? 0) : (last?.seconds ?? 0)) || 1;
	});
	const alongOf = (sample: RunSample) =>
		(axis === 'distance' ? sample.distanceM : sample.seconds) / span;

	/**
	 * What a series covers, padded a tenth so a line never runs along the edge of its own box.
	 *
	 * The ends are taken off before the range is measured. A run has a handful of samples that say
	 * half an hour a kilometre, which is a red light or a receiver thinking again, and a scale drawn
	 * to fit those squashes the whole run into the top of the box to make room for four of them.
	 * What is outside the band is still drawn, flattened against the edge it went past.
	 */
	function scaleOf(series: Series) {
		const values = points
			.map((sample) => valueOf(sample, series))
			.filter((value): value is number => value !== null);
		if (values.length === 0) return null;
		const sorted = [...values].sort((a, b) => a - b);
		const at = (share: number) => sorted[Math.round(share * (sorted.length - 1))];
		const low = at(OUTLIERS);
		const high = at(1 - OUTLIERS);
		const pad = Math.max(1, (high - low) * 0.1);
		return { min: low - pad, max: high + pad, low, high };
	}

	const scales = $derived({
		pace: scaleOf('pace'),
		climb: scaleOf('climb'),
		heart: scaleOf('heart')
	});

	/** Where a value sits in its own box, as a share from the top. Pace is upside down: faster is higher. */
	function shareOf(series: Series, value: number): number {
		const scale = scales[series];
		if (!scale) return 0.5;
		// Held inside the box: a sample past the band is drawn against the edge rather than outside it.
		const share = Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min || 1)));
		return series === 'pace' ? share : 1 - share;
	}

	/**
	 * A path with a break wherever the series says nothing. Drawn through a gap, a line would claim
	 * a pace for a minute the phone never measured one in, which is the one thing a graph must not do.
	 */
	function pathOf(series: Series): string {
		if (!scales[series]) return '';
		let path = '';
		let broken = true;
		for (const sample of points) {
			const value = valueOf(sample, series);
			if (value === null) {
				broken = true;
				continue;
			}
			path += `${broken ? 'M' : 'L'}${(alongOf(sample) * W).toFixed(1)} ${(shareOf(series, value) * H).toFixed(1)}`;
			broken = false;
		}
		return path;
	}

	function say(series: Series, value: number): string {
		if (series === 'pace') return formatPace(value);
		if (series === 'climb') return `${Math.round(value)}`;
		return `${Math.round(value)}`;
	}

	const lines: { key: Series; label: string; unit: string }[] = [
		{ key: 'pace', label: $t('running.pace'), unit: $t('running.perKm') },
		{ key: 'climb', label: $t('running.height'), unit: $t('running.metresShort') },
		{ key: 'heart', label: $t('running.heart'), unit: $t('running.bpm') }
	];
	const available = $derived(lines.filter((line) => scales[line.key] !== null));
	const drawn = $derived(available.filter((line) => shown[line.key]));

	/**
	 * Which line owns which edge. The pace writes its figures down the left and the climb down the
	 * right, because that is the pair that is read together; the heart takes whichever of the two is
	 * going spare. With all three drawn, the beat has no edge left and is read off the legend and
	 * off the finger instead, which is where a bpm is actually wanted.
	 */
	const leftAxis = $derived(drawn.find((line) => line.key === 'pace') ?? drawn.find((line) => line.key === 'heart') ?? null);
	const rightAxis = $derived(
		drawn.find((line) => line.key === 'climb') ??
			(leftAxis?.key === 'heart' ? null : (drawn.find((line) => line.key === 'heart') ?? null))
	);

	/** Three marks an edge: the top of what the line covered, the middle, and the bottom. */
	function ticks(series: Series): { at: number; said: string }[] {
		const scale = scales[series];
		if (!scale) return [];
		// A series that never moved, a climb on the flat or a pace held exactly, has one mark and not
		// three: three of them would be three copies of the same figure at the same height.
		if (scale.high === scale.low) {
			return [{ at: shareOf(series, scale.low) * 100, said: say(series, scale.low) }];
		}
		const middle = (scale.low + scale.high) / 2;
		return [scale.high, middle, scale.low]
			.map((value) => ({ at: shareOf(series, value) * 100, said: say(series, value) }))
			.sort((a, b) => a.at - b.at);
	}

	/** Where to rule the graph: wherever the figures down its edges sit, so the two agree. */
	const rules = $derived(leftAxis ? ticks(leftAxis.key).map((tick) => tick.at) : rightAxis ? ticks(rightAxis.key).map((tick) => tick.at) : []);

	/** The sample under the finger, by where it is across the plot rather than by which point is nearest. */
	function grab(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (box.width <= 0 || points.length === 0) return;
		const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
		let best = 0;
		let closest = Infinity;
		for (let i = 0; i < points.length; i++) {
			const gap = Math.abs(alongOf(points[i]) - share);
			if (gap < closest) {
				closest = gap;
				best = i;
			}
		}
		held = best;
		onscrub?.(points[best].seconds);
	}

	function release() {
		held = null;
		onscrub?.(null);
	}

	/** The sample nearest a moment, which is how a kilometre picked from the list is found. */
	function nearest(seconds: number): RunSample | null {
		let best: RunSample | null = null;
		let closest = Infinity;
		for (const sample of points) {
			const gap = Math.abs(sample.seconds - seconds);
			if (gap < closest) {
				closest = gap;
				best = sample;
			}
		}
		return best;
	}

	const reading = $derived(
		held !== null ? (points[held] ?? null) : focus !== null ? nearest(focus) : null
	);
</script>

<div>
	<div class="flex flex-wrap items-center gap-1">
		{#each available as line (line.key)}
			<button
				class="press flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium {shown[
					line.key
				]
					? 'border-transparent'
					: 'border-line text-muted'}"
				style={shown[line.key]
					? `background:var(--c-run-${line.key});color:var(--color-brand-ink)`
					: ''}
				aria-pressed={shown[line.key]}
				onclick={() => (shown = { ...shown, [line.key]: !shown[line.key] })}
			>
				<span
					class="h-2 w-2 shrink-0 rounded-full"
					style="background:{shown[line.key] ? 'currentColor' : `var(--c-run-${line.key})`}"
				></span>
				{line.label}
			</button>
		{/each}
		<!-- What the lines are drawn against, which is the one thing about them worth a control. -->
		<button
			class="press ml-auto rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted"
			onclick={() => (axis = axis === 'distance' ? 'time' : 'distance')}
		>
			{axis === 'distance' ? $t('running.alongDistance') : $t('running.alongTime')}
		</button>
	</div>

	{#if drawn.length === 0}
		<p class="py-8 text-center text-xs text-muted">{$t('running.graphNothing')}</p>
	{:else}
		<!--
			What is under the finger, above the graph rather than floating over it: a tooltip on a
			phone is under the thumb that summoned it, and this is read while the thumb is still down.
		-->
		<div class="mt-2 flex h-5 items-center gap-3 text-xs tabular">
			{#if reading}
				<span class="text-muted">
					{axis === 'distance' ? sayDistance(reading.distanceM, $t) : clock(reading.seconds)}
				</span>
				{#each drawn as line (line.key)}
					{@const value = valueOf(reading, line.key)}
					<span class="font-semibold" style="color:var(--c-run-{line.key})">
						{value === null ? '–' : `${say(line.key, value)} ${line.unit}`}
					</span>
				{/each}
			{:else}
				<span class="text-muted">{$t('running.scrubHint')}</span>
			{/if}
		</div>

		<!-- Down the page still belongs to the page: only a drag across the graph reads it. -->
		<div class="relative mt-1 h-32 touch-pan-y select-none">
			<!-- The edges hold the figures, so the lines start after them and end before the others. -->
			{#if leftAxis}
				<div class="absolute inset-y-0 left-0 w-11">
					{#each ticks(leftAxis.key) as tick, i (i)}
						<span
							class="absolute right-1 -translate-y-1/2 text-[10px] font-semibold tabular"
							style="top:{tick.at}%;color:var(--c-run-{leftAxis.key})"
						>
							{tick.said}
						</span>
					{/each}
				</div>
			{/if}
			{#if rightAxis}
				<div class="absolute inset-y-0 right-0 w-11">
					{#each ticks(rightAxis.key) as tick, i (i)}
						<span
							class="absolute left-1 -translate-y-1/2 text-[10px] font-semibold tabular"
							style="top:{tick.at}%;color:var(--c-run-{rightAxis.key})"
						>
							{tick.said}
						</span>
					{/each}
				</div>
			{/if}

			<!-- A drag across the graph is a reading of it, never a swipe to the tab beside it. -->
			<div
				class="absolute inset-y-0 {leftAxis ? 'left-11' : 'left-0'} {rightAxis ? 'right-11' : 'right-0'}"
				role="presentation"
				data-noswipe
				onpointerdown={(event) => {
					(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
					grab(event);
				}}
				onpointermove={(event) => {
					if (held !== null) grab(event);
				}}
				onpointerup={release}
				onpointercancel={release}
			>
				<svg
					class="h-full w-full overflow-visible"
					viewBox="0 0 {W} {H}"
					preserveAspectRatio="none"
					role="img"
					aria-label={drawn.map((line) => line.label).join(', ')}
				>
					<!-- Drawn where the figures are rather than at the edges of the box, or a rule points
					     at nothing. Both edges mark the ends of their own line, so one set does for both. -->
					{#each rules as at, i (i)}
						<line
							x1="0"
							x2={W}
							y1={(at / 100) * H}
							y2={(at / 100) * H}
							stroke="var(--color-line)"
							stroke-width="1"
							stroke-dasharray="2 3"
							vector-effect="non-scaling-stroke"
						/>
					{/each}
					<!--
						Where the run was held. A pause takes no room on either axis, because neither the
						clock nor the distance moved while it lasted: it is a place on the line rather
						than a stretch of it, and drawn as a stretch it would be a lie about both.
					-->
					{#each pauses as pause, i (i)}
						{@const x = ((axis === 'distance' ? pause.distanceM : pause.seconds) / span) * W}
						<line
							x1={x}
							x2={x}
							y1="0"
							y2={H}
							stroke="var(--color-muted)"
							stroke-width="1"
							stroke-dasharray="3 3"
							opacity="0.7"
							vector-effect="non-scaling-stroke"
						/>
					{/each}
					{#each drawn as line (line.key)}
						<path
							d={pathOf(line.key)}
							fill="none"
							stroke="var(--c-run-{line.key})"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							vector-effect="non-scaling-stroke"
						/>
					{/each}
					{#if reading}
						<line
							x1={alongOf(reading) * W}
							x2={alongOf(reading) * W}
							y1="0"
							y2={H}
							stroke="var(--color-ink)"
							stroke-width="1"
							vector-effect="non-scaling-stroke"
						/>
					{/if}
				</svg>

				<!-- The dots sit outside the stretched drawing, or they would be drawn as ellipses. -->
				{#if reading}
					{#each drawn as line (line.key)}
						{@const value = valueOf(reading, line.key)}
						{#if value !== null}
							<span
								class="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
								style="left:{alongOf(reading) * 100}%;top:{shareOf(line.key, value) * 100}%;
									background:var(--c-run-{line.key});box-shadow:0 0 0 2px var(--color-surface)"
							></span>
						{/if}
					{/each}
				{/if}
			</div>
		</div>

		<!-- The ends of the ground the lines are drawn over, which is what says how far in they are. -->
		<div
			class="flex justify-between text-xs text-muted tabular {leftAxis ? 'pl-11' : ''} {rightAxis
				? 'pr-11'
				: ''}"
		>
			<span>{axis === 'distance' ? sayDistance(0, $t) : clock(0)}</span>
			<span>
				{axis === 'distance'
					? sayDistance(points[points.length - 1]?.distanceM ?? 0, $t)
					: clock(points[points.length - 1]?.seconds ?? 0)}
			</span>
		</div>
	{/if}
</div>
