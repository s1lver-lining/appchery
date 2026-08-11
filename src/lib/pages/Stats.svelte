<script lang="ts">
	import { t } from '$lib/i18n';
	import {
		listAllActivities,
		listBows,
		listFavouriteRounds,
		listSessions,
		listShotValues,
		toggleFavouriteRound
	} from '$lib/db/repository';
	import {
		summariseByRound,
		overview,
		inRange,
		dailyVolume,
		consistency,
		progression,
		distribution,
		bandBy,
		windBand,
		type Band,
		WIND_BAND_KEYS,
		type ScoredActivity,
		type StatsRange
	} from '$lib/domain/stats';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Progression from '$lib/ui/Progression.svelte';
	import { dateFormats, expandedRounds, statsRange } from '$lib/prefs';

	let scored = $state<ScoredActivity[]>([]);
	let favourites = $state<Set<string>>(new Set());
	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let bows = $state<Awaited<ReturnType<typeof listBows>>>([]);
	let shots = $state<Awaited<ReturnType<typeof listShotValues>>>([]);
	const RANGE_KEYS: StatsRange[] = ['all', 'year', 'month'];
	// Restored from the last visit, because an archer who cares about this month cares every time.
	let range = $state<StatsRange>(
		RANGE_KEYS.includes($statsRange as StatsRange) ? ($statsRange as StatsRange) : 'all'
	);
	$effect(() => {
		statsRange.set(range);
	});
	let showByRound = $state(false);

	async function refresh() {
		favourites = new Set(await listFavouriteRounds());
		sessions = await listSessions();
		bows = await listBows();
		shots = await listShotValues();
		const activities = await listAllActivities();
		scored = activities
			.filter((a) => a.kind === 'scoring')
			.map((a) => ({
				id: a.id,
				sessionId: a.sessionId,
				startedAt: a.startedAt,
				totalScore: a.totalScore,
				arrowsShot: a.arrowsShot,
				count10s: a.count10s,
				countX: a.countX,
				roundDefinitionId: a.roundDefinitionId,
				round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
			}));
	}
	$effect(() => {
		refresh();
	});

	/**
	 * Every figure on the page reads from the selected window, so switching the tab moves the bests
	 * and the averages with it rather than only the chart.
	 */
	const windowed = $derived(inRange(scored, range));
	const totals = $derived(overview(windowed, range === 'month' ? 6 : 12));
	/** Pinned rounds first, then the ones shot most: how often a round comes up is what ranks it. */
	const summaries = $derived(
		[...summariseByRound(windowed)].sort((a, b) => {
			const pinned = Number(favourites.has(b.key)) - Number(favourites.has(a.key));
			return pinned !== 0 ? pinned : b.history.length - a.history.length;
		})
	);

	/** The conditions and the bow live on the session, so every per session figure reads through this. */
	const sessionById = $derived(new Map(sessions.map((session) => [session.id, session])));

	const wind = $derived((activity: ScoredActivity) => {
		const weather = sessionById.get(activity.sessionId)?.weather;
		if (!weather) return null;
		const speed = (JSON.parse(weather) as { windSpeedKmh?: number }).windSpeedKmh;
		return typeof speed === 'number' ? windBand(speed) : null;
	});

	const bowName = $derived((activity: ScoredActivity) => {
		const session = sessionById.get(activity.sessionId);
		if (!session) return null;
		const bow = bows.find((b) => b.id === session.bowId);
		if (bow) return bow.name;
		return session.bowType ? $t(`bow.${session.bowType}`) : null;
	});

	/** Only worth drawing once two bands hold something: one band compares with nothing. */
	const byWind = $derived(bandBy(windowed, wind, WIND_BAND_KEYS));
	const byBow = $derived(bandBy(windowed, bowName));

	const shotsByActivity = $derived(
		shots.reduce<Map<string, { value: number; zoneLabel: string }[]>>((acc, shot) => {
			const bucket = acc.get(shot.activityId);
			if (bucket) bucket.push(shot);
			else acc.set(shot.activityId, [shot]);
			return acc;
		}, new Map())
	);

	/** Where the arrows of one round landed, over every round of that kind in the window. */
	const arrowsOf = $derived((summary: (typeof summaries)[number]) =>
		distribution(summary.history.flatMap((a) => shotsByActivity.get(a.id) ?? []))
	);

	/** Open cards are a reading preference, kept apart from the star, which only ever sorts. */
	const isOpen = $derived((key: string) => $expandedRounds.includes(key));

	function toggleDetails(key: string) {
		expandedRounds.update((keys) =>
			keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
		);
	}

	async function toggleFavourite(key: string) {
		const now = await toggleFavouriteRound(key);
		const next = new Set(favourites);
		if (now) next.add(key);
		else next.delete(key);
		favourites = next;
	}

	const RANGES: { key: StatsRange; label: string }[] = $derived([
		{ key: 'all', label: $t('stats.rangeAll') },
		{ key: 'year', label: $t('stats.rangeYear') },
		{ key: 'month', label: $t('stats.rangeMonth') }
	]);

	/** A month of monthly bars is one bar, so the short window is charted a day at a time. */
	const daily = $derived(range === 'month' ? dailyVolume(windowed, 30) : []);
	const peakDay = $derived(Math.max(1, ...daily.map((d) => d.arrows)));

	/** Sparkline over the round's history, scaled to its own range so small moves stay readable. */
	function sparkline(summary: (typeof summaries)[number]): string {
		const scores = summary.history.map((a) => a.totalScore);
		if (scores.length < 2) return '';
		const min = Math.min(...scores);
		const max = Math.max(...scores);
		const span = max - min || 1;
		return scores
			.map((score, i) => {
				const x = (i / (scores.length - 1)) * 100;
				const y = 24 - ((score - min) / span) * 22;
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}

	const peakMonth = $derived(Math.max(1, ...totals.byMonth.map((m) => m.arrows)));
	const topRoundArrows = $derived(Math.max(1, ...totals.byRound.map((r) => r.arrows)));

	/** Month labels follow the app language, so the chart reads the same way as every other date. */
	const firstOfMonth = (month: string) => {
		const [year, index] = month.split('-').map(Number);
		return new Date(year, index - 1, 1).getTime();
	};
	const monthLabel = $derived((month: string) => $dateFormats.monthNarrow(firstOfMonth(month)));
	const monthTitle = $derived((month: string) => $dateFormats.monthYear(firstOfMonth(month)));
</script>

<!--
	A dot on a shared scale rather than a bar from zero: the differences between two conditions are
	tenths of a point, and a bar chart either flattens them or lies about how big they are.
-->
{#snippet bands(rows: Band[], label: (band: Band) => string)}
	{@const low = Math.min(...rows.map((b) => b.perArrow))}
	{@const high = Math.max(...rows.map((b) => b.perArrow))}
	<dl class="mt-3 space-y-2.5">
		{#each rows as band (band.key)}
			<div class="flex items-center gap-3">
				<dt class="w-20 shrink-0 truncate text-sm text-muted">{label(band)}</dt>
				<span class="relative h-1.5 flex-1 rounded-full bg-sunk">
					<span
						class="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand"
						style="left: {high === low ? 50 : ((band.perArrow - low) / (high - low)) * 92 + 4}%"
					></span>
				</span>
				<dd class="tabular w-20 shrink-0 text-right text-sm font-semibold">
					{band.perArrow.toFixed(2)}
					<span class="text-xs font-normal text-muted">· {band.arrows}</span>
				</dd>
			</div>
		{/each}
	</dl>
{/snippet}

<PageHeader motif="stats" title={$t('stats.title')} />

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<nav class="flex gap-1 rounded-lg bg-sunk p-1">
		{#each RANGES as item (item.key)}
			<button
				class="flex-1 rounded-md py-1.5 text-sm font-medium
					{range === item.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
				onclick={() => (range = item.key)}
			>
				{item.label}
			</button>
		{/each}
	</nav>

	{#if totals.rounds > 0}
		<section class="rounded-xl border border-line bg-surface p-4">
			<h2 class="text-sm font-semibold">{$t('stats.overview')}</h2>

			<div class="mt-3 flex items-end gap-3">
				<div>
					<p class="tabular text-4xl leading-none font-bold text-brand-text">{totals.arrows}</p>
					<p class="mt-1 text-xs text-muted">{$t('stats.totalArrows')}</p>
				</div>
				<dl class="ml-auto grid grid-cols-2 gap-x-5 text-right">
					<div>
						<dd class="tabular text-lg font-semibold">{totals.days}</dd>
						<dt class="text-[11px] text-muted">{$t('stats.daysShot')}</dt>
					</div>
					<div>
						<dd class="tabular text-lg font-semibold">{totals.rounds}</dd>
						<dt class="text-[11px] text-muted">{$t('stats.roundsShot')}</dt>
					</div>
				</dl>
			</div>

			<h3 class="mt-4 mb-2 text-xs font-semibold text-muted">
				{range === 'month' ? $t('stats.volumeDaily') : $t('stats.volume')}
			</h3>
			{#if range === 'month'}
				<div class="flex h-28 items-end gap-px">
					{#each daily as day (day.at)}
						<div class="flex flex-1 flex-col items-center gap-1" title={$dateFormats.date(day.at)}>
							<!-- A hairline for a rest day, so the axis stays legible where nothing was shot. -->
							<div
								class="w-full rounded-t {day.arrows > 0 ? 'bg-brand' : 'bg-line'}"
								style="height: {day.arrows > 0 ? Math.max(4, (day.arrows / peakDay) * 88) : 2}px"
							></div>
						</div>
					{/each}
				</div>
				<!-- One label per week: thirty of them would be unreadable at this width. -->
				<div class="mt-1 flex gap-px">
					{#each daily as day, i (day.at)}
						<span class="flex-1 text-center text-[10px] leading-none text-muted">
							{i % 7 === 0 ? new Date(day.at).getDate() : ''}
						</span>
					{/each}
				</div>
			{:else}
				<div class="flex h-28 items-end gap-1">
					{#each totals.byMonth as month (month.month)}
						<div class="flex flex-1 flex-col items-center gap-1" title={monthTitle(month.month)}>
							<!-- A hairline for an empty month, so the axis stays legible where nothing was shot. -->
							<div
								class="w-full rounded-t {month.arrows > 0 ? 'bg-brand' : 'bg-line'}"
								style="height: {month.arrows > 0
									? Math.max(6, (month.arrows / peakMonth) * 88)
									: 2}px"
							></div>
							<span class="text-[10px] leading-none text-muted">{monthLabel(month.month)}</span>
						</div>
					{/each}
				</div>
			{/if}

			<button
				class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium"
				onclick={() => (showByRound = true)}
			>
				<Icon name="chart" size={16} />
				{$t('stats.byRoundOpen')}
			</button>
		</section>
	{:else}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('stats.emptyRange')}
		</p>
	{/if}

	{#if summaries.length === 0}
		<!-- Only worth saying when something was shot: an empty window already says so above. -->
		{#if totals.rounds > 0}
			<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
				{$t('stats.empty')}
			</p>
		{/if}
	{:else}
		<div>
			<h2 class="text-sm font-semibold">{$t('stats.perRoundTitle')}</h2>
			<p class="text-xs text-muted">{$t('stats.perRoundHint')}</p>
		</div>

		{#each summaries as summary (summary.key)}
			<section class="rounded-xl border border-line bg-surface p-4">
				<div class="flex items-baseline justify-between gap-2">
					<h3 class="font-semibold">{summary.name}</h3>
					<span class="ml-auto text-xs text-muted">
						{$t('stats.rounds', { n: summary.history.length })}
					</span>
					<button
						class="-my-1 -mr-1 shrink-0 self-center p-1 transition-colors {favourites.has(
							summary.key
						)
							? 'text-brand-text'
							: 'text-muted'}"
						aria-pressed={favourites.has(summary.key)}
						aria-label={favourites.has(summary.key)
							? $t('stats.unfavourite')
							: $t('stats.favourite')}
						onclick={() => toggleFavourite(summary.key)}
					>
						<Icon name="star" size={20} filled={favourites.has(summary.key)} />
					</button>
				</div>

				<div class="mt-3 flex items-end gap-6">
					<div>
						<p class="tabular text-3xl font-bold">{summary.best.totalScore}</p>
						<p class="text-xs text-muted">{$t('stats.personalBest')}</p>
					</div>
					<div>
						<p class="tabular text-xl font-semibold">{summary.average.toFixed(0)}</p>
						<p class="text-xs text-muted">{$t('stats.average')}</p>
					</div>
					{#if summary.trend !== null}
						<div>
							<p
								class="tabular text-xl font-semibold {summary.trend >= 0
									? 'text-brand-text'
									: 'text-danger'}"
							>
								{summary.trend >= 0 ? '+' : ''}{summary.trend.toFixed(2)}
							</p>
							<p class="text-xs text-muted">{$t('stats.trend')}</p>
						</div>
					{/if}
					{#if consistency(summary.history) !== null}
						<div>
							<!-- Lower is steadier, which is the opposite of every other figure on the card. -->
							<p class="tabular text-xl font-semibold">±{consistency(summary.history)!.toFixed(2)}</p>
							<p class="text-xs text-muted">{$t('stats.spread')}</p>
						</div>
					{/if}
				</div>

				{#if summary.history.length > 1}
					{#if isOpen(summary.key)}
						<!-- A pinned round earns the room for the running average and the record marks. -->
						<Progression
							points={progression(summary.history)}
							lowLabel={$dateFormats.shortDate(summary.history[0].startedAt)}
							highLabel={$dateFormats.shortDate(
								summary.history[summary.history.length - 1].startedAt
							)}
						/>
					{:else}
						<svg viewBox="0 0 100 26" preserveAspectRatio="none" class="mt-3 h-12 w-full">
							<path
								d={sparkline(summary)}
								fill="none"
								stroke="currentColor"
								class="text-brand-text"
								stroke-width="1.4"
								vector-effect="non-scaling-stroke"
							/>
						</svg>
					{/if}
				{/if}

				{#if isOpen(summary.key)}
					{@const arrows = arrowsOf(summary)}
					{#if arrows.length > 0}
						{@const peak = Math.max(...arrows.map((a) => a.count))}
						{@const total = arrows.reduce((sum, a) => sum + a.count, 0)}
						<h4 class="mt-4 text-xs font-semibold text-muted">{$t('stats.distribution')}</h4>
						<!-- Where the arrows actually landed: the total alone never says which zone to work on. -->
						<div class="mt-2 flex h-20 items-end gap-1">
							{#each arrows as zone (zone.label)}
								<div
									class="flex flex-1 flex-col items-center gap-1"
									title="{zone.count} · {((zone.count / total) * 100).toFixed(0)}%"
								>
									<span class="tabular text-[10px] leading-none text-muted">{zone.count}</span>
									<div
										class="w-full rounded-t bg-brand/70"
										style="height: {Math.max(2, (zone.count / peak) * 52)}px"
									></div>
									<span class="tabular text-[10px] leading-none font-medium">{zone.label}</span>
								</div>
							{/each}
						</div>
					{/if}
				{/if}

				<div class="mt-2 flex items-end justify-between gap-3">
					<p class="text-xs text-muted">
						{$t('stats.bestOn', { date: $dateFormats.date(summary.best.startedAt) })}
						· {summary.best.count10s}
						{$t('score.tens')} · {summary.best.countX}
						{$t('score.xs')}
					</p>
					<button
						class="-mr-1 -mb-1 flex shrink-0 items-center gap-1 p-1 text-xs font-medium text-muted"
						aria-expanded={isOpen(summary.key)}
						onclick={() => toggleDetails(summary.key)}
					>
						{isOpen(summary.key) ? $t('stats.less') : $t('stats.more')}
						<span class="transition-transform {isOpen(summary.key) ? '' : 'rotate-180'}">
							<Icon name="chevronUp" size={16} />
						</span>
					</button>
				</div>
			</section>
		{/each}
	{/if}

	{#if byWind.length > 1}
		<section class="rounded-xl border border-line bg-surface p-4">
			<h2 class="text-sm font-semibold">{$t('stats.byWind')}</h2>
			<p class="text-xs text-muted">{$t('stats.perArrowHint')}</p>
			{@render bands(byWind, (band) => $t(`stats.wind.${band.key}`))}
		</section>
	{/if}

	{#if byBow.length > 1}
		<section class="rounded-xl border border-line bg-surface p-4">
			<h2 class="text-sm font-semibold">{$t('stats.byBow')}</h2>
			<p class="text-xs text-muted">{$t('stats.perArrowHint')}</p>
			{@render bands(byBow, (band) => band.key)}
		</section>
	{/if}
</div>

{#if showByRound}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
			aria-label={$t('common.close')}
			onclick={() => (showByRound = false)}
		></button>

		<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
			<div class="mb-1 flex items-center justify-between">
				<h2 class="text-lg font-bold">{$t('stats.byRound')}</h2>
				<button
					class="text-muted"
					aria-label={$t('common.close')}
					onclick={() => (showByRound = false)}
				>
					<Icon name="close" size={20} />
				</button>
			</div>
			<p class="mb-3 text-xs text-muted">{$t('stats.byRoundHint')}</p>

			<ul class="max-h-[60dvh] space-y-1.5 overflow-y-auto">
				{#each totals.byRound as row (row.name)}
					<li class="flex items-center gap-2 text-sm">
						<span class="w-24 shrink-0 truncate text-muted">{row.name}</span>
						<span class="h-2 flex-1 rounded-full bg-sunk">
							<span
								class="block h-full rounded-full bg-brand"
								style="width: {(row.arrows / topRoundArrows) * 100}%"
							></span>
						</span>
						<span class="tabular w-10 shrink-0 text-right font-semibold">{row.arrows}</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
