<script lang="ts">
	import { page } from '$app/stores';
	import { dataVersion } from '$lib/db/changed';
	import { t } from '$lib/i18n';
	import { loadExperienceInput } from '$lib/db/repository';
	import {
		experience,
		XP_SOURCES,
		XP_PER_ARROW,
		XP_PER_ROUND_ARROW,
		XP_MATCH_WIN,
		SCORE_FLOOR,
		DRAW_SHARE,
		LEVEL_STEP,
		MIN_DIFFICULTY,
		MAX_DIFFICULTY,
		REFERENCE_FACE_CM,
		REFERENCE_DISTANCE_M,
		type Experience,
		type XpSource
	} from '$lib/domain/experience';
	import { formatNumber } from '$lib/prefs';
	import { noteLevel } from '$lib/levelUp';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import ShareDonut from '$lib/ui/ShareDonut.svelte';

	// Reached from the link grid, which sits on the home page and in the settings alike.
	const origin = $derived(originOf($page.url, '/'));
	$effect(() => setPageUp(origin));

	let earned = $state<Experience | null>(null);

	$effect(() => {
		void $dataVersion;
		loadExperienceInput().then((input) => {
			earned = experience(input);
			// Read here too, so a level lost is noticed on the page that exists to show it.
			noteLevel(earned.level);
		});
	});

	const COLOURS: Record<XpSource, string> = {
		arrows: 'var(--c-xp-arrows)',
		rounds: 'var(--c-xp-rounds)',
		badges: 'var(--c-xp-badges)',
		matches: 'var(--c-xp-matches)'
	};

	const percentIntoLevel = $derived(
		earned && earned.span > 0 ? (earned.into / earned.span) * 100 : 0
	);
	/**
	 * The rules, each with the sum it is. The figures are read from the domain rather than written out
	 * again here, so a rate that changes changes the page that explains it.
	 */
	const RATES = $derived<
		{ key: string; params: Record<string, string | number>; terms?: string[]; example?: boolean }[]
	>([
		{ key: 'arrows', params: { xp: $formatNumber(XP_PER_ARROW) } },
		{
			key: 'rounds',
			params: {
				xp: $formatNumber(XP_PER_ROUND_ARROW),
				face: $formatNumber(REFERENCE_FACE_CM),
				metres: $formatNumber(REFERENCE_DISTANCE_M),
				floor: $formatNumber(SCORE_FLOOR),
				rest: $formatNumber(1 - SCORE_FLOOR),
				min: $formatNumber(MIN_DIFFICULTY),
				max: $formatNumber(MAX_DIFFICULTY)
			},
			terms: ['difficulty', 'form'],
			example: true
		},
		{ key: 'badges', params: {} },
		{ key: 'matches', params: { xp: $formatNumber(XP_MATCH_WIN), draw: $formatNumber(DRAW_SHARE) } },
		{ key: 'levels', params: { step: $formatNumber(LEVEL_STEP) }, example: true }
	]);

	const share = (xp: number) => (earned && earned.total > 0 ? (xp / earned.total) * 100 : 0);

	/**
	 * Seven figures do not fit the hole in the ring, so past a million the total is read out under
	 * the donut instead of spilling over its own arc.
	 */
	const spills = $derived((earned?.total ?? 0) >= 1000000);
	const slices = $derived(
		earned
			? XP_SOURCES.map((source) => ({
					key: source,
					label: $t(`experience.sourceNames.${source}`),
					value: earned!.sources[source].xp,
					colour: COLOURS[source]
				}))
			: []
	);
</script>

<PageHeader motif="experience" title={$t('experience.title')} subtitle={$t('experience.hint')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

{#if earned}
	<div class="mx-auto w-full max-w-page space-y-5 p-4">
		<!-- The level, what it took, and what the next one asks: the three numbers the page is for. -->
		<section class="rounded-2xl border border-line bg-surface p-4">
			<div class="flex items-baseline justify-between">
				<h2 class="text-2xl font-bold text-brand-text">
					{$t('experience.level', { level: earned.level })}
				</h2>
				<!-- How far through the level, not how much has been earned: the total is the donut's job. -->
				<p class="tabular text-lg font-semibold">
					{$t('experience.share', { percent: percentIntoLevel.toFixed(0) })}
				</p>
			</div>

			<div class="mt-3 h-2.5 overflow-hidden rounded-full bg-sunk">
				<div
					class="h-full rounded-full bg-brand"
					style="width: {percentIntoLevel}%"
				></div>
			</div>

			<div class="mt-2 flex items-baseline justify-between text-xs text-muted">
				<p class="tabular">
					{$t('experience.intoLevel', {
						into: $formatNumber(earned.into),
						span: $formatNumber(earned.span)
					})}
				</p>
				<p class="tabular">
					{$t('experience.toNext', {
						xp: $formatNumber(earned.toNext),
						level: earned.level + 1
					})}
				</p>
			</div>
		</section>

		<section class="rounded-2xl border border-line bg-surface p-4">
			<h2 class="mb-3 text-[11px] font-semibold tracking-wider text-muted uppercase">
				{$t('experience.sources')}
			</h2>

			{#if earned.total === 0}
				<p class="text-sm text-muted">{$t('experience.empty')}</p>
			{:else}
				<div class="flex flex-wrap items-center justify-center gap-5">
					<!--
						Seven figures do not fit the hole, and a total that spills over its own ring reads as a
						fault in the page. Past a million the hole keeps the caption and the figure moves below
						it, where it has the width of the whole donut to be read across.
					-->
					<div class="flex shrink-0 flex-col items-center">
						<ShareDonut {slices}>
							{#snippet centre()}
								{#if spills}
									<p
										class="max-w-[7rem] text-[11px] leading-tight font-semibold tracking-wider text-muted uppercase"
									>
										{$t('experience.total')}
									</p>
								{:else}
									<p class="tabular text-2xl leading-none font-bold">{$formatNumber(earned!.total)}</p>
									<p class="mt-1 text-[11px] text-muted">{$t('experience.total')}</p>
								{/if}
							{/snippet}
						</ShareDonut>

						{#if spills}
							<p
								class="tabular -mt-1 rounded-full border border-line bg-sunk px-3.5 py-1 text-xl leading-none font-bold text-brand-text"
							>
								{$formatNumber(earned!.total)}
							</p>
						{/if}
					</div>

					<ul class="min-w-52 flex-1 space-y-2.5">
						{#each XP_SOURCES as source (source)}
							{@const part = earned.sources[source]}
							<li class="flex items-center gap-2.5">
								<span
									class="h-3 w-3 shrink-0 rounded-sm"
									style="background: {COLOURS[source]}"
									aria-hidden="true"
								></span>
								<div class="min-w-0 flex-1">
									<div class="flex items-baseline justify-between gap-2">
										<span class="truncate text-sm font-medium">
											{$t(`experience.sourceNames.${source}`)}
										</span>
										<span class="tabular text-sm font-semibold">
											{$t('experience.share', { percent: share(part.xp).toFixed(0) })}
										</span>
									</div>
									<p class="tabular truncate text-xs text-muted">
										{$t(`experience.sourceCounts.${source}`, { n: $formatNumber(part.count) })}
										· {$t('experience.points', { xp: $formatNumber(part.xp) })}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>

		<!-- The rates in full, so the total is something that can be checked rather than trusted. -->
		<section class="rounded-2xl border border-line bg-surface p-4">
			<h2 class="mb-3 text-[11px] font-semibold tracking-wider text-muted uppercase">
				{$t('experience.rates')}
			</h2>

			<div class="space-y-5">
				{#each RATES as rate (rate.key)}
					<div>
						<h3 class="text-sm font-semibold">{$t(`experience.rules.${rate.key}.title`)}</h3>
						<!-- The sum itself, given room and centred: a rule you can check beats a rule you trust. -->
						<p
							class="tabular mt-2 overflow-x-auto rounded-xl bg-sunk px-3 py-2.5 text-center text-sm whitespace-nowrap"
						>
							{$t(`experience.rules.${rate.key}.formula`, rate.params)}
						</p>
						{#if rate.terms}
							<ul class="mt-2 space-y-1">
								{#each rate.terms as term (term)}
									<li class="tabular text-center text-xs text-muted">
										{$t(`experience.rules.${rate.key}.${term}`, rate.params)}
									</li>
								{/each}
							</ul>
						{/if}
						<p class="mt-2 text-sm text-muted">
							{$t(`experience.rules.${rate.key}.body`, rate.params)}
						</p>
						{#if rate.example}
							<p class="tabular mt-1.5 text-xs text-muted">
								{$t(`experience.rules.${rate.key}.example`)}
							</p>
						{/if}
					</div>
				{/each}
			</div>

			<p class="mt-5 border-t border-line pt-4 text-sm text-muted">
				{$t('experience.rateDeterministic')}
			</p>
		</section>
	</div>
{/if}
