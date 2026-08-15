<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import Sheet from './Sheet.svelte';
	import {
		DIMENSIONS,
		EMPTY_FILTER,
		activeCount,
		toggleValue,
		type Facet,
		type StatsDimension,
		type StatsFilter,
		type StatsPeriod
	} from '$lib/domain/statsFilter';

	/**
	 * What the page is looking at, as a row of chips. One chip per dimension rather than a single
	 * filter sheet, so what is narrowing the numbers is readable without opening anything.
	 */
	let {
		filter = $bindable(),
		facetsOf,
		labelOf,
		countOf,
		summary
	}: {
		filter: StatsFilter;
		facetsOf: (dimension: StatsDimension) => Facet[];
		/** Asked for a shorter name when the row would otherwise not fit on one line. */
		labelOf: (dimension: StatsDimension, key: string, short?: boolean) => string;
		/** What a facet is counted in, since not every option on the round chip is a round. */
		countOf: (dimension: StatsDimension, facet: Facet) => string;
		/** What the current filter leaves, so the figures below are never read as the whole history. */
		summary: string;
	} = $props();

	const PERIODS: StatsPeriod[] = ['all', 'thisYear', 'year', 'month', 'custom'];

	let openSheet = $state<StatsDimension | 'period' | null>(null);

	const active = $derived(activeCount(filter));

	const pad = (n: number) => String(n).padStart(2, '0');
	const asField = (at: number | null) => {
		if (at === null) return '';
		const date = new Date(at);
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	};
	const fromField = (value: string) => {
		const [year, month, day] = value.split('-').map(Number);
		return year && month && day ? new Date(year, month - 1, day).getTime() : null;
	};

	/** Naming the value rather than the dimension while one is chosen: the chip is the answer. */
	function chipLabel(dimension: StatsDimension, short: boolean): string {
		const chosen = filter[dimension];
		if (chosen.length === 0) return $t(`stats.filter.${dimension}`);
		if (chosen.length === 1) {
			const label = labelOf(dimension, chosen[0], short);
			// A round name is the longest thing on the row, and its tail is the part that repeats.
			return short && label.length > 12 ? `${label.slice(0, 11).trimEnd()}…` : label;
		}
		return `${$t(`stats.filter.${dimension}`)} · ${chosen.length}`;
	}

	const periodLabel = (short: boolean) =>
		$t(`stats.period.${filter.period}${short ? 'Short' : ''}`);

	const shown = $derived((short: boolean) => [
		{ key: 'period', label: periodLabel(short), on: filter.period !== 'all' },
		...DIMENSIONS.filter(
			(dimension) => facetsOf(dimension).length > 1 || filter[dimension].length > 0
		).map((dimension) => ({
			key: dimension,
			label: chipLabel(dimension, short),
			on: filter[dimension].length > 0
		}))
	]);

	/**
	 * The row is meant to be read at a glance, so it is kept on one line: the labels shorten first,
	 * then the whole row shrinks a little, and only past that does it wrap. A row that scrolls
	 * sideways hides the chips on its right, and an archer never finds out they are there.
	 */
	const FLOOR = 0.75;
	const ICON = 13;
	let available = $state(0);
	let fullWidth = $state(0);
	let shortWidth = $state(0);
	let floorWidth = $state(0);

	/** Two pixels of slack, because a row solved to fit exactly still rounds its way over the edge. */
	const room = $derived(Math.max(0, available - 2));

	const short = $derived(available > 0 && fullWidth > room);
	/** Below the floor the labels would be unreadable, so the row is allowed a second line instead. */
	const wraps = $derived(short && floorWidth > room);

	/**
	 * Measured at both ends rather than multiplied out: the chevrons and the gaps between chips do
	 * not shrink with the text, so a row at three quarter size is wider than three quarters of a row,
	 * and guessing at it is what let the chips run over the margin.
	 */
	const scale = $derived.by(() => {
		if (wraps || !short || shortWidth <= room) return 1;
		const slope = (shortWidth - floorWidth) / (1 - FLOOR);
		if (slope <= 0) return FLOOR;
		const fixed = shortWidth - slope;
		return Math.min(1, Math.max(FLOOR, (room - fixed) / slope));
	});
	const iconSize = $derived(Math.round(ICON * scale));

	function clear(dimension: StatsDimension) {
		filter = { ...filter, [dimension]: [] };
	}
</script>

{#snippet chip(label: string, on: boolean, icon: number, onclick?: () => void)}
	<!-- Sized in em so one font size on the row scales the padding and the gaps with the text. -->
	<button
		class="flex shrink-0 items-center gap-[0.35em] rounded-full border font-medium whitespace-nowrap
			{on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-muted'}"
		style="padding: 0.35em 0.6em 0.35em 0.85em"
		aria-pressed={on}
		onclick={onclick ?? (() => {})}
		tabindex={onclick ? 0 : -1}
	>
		{label}
		<span class="rotate-180"><Icon name="chevronUp" size={icon} /></span>
	</button>
{/snippet}

{#snippet row(labels: { key: string; label: string; on: boolean }[], icon: number)}
	{#each labels as item (item.key)}
		{@render chip(item.label, item.on, icon)}
	{/each}
{/snippet}

<div class="relative" bind:clientWidth={available}>
	<div class="flex gap-[0.6em] {wraps ? 'flex-wrap' : ''}" style="font-size: {scale * 0.875}rem">
		{#each shown(short) as item (item.key)}
			{@render chip(
				item.label,
				item.on,
				iconSize,
				() => (openSheet = item.key as StatsDimension | 'period')
			)}
		{/each}
	</div>

	<!--
		The same row three times off screen: full size, abbreviated, and abbreviated at the smallest
		size allowed. The visible row cannot be measured at a size it is not being drawn at without the
		measurement chasing its own tail, and the smallest is what says whether one line is possible.
	-->
	<div class="pointer-events-none invisible absolute top-0 left-0 flex" aria-hidden="true">
		<div class="flex gap-[0.6em] text-sm" bind:clientWidth={fullWidth}>
			{@render row(shown(false), ICON)}
		</div>
		<div class="flex gap-[0.6em] text-sm" bind:clientWidth={shortWidth}>
			{@render row(shown(true), ICON)}
		</div>
		<div
			class="flex gap-[0.6em]"
			style="font-size: {FLOOR * 0.875}rem"
			bind:clientWidth={floorWidth}
		>
			{@render row(shown(true), Math.round(ICON * FLOOR))}
		</div>
	</div>
</div>

<!-- Set the same distance from the chips as from the card below, so it belongs to neither. -->
<div class="mt-4 flex items-baseline justify-between gap-3">
	<p class="text-xs text-muted">{summary}</p>
	{#if active > 0}
		<button
			class="shrink-0 text-xs font-medium text-brand-text"
			onclick={() => (filter = EMPTY_FILTER)}
		>
			{$t('stats.filter.reset')}
		</button>
	{/if}
</div>

<Sheet
	open={openSheet === 'period'}
	title={$t('stats.filter.period')}
	onclose={() => (openSheet = null)}
>
	<ul class="space-y-1">
		{#each PERIODS as period (period)}
			<li>
				<button
					class="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm
						{filter.period === period ? 'bg-sunk font-semibold' : ''}"
					aria-pressed={filter.period === period}
					onclick={() => (filter = { ...filter, period })}
				>
					<span class="flex-1">{$t(`stats.period.${period}`)}</span>
					{#if filter.period === period}
						<span class="text-brand-text"><Icon name="check" size={16} /></span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>

	{#if filter.period === 'custom'}
		<div class="mt-2 flex items-center gap-2 border-t border-line pt-3">
			<input
				type="date"
				class="tabular min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
				aria-label={$t('stats.filter.from')}
				value={asField(filter.from)}
				onchange={(event) =>
					(filter = { ...filter, from: fromField(event.currentTarget.value) })}
			/>
			<span class="text-xs text-muted">{$t('stats.filter.to')}</span>
			<input
				type="date"
				class="tabular min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm text-ink"
				aria-label={$t('stats.filter.to')}
				value={asField(filter.to)}
				onchange={(event) => (filter = { ...filter, to: fromField(event.currentTarget.value) })}
			/>
		</div>
	{/if}
</Sheet>

{#each DIMENSIONS as dimension (dimension)}
	<Sheet
		open={openSheet === dimension}
		title={$t(`stats.filter.${dimension}`)}
		onclose={() => (openSheet = null)}
	>
		<ul class="space-y-1">
			{#each facetsOf(dimension) as facet (facet.key)}
				<li>
					<button
						class="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm
							{facet.selected ? 'bg-sunk font-semibold' : ''}"
						aria-pressed={facet.selected}
						onclick={() => (filter = toggleValue(filter, dimension, facet.key))}
					>
						<span class="flex-1 truncate">{labelOf(dimension, facet.key)}</span>
						<!-- The count is what says whether a slice holds enough to mean anything. -->
						<span class="tabular shrink-0 text-xs text-muted">
							{countOf(dimension, facet)}
						</span>
						{#if facet.selected}
							<span class="text-brand-text"><Icon name="check" size={16} /></span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>

		{#snippet footer()}
			<button
				class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
				onclick={() => clear(dimension)}
			>
				{$t('stats.filter.clearOne')}
			</button>
			<button
				class="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
				onclick={() => (openSheet = null)}
			>
				{$t('common.done')}
			</button>
		{/snippet}
	</Sheet>
{/each}
