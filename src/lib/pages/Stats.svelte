<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		listAllActivities,
		listBows,
		listFavouriteRounds,
		listSessions,
		listShotValues,
		listEndTotals,
		toggleFavouriteRound
	} from '$lib/db/repository';
	import {
		summariseByRound,
		overview,
		distribution,
		bandBy,
		windBand,
		roundKey,
		roundName,
		volumeSeries,
		pickGrain,
		scoreByEndPosition,
		temperatureBand,
		WIND_BAND_KEYS,
		TEMPERATURE_BAND_KEYS,
		type ScoredActivity
	} from '$lib/domain/stats';
	import {
		applyFilter,
		facets,
		periodBounds,
		type StatsDimension
	} from '$lib/domain/statsFilter';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import FilterBar from '$lib/ui/FilterBar.svelte';
	import VolumeChart from '$lib/ui/VolumeChart.svelte';
	import BandChart from '$lib/ui/BandChart.svelte';
	import RoundCard from '$lib/ui/RoundCard.svelte';
	import DistributionChart from '$lib/ui/DistributionChart.svelte';
	import BlocksDialog from '$lib/ui/BlocksDialog.svelte';
	import { timeOfDay } from '$lib/domain/dates';
	import { getScoreSet, WA_10_RING } from '$lib/domain/rounds/seed';
	import { expandedRounds, statsFilter, statsBlocks, dateFormats } from '$lib/prefs';

	let scored = $state<ScoredActivity[]>([]);
	let favourites = $state<Set<string>>(new Set());
	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let bows = $state<Awaited<ReturnType<typeof listBows>>>([]);
	let shots = $state<Awaited<ReturnType<typeof listShotValues>>>([]);
	let ends = $state<Awaited<ReturnType<typeof listEndTotals>>>([]);
	let showByRound = $state(false);
	let showBlocks = $state(false);

	async function refresh() {
		favourites = new Set(await listFavouriteRounds());
		sessions = await listSessions();
		bows = await listBows();
		shots = await listShotValues();
		ends = await listEndTotals();
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

	/** The conditions, the bow and the kind live on the session, so every slice reads through this. */
	const sessionById = $derived(new Map(sessions.map((session) => [session.id, session])));

	/** A generic bow type is a bow to the archer, so it stands beside the ones they recorded. */
	const bowOf = (activity: ScoredActivity) => {
		const session = sessionById.get(activity.sessionId);
		if (!session) return null;
		if (session.bowId) return `bow:${session.bowId}`;
		return session.bowType ? `type:${session.bowType}` : null;
	};

	const windOf = (activity: ScoredActivity) => {
		const weather = sessionById.get(activity.sessionId)?.weather;
		if (!weather) return null;
		const speed = (JSON.parse(weather) as { windSpeedKmh?: number }).windSpeedKmh;
		return typeof speed === 'number' ? windBand(speed) : null;
	};

	const kindOf = (activity: ScoredActivity) => sessionById.get(activity.sessionId)?.kind ?? null;

	const ctx = $derived({ round: roundKey, bow: bowOf, kind: kindOf, wind: windOf });

	/** Every figure on the page reads the same slice, so a chip moves the bests with the chart. */
	const windowed = $derived(applyFilter(scored, ctx, $statsFilter));
	const totals = $derived(overview(windowed));
	const bounds = $derived(periodBounds($statsFilter, scored));
	const grain = $derived(pickGrain(bounds.from, bounds.to));
	/** Fixed so a filtered out kind never repaints the ones that are left. */
	const KINDS = ['practice', 'competition', 'qualification'];
	const buckets = $derived(
		volumeSeries(windowed, bounds.from, bounds.to, grain, (a) => kindOf(a) ?? 'practice')
	);

	const bowLabel = (key: string) => {
		if (key.startsWith('type:')) return $t(`bow.${key.slice(5)}`);
		return bows.find((bow) => bow.id === key.slice(4))?.name ?? $t('session.noBow');
	};
	const kindColour = (kind: string) =>
		KINDS.includes(kind) ? `var(--c-kind-${kind})` : 'var(--color-muted)';

	/** Pinned rounds first, then the ones shot most: how often a round comes up is what ranks it. */
	const summaries = $derived(
		summariseByRound(windowed).sort((a, b) => {
			const pinned = Number(favourites.has(b.key)) - Number(favourites.has(a.key));
			return pinned !== 0 ? pinned : b.history.length - a.history.length;
		})
	);
	/** Only the rounds the rules define: a one off practice shape has nothing to compare against. */
	const standard = $derived(summaries.filter((summary) => summary.known));

	/**
	 * Named from the rounds themselves rather than from the summaries, so a round still being shot is
	 * named in the filters too: it earns a card only once it is finished, but it exists from the first
	 * arrow. Over the whole history, so a name survives a filter that hides every round holding it.
	 */
	const roundNames = $derived(
		new Map(scored.map((activity) => [roundKey(activity), roundName(activity.round)]))
	);

	function labelOf(dimension: StatsDimension, key: string, short = false): string {
		if (dimension === 'bows') return bowLabel(key);
		if (dimension === 'kinds') return $t(`sessions.${key}${short ? 'Short' : ''}`);
		if (dimension === 'wind') return $t(`stats.wind.${key}`);
		return roundNames.get(key) ?? key;
	}

	const facetsOf = $derived((dimension: StatsDimension) =>
		facets(scored, ctx, $statsFilter, dimension)
	);

	const temperatureOf = (activity: ScoredActivity) => {
		const weather = sessionById.get(activity.sessionId)?.weather;
		if (!weather) return null;
		const celsius = (JSON.parse(weather) as { temperatureC?: number }).temperatureC;
		return typeof celsius === 'number' ? temperatureBand(celsius) : null;
	};

	const partOfDayOf = (activity: ScoredActivity) => timeOfDay(activity.startedAt);
	const PARTS_OF_DAY = ['morning', 'afternoon', 'evening', 'night'];

	/** Monday first, the way a training week reads, rather than the Sunday based day number. */
	const weekdayOf = (activity: ScoredActivity) =>
		String((new Date(activity.startedAt).getDay() + 6) % 7);
	const WEEKDAYS = ['0', '1', '2', '3', '4', '5', '6'];
	/** Formatted off a known Monday, so the names follow the app language like every other date. */
	const weekdayLabel = $derived((key: string) =>
		$dateFormats.weekdayShort(new Date(2024, 0, 1 + Number(key)).getTime())
	);

	const placeOf = (activity: ScoredActivity) =>
		sessionById.get(activity.sessionId)?.location || null;

	const byWind = $derived(bandBy(windowed, windOf, WIND_BAND_KEYS));
	const byKind = $derived(bandBy(windowed, kindOf, KINDS));
	const byBow = $derived(bandBy(windowed, bowOf));
	const byTemperature = $derived(bandBy(windowed, temperatureOf, TEMPERATURE_BAND_KEYS));
	const byPartOfDay = $derived(bandBy(windowed, partOfDayOf, PARTS_OF_DAY));
	const byWeekday = $derived(bandBy(windowed, weekdayOf, WEEKDAYS));
	const byPlace = $derived(bandBy(windowed, placeOf));

	/**
	 * How the score moves through a round. Only worth drawing over one kind of round, since a 6 arrow
	 * end and a 3 arrow end are different questions and mixing them makes the shape of neither.
	 */
	const endCurve = $derived(
		$statsFilter.rounds.length === 1
			? scoreByEndPosition(
					ends.filter((end) => windowed.some((activity) => activity.id === end.activityId))
				)
			: []
	);
	const endBest = $derived(Math.max(...endCurve.map((point) => point.perArrow)));
	const endWorst = $derived(Math.min(...endCurve.map((point) => point.perArrow)));
	const endSpread = $derived(endBest - endWorst);

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

	/**
	 * Stars set before rounds were grouped by shape were keyed on the round definition, so both keys
	 * count as pinned and an old favourite survives.
	 */
	const isFavourite = $derived((summary: (typeof summaries)[number]) =>
		favourites.has(summary.key) ||
		summary.history.some((a) => a.roundDefinitionId !== null && favourites.has(a.roundDefinitionId))
	);

	async function toggleFavourite(key: string) {
		const now = await toggleFavouriteRound(key);
		const next = new Set(favourites);
		if (now) next.add(key);
		else next.delete(key);
		favourites = next;
	}

	const topRoundArrows = $derived(Math.max(1, ...totals.byRound.map((r) => r.arrows)));

	/** Every arrow of the slice at once, whatever it was shot at. */
	const allArrows = $derived(
		distribution(windowed.flatMap((activity) => shotsByActivity.get(activity.id) ?? []))
	);
	/**
	 * Coloured on the score set the slice was mostly shot on. Two score sets in one slice would need
	 * two charts, and the zone labels of the second would land on the first one's colours.
	 */
	const sliceZones = $derived(
		getScoreSet(windowed.find((a) => a.round)?.round?.scoreSetId ?? WA_10_RING.id).zones
	);

	/**
	 * The blocks below the chart. Everything except the two an archer looks at every time starts off,
	 * so the page opens short and grows only where they asked a question.
	 */
	const BLOCKS = $derived([
		{ key: 'kind', on: true, available: byKind.length > 1 },
		{ key: 'bests', on: true, available: standard.length > 0 },
		{ key: 'wind', on: true, available: byWind.length > 1 },
		{ key: 'byEnd', on: true, available: endCurve.length > 1 },
		{ key: 'bow', on: false, available: byBow.length > 1 },
		{ key: 'temperature', on: false, available: byTemperature.length > 1 },
		{ key: 'partOfDay', on: false, available: byPartOfDay.length > 1 },
		{ key: 'weekday', on: false, available: byWeekday.length > 1 },
		{ key: 'place', on: false, available: byPlace.length > 1 },
		{ key: 'distribution', on: false, available: allArrows.length > 0 },
		{ key: 'volumeByRound', on: false, available: totals.byRound.length > 1 }
	]);

	const shows = $derived(
		(key: string) => $statsBlocks[key] ?? BLOCKS.find((block) => block.key === key)?.on ?? false
	);

	function toggleBlock(key: string, on: boolean) {
		statsBlocks.update((blocks) => ({ ...blocks, [key]: on }));
	}
</script>

<PageHeader motif="stats" title={$t('stats.title')}>
	{#snippet actions()}
		<MoreMenu
			label={$t('common.more')}
			icon="dots"
			placement="down"
			wrapperClass=""
			triggerClass="flex items-center justify-center rounded-lg p-1.5 text-muted"
			items={[
				{ label: $t('stats.byRoundOpen'), icon: 'chart', onselect: () => (showByRound = true) },
				{ label: $t('stats.blocks.title'), icon: 'sliders', onselect: () => (showBlocks = true) },
				{ label: $t('badges.title'), icon: 'medal', onselect: () => goto('/badges?from=/stats') },
				{ label: $t('help.title'), icon: 'help', onselect: () => goto('/help/stats') }
			]}
		/>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<!-- Pulled up towards the header: the chips belong to it more than to the cards below them. -->
	<div class="-mt-2">
			<FilterBar
			bind:filter={$statsFilter}
			{facetsOf}
			{labelOf}
			summary={$t('stats.slice', { rounds: totals.rounds, arrows: totals.arrows })}
		/>
	</div>

	{#if totals.rounds === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('stats.emptyRange')}
		</p>
	{:else}
		<VolumeChart
			{buckets}
			{grain}
			keys={KINDS}
			colourOf={kindColour}
			labelOf={(kind) => $t(`sessions.${kind}`)}
		/>

		<dl class="grid grid-cols-3 gap-3">
			{#each [{ value: totals.days, label: $t('stats.daysShot') }, { value: totals.rounds, label: $t('stats.roundsShot') }, { value: totals.averagePerArrow.toFixed(2), label: $t('stats.perArrow') }] as tile (tile.label)}
				<div class="rounded-xl border border-line bg-surface p-3 text-center">
					<dd class="tabular text-xl font-semibold">{tile.value}</dd>
					<dt class="mt-0.5 text-[11px] text-muted">{tile.label}</dt>
				</div>
			{/each}
		</dl>

		<div class="grid gap-4 sm:grid-cols-2">
			{#if shows('kind') && byKind.length > 1}
				<BandChart
					title={$t('stats.byKind')}
					bands={byKind}
					labelOf={(band) => $t(`sessions.${band.key}`)}
					colourOf={(band) => kindColour(band.key)}
				/>
			{/if}
			{#if shows('wind') && byWind.length > 1}
				<BandChart
					title={$t('stats.byWind')}
					bands={byWind}
					labelOf={(band) => $t(`stats.wind.${band.key}`)}
				/>
			{/if}
			{#if shows('bow') && byBow.length > 1}
				<BandChart title={$t('stats.byBow')} bands={byBow} labelOf={(band) => bowLabel(band.key)} />
			{/if}
			{#if shows('temperature') && byTemperature.length > 1}
				<BandChart
					title={$t('stats.byTemperature')}
					bands={byTemperature}
					labelOf={(band) => $t(`stats.temperature.${band.key}`)}
				/>
			{/if}
			{#if shows('partOfDay') && byPartOfDay.length > 1}
				<BandChart
					title={$t('stats.byPartOfDay')}
					bands={byPartOfDay}
					labelOf={(band) => $t(`stats.partOfDay.${band.key}`)}
				/>
			{/if}
			{#if shows('weekday') && byWeekday.length > 1}
				<BandChart
					title={$t('stats.byWeekday')}
					bands={byWeekday}
					labelOf={(band) => weekdayLabel(band.key)}
				/>
			{/if}
			{#if shows('place') && byPlace.length > 1}
				<BandChart title={$t('stats.byPlace')} bands={byPlace} labelOf={(band) => band.key} />
			{/if}
			{#if shows('distribution') && allArrows.length > 0}
				<section class="rounded-xl border border-line bg-surface p-4">
					<h2 class="text-sm font-semibold">{$t('stats.distribution')}</h2>
					<p class="text-xs text-muted">{$t('stats.distributionHint')}</p>
					<DistributionChart arrows={allArrows} zones={sliceZones} height={64} />
				</section>
			{/if}
			{#if shows('volumeByRound') && totals.byRound.length > 1}
				<section class="rounded-xl border border-line bg-surface p-4">
					<h2 class="text-sm font-semibold">{$t('stats.byRound')}</h2>
					<p class="text-xs text-muted">{$t('stats.byRoundHint')}</p>
					<ul class="mt-3 space-y-1.5">
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
				</section>
			{/if}
			{#if shows('byEnd') && endCurve.length > 1}
				<!-- Where a round is won and lost: the first end cold, the last end tired. -->
				<section class="rounded-xl border border-line bg-surface p-4">
					<h2 class="text-sm font-semibold">{$t('stats.byEnd')}</h2>
					<p class="text-xs text-muted">{$t('stats.byEndHint')}</p>

					<ul class="mt-3 space-y-1">
						{#each endCurve as point (point.position)}
							<li class="flex items-center gap-2 text-sm">
								<span class="tabular w-12 shrink-0 text-xs text-muted">
									{$t('score.end', { n: point.position })}
								</span>
								<span class="h-2.5 flex-1 rounded-full bg-sunk">
									<!-- Scaled between the weakest and strongest position: a bar from zero would make
										every end look alike, and the whole point is the difference between them. -->
									<span
										class="block h-full rounded-full {point.perArrow === endBest
											? 'bg-accent'
											: 'bg-brand'}"
										style="width: {endSpread === 0
											? 100
											: 12 + ((point.perArrow - endWorst) / endSpread) * 88}%"
									></span>
								</span>
								<span class="tabular w-10 shrink-0 text-right font-semibold">
									{point.perArrow.toFixed(2)}
								</span>
							</li>
						{/each}
					</ul>
					<p class="mt-2 text-xs text-muted">{$t('stats.byEndCount', { n: endCurve[0].ends })}</p>
				</section>
			{/if}
		</div>

		{#if !shows('bests')}
			<!-- Nothing: the archer switched the personal bests off. -->
		{:else if standard.length === 0}
			<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
				{$t('stats.empty')}
			</p>
		{:else}
			<div>
				<h2 class="text-sm font-semibold">{$t('stats.perRoundTitle')}</h2>
				<p class="text-xs text-muted">{$t('stats.perRoundHint')}</p>
			</div>

			{#each standard as summary (summary.key)}
				<RoundCard
					{summary}
					arrows={arrowsOf(summary)}
					favourite={isFavourite(summary)}
					open={isOpen(summary.key)}
					ontoggleFavourite={() => toggleFavourite(summary.key)}
					ontoggleOpen={() => toggleDetails(summary.key)}
				/>
			{/each}
		{/if}
	{/if}
</div>

<!-- Every arrow, whatever it was shot at, which is the one place the practice shapes are counted. -->
<Sheet open={showByRound} title={$t('stats.byRound')} onclose={() => (showByRound = false)}>
	<p class="mb-3 text-xs text-muted">{$t('stats.byRoundHint')}</p>
	<ul class="space-y-1.5">
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
</Sheet>

<BlocksDialog
	open={showBlocks}
	blocks={BLOCKS}
	enabled={shows}
	onclose={() => (showBlocks = false)}
	ontoggle={toggleBlock}
/>
