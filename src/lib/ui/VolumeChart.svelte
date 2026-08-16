<script lang="ts">
	import { t } from '$lib/i18n';
	import { dateFormats } from '$lib/prefs';
	import { grainEnd, type Grain, type VolumeBucket } from '$lib/domain/stats';
	import Icon from './Icon.svelte';

	/**
	 * What was shot over the window, one bar per day, week or month. The bars stack by the kind of
	 * outing, because an archer reading a heavy month wants to know how much of it was competition.
	 *
	 * One measure at a time rather than a second axis: volume and score per arrow share no scale,
	 * and drawing them together makes a chart that can be read to say anything.
	 */
	let {
		buckets,
		grain,
		keys,
		colourOf,
		labelOf
	}: {
		buckets: VolumeBucket[];
		grain: Grain;
		/** The stack order, fixed by the caller so a filtered out kind never repaints the others. */
		keys: string[];
		colourOf: (key: string) => string;
		labelOf: (key: string) => string;
	} = $props();

	type Metric = 'arrows' | 'perArrow' | 'rounds';
	const METRICS: Metric[] = ['arrows', 'perArrow', 'rounds'];

	let metric = $state<Metric>('arrows');
	let picked = $state<number | null>(null);

	// A selection points at one bar of one set of bars: refiltered, the index is a different week.
	$effect(() => {
		void buckets;
		picked = null;
	});

	const PLOT = 112;

	const valueOf = (bucket: VolumeBucket) =>
		metric === 'arrows' ? bucket.arrows : metric === 'rounds' ? bucket.rounds : (bucket.perArrow ?? 0);

	const values = $derived(buckets.map(valueOf));
	const top = $derived(Math.max(1, ...values));
	/** Score per arrow lives between 5 and 10, so a plot from zero would flatten every difference. */
	const floor = $derived(
		metric === 'perArrow' ? Math.max(0, Math.floor(Math.min(...values.filter((v) => v > 0), top)) - 1) : 0
	);
	const span = $derived(Math.max(0.01, top - floor));

	const height = (value: number) =>
		value <= floor ? 0 : Math.max(3, ((value - floor) / span) * PLOT);

	const ticks = $derived([top, floor + span / 2, floor]);
	const tick = (value: number) => (metric === 'perArrow' ? value.toFixed(1) : Math.round(value));

	const arrows = $derived(buckets.reduce((sum, b) => sum + b.arrows, 0));
	const rounds = $derived(buckets.reduce((sum, b) => sum + b.rounds, 0));
	/** Weighted over the arrows rather than averaged over the bars, or a light week would count double. */
	const perArrow = $derived(
		arrows > 0
			? buckets.reduce((sum, b) => sum + (b.perArrow ?? 0) * b.arrows, 0) / arrows
			: null
	);

	/** The headline follows the measure on show, or it answers a question nobody asked. */
	const headline = $derived(
		metric === 'arrows'
			? String(arrows)
			: metric === 'rounds'
				? String(rounds)
				: (perArrow?.toFixed(2) ?? '—')
	);
	const headlineLabel = $derived(
		metric === 'arrows'
			? $t('stats.totalArrows')
			: metric === 'rounds'
				? $t('stats.roundsShot')
				: $t('stats.perArrow')
	);
	/** Kinds nothing was shot in are dropped from the legend rather than sitting there empty. */
	const present = $derived(keys.filter((key) => buckets.some((b) => (b.byKey[key]?.arrows ?? 0) > 0)));

	// What a bar stands for, not where it starts: naming a week by its first day reads as that day.
	const bucketLabel = $derived((at: number) => {
		if (grain === 'month') return $dateFormats.monthYear(at);
		if (grain === 'day') return $dateFormats.date(at);
		return $t('stats.barRange', {
			from: $dateFormats.shortDate(at),
			to: $dateFormats.date(grainEnd(at, grain))
		});
	});

	/** One label per week of days, per month of weeks: thirty of them would be unreadable. */
	const everyNth = $derived(Math.max(1, Math.ceil(buckets.length / 8)));
	const axisLabel = $derived((at: number, index: number) => {
		if (index % everyNth !== 0) return '';
		if (grain === 'month') return $dateFormats.monthNarrow(at);
		return $dateFormats.shortDate(at);
	});

	const shown = $derived(picked === null ? null : buckets[picked]);
</script>

<div class="rounded-xl border border-line bg-surface p-4">
	<div class="flex items-baseline justify-between gap-3">
		<h2 class="text-sm font-semibold">{$t('stats.overview')}</h2>
		<p class="text-xs text-muted">{$t(`stats.grain.${grain}`)}</p>
	</div>

	<!-- The headline reads the whole window; tapping a bar swaps it for that bar, then back. -->
	<div class="mt-2 flex items-baseline gap-2">
		{#if shown}
			<p class="tabular shrink-0 text-3xl leading-none font-bold text-brand-text">
				{metric === 'perArrow'
					? (shown.perArrow?.toFixed(2) ?? '—')
					: metric === 'rounds'
						? shown.rounds
						: shown.arrows}
			</p>
			<p class="min-w-0 flex-1 text-xs text-muted">{bucketLabel(shown.at)}</p>
			<!-- Tapping the bar again does this too, but a weekly bar is a few pixels wide. -->
			<button
				class="-my-1 shrink-0 self-center rounded-lg p-1 text-muted"
				aria-label={$t('stats.clearBar')}
				onclick={() => (picked = null)}
			>
				<Icon name="close" size={16} />
			</button>
		{:else}
			<p class="tabular text-3xl leading-none font-bold text-brand-text">{headline}</p>
			<p class="text-xs text-muted">{headlineLabel}</p>
		{/if}
	</div>

	<nav class="mt-3 flex gap-1 rounded-lg bg-sunk p-1" aria-label={$t('stats.metric')}>
		{#each METRICS as item (item)}
			<button
				class="flex-1 rounded-md py-1.5 text-xs font-medium
					{metric === item ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
				aria-pressed={metric === item}
				onclick={() => (metric = item)}
			>
				{$t(`stats.metric.${item}`)}
			</button>
		{/each}
	</nav>

	<div class="mt-4 flex gap-2">
		<div class="tabular flex w-8 shrink-0 flex-col justify-between text-right text-[10px] text-muted"
			style="height: {PLOT}px">
			{#each ticks as value, index (index)}
				<span class="leading-none">{tick(value)}</span>
			{/each}
		</div>

		<div class="relative flex-1">
			<!-- Gridlines behind the bars: recessive, and only enough of them to read a height by. -->
			<div class="absolute inset-x-0 top-0 flex flex-col justify-between" style="height: {PLOT}px">
				{#each ticks as _value, index (index)}
					<span class="h-px w-full bg-line"></span>
				{/each}
			</div>

			<!-- The space above the bars clears the selection rather than picking the bar under it. -->
			<div
				class="relative flex items-end gap-px"
				style="height: {PLOT}px"
				role="presentation"
				onclick={() => (picked = null)}
			>
				{#each buckets as bucket, index (bucket.at)}
					{@const value = valueOf(bucket)}
					<button
						class="group flex flex-1 flex-col justify-end"
						aria-label="{bucketLabel(bucket.at)}: {$t('stats.barLabel', {
							arrows: bucket.arrows,
							rounds: bucket.rounds
						})}"
						aria-pressed={picked === index}
						onclick={(event) => {
							event.stopPropagation();
							picked = picked === index ? null : index;
						}}
					>
						{#if value <= 0}
							<!-- A hairline where nothing was shot, so time off reads as rest, not as missing data. -->
							<span class="w-full rounded-full bg-line" style="height: 2px"></span>
						{:else if metric === 'arrows' || metric === 'rounds'}
							<span
								class="flex w-full flex-col-reverse overflow-hidden rounded-t {picked !== null &&
								picked !== index
									? 'opacity-40'
									: ''}"
								style="height: {height(value)}px"
							>
								<!-- Stacked bottom up in a fixed order, so a colour always means the same kind. -->
								{#each keys as key (key)}
									{@const slice =
										metric === 'arrows'
											? (bucket.byKey[key]?.arrows ?? 0)
											: (bucket.byKey[key]?.rounds ?? 0)}
									{#if slice > 0}
										<span
											class="w-full"
											style="flex: {slice} 0 0; background: {colourOf(key)};
												box-shadow: 0 -2px 0 0 var(--color-surface)"
										></span>
									{/if}
								{/each}
							</span>
						{:else}
							<span
								class="w-full rounded-t bg-brand {picked !== null && picked !== index
									? 'opacity-40'
									: ''}"
								style="height: {height(value)}px"
							></span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Laid over the axis rather than inside the bar cells, which are a few pixels wide. -->
			<div class="relative mt-1 h-3">
				{#each buckets as bucket, index (bucket.at)}
					{@const label = axisLabel(bucket.at, index)}
					{#if label}
						{@const at = ((index + 0.5) / buckets.length) * 100}
						<!-- Shifted by where it sits, so the end labels tuck inside instead of off the page. -->
						<span
							class="absolute text-[10px] leading-none whitespace-nowrap text-muted"
							style="left: {at}%; transform: translateX(-{at}%)"
						>
							{label}
						</span>
					{/if}
				{/each}
			</div>
		</div>
	</div>

	{#if metric !== 'perArrow' && present.length > 1}
		<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
			{#each present as key (key)}
				<li class="flex items-center gap-1.5 text-[11px] text-muted">
					<span class="h-2.5 w-2.5 rounded-sm" style="background: {colourOf(key)}"></span>
					{labelOf(key)}
				</li>
			{/each}
		</ul>
	{/if}

	{#if shown}
		<dl class="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-sunk p-2 text-center">
			<div>
				<dd class="tabular text-sm font-semibold">{shown.arrows}</dd>
				<dt class="text-[10px] text-muted">{$t('stats.totalArrows')}</dt>
			</div>
			<div>
				<dd class="tabular text-sm font-semibold">{shown.rounds}</dd>
				<dt class="text-[10px] text-muted">{$t('stats.roundsShot')}</dt>
			</div>
			<div>
				<dd class="tabular text-sm font-semibold">{shown.perArrow?.toFixed(2) ?? '—'}</dd>
				<dt class="text-[10px] text-muted">{$t('stats.perArrow')}</dt>
			</div>
		</dl>
	{/if}
</div>
