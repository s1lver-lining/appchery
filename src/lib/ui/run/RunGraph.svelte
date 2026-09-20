<script lang="ts">
	import { t } from '$lib/i18n';
	import { clock } from '$lib/domain/running';
	import { formatPace } from '$lib/domain/run/workout';
	import { extentOf, thin, type RunSample } from '$lib/domain/run/series';
	import { sayDistance } from './distance';

	/**
	 * A run as lines rather than as a table.
	 *
	 * The three are drawn over each other on purpose: the question the graph answers is why a
	 * kilometre was slow, and the answer is nearly always the hill under it or the heart rate that
	 * never came back down. Read apart they say nothing the splits do not.
	 *
	 * Each line keeps its own scale, because a pace in seconds, a climb in metres and a beat a
	 * minute share no axis. What they share is the ground underneath, which is the run.
	 */
	let { samples }: { samples: RunSample[] } = $props();

	type Series = 'pace' | 'climb' | 'heart';
	type Axis = 'distance' | 'time';

	/** Pace alone to begin with: it is the line the run is actually read for. */
	let shown = $state<Record<Series, boolean>>({ pace: true, climb: false, heart: false });
	let axis = $state<Axis>('distance');

	const W = 300;
	const H = 120;

	/** At most one point per pixel of width: past that a path is cost with nothing drawn for it. */
	const points = $derived(thin(samples, W));

	const valueOf = (sample: RunSample, series: Series) =>
		series === 'pace' ? sample.pace : series === 'climb' ? sample.climbM : sample.heartRate;

	const along = $derived.by(() => {
		const last = points[points.length - 1];
		const span = axis === 'distance' ? (last?.distanceM ?? 0) : (last?.seconds ?? 0);
		return (sample: RunSample) => {
			if (span <= 0) return 0;
			return ((axis === 'distance' ? sample.distanceM : sample.seconds) / span) * W;
		};
	});

	/** What a series covers, padded a tenth so a line never runs along the edge of its own box. */
	function scaleOf(series: Series) {
		const found = extentOf(points.map((sample) => valueOf(sample, series)));
		if (!found) return null;
		const pad = Math.max(1, (found.max - found.min) * 0.1);
		return { min: found.min - pad, max: found.max + pad, low: found.min, high: found.max };
	}

	const scales = $derived({
		pace: scaleOf('pace'),
		climb: scaleOf('climb'),
		heart: scaleOf('heart')
	});

	/**
	 * A path with a break wherever the series says nothing. Drawn through a gap, a line would claim
	 * a pace for a minute the phone never measured one in, which is the one thing a graph must not do.
	 */
	function pathOf(series: Series): string {
		const scale = scales[series];
		if (!scale) return '';
		const span = scale.max - scale.min;
		let path = '';
		let broken = true;
		for (const sample of points) {
			const value = valueOf(sample, series);
			if (value === null) {
				broken = true;
				continue;
			}
			// A pace is upside down: a smaller number is a faster runner, so it belongs higher up.
			const share = (value - scale.min) / (span || 1);
			const y = series === 'pace' ? share * H : H - share * H;
			path += `${broken ? 'M' : 'L'}${along(sample).toFixed(1)} ${y.toFixed(1)}`;
			broken = false;
		}
		return path;
	}

	function say(series: Series, value: number): string {
		if (series === 'pace') return `${formatPace(value)} ${$t('running.perKm')}`;
		if (series === 'climb') return `${Math.round(value)}${$t('running.metresShort')}`;
		return $t('running.bpmValue', { n: Math.round(value) });
	}

	const lines: { key: Series; label: string }[] = [
		{ key: 'pace', label: $t('running.pace') },
		{ key: 'climb', label: $t('running.height') },
		{ key: 'heart', label: $t('running.heart') }
	];
	const available = $derived(lines.filter((line) => scales[line.key] !== null));
	const drawn = $derived(available.filter((line) => shown[line.key]));
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
		<svg
			class="mt-2 w-full"
			viewBox="-2 -2 {W + 4} {H + 4}"
			preserveAspectRatio="none"
			role="img"
			aria-label={drawn.map((line) => line.label).join(', ')}
		>
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
		</svg>

		<!-- The ends of the ground the lines are drawn over, which is what says how far in they are. -->
		<div class="flex justify-between text-xs text-muted tabular">
			<span>{axis === 'distance' ? sayDistance(0, $t) : clock(0)}</span>
			<span>
				{axis === 'distance'
					? sayDistance(points[points.length - 1]?.distanceM ?? 0, $t)
					: clock(points[points.length - 1]?.seconds ?? 0)}
			</span>
		</div>

		<!-- Each line says the ground it covers, because three scales in one box cannot be labelled. -->
		<dl class="mt-2 space-y-1">
			{#each drawn as line (line.key)}
				{@const scale = scales[line.key]}
				{#if scale}
					<div class="flex items-center gap-2 text-xs">
						<dt class="flex items-center gap-1.5" style="color:var(--c-run-{line.key})">
							<span class="h-2 w-2 rounded-full" style="background:var(--c-run-{line.key})"></span>
							{line.label}
						</dt>
						<dd class="ml-auto text-muted tabular">
							{say(line.key, scale.low)} – {say(line.key, scale.high)}
						</dd>
					</div>
				{/if}
			{/each}
		</dl>
	{/if}
</div>
