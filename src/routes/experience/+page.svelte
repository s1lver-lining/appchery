<script lang="ts">
	import { page } from '$app/stores';
	import { dataVersion } from '$lib/db/changed';
	import { t } from '$lib/i18n';
	import { loadExperienceInput } from '$lib/db/repository';
	import {
		experience,
		XP_SOURCES,
		XP_PER_ARROW,
		XP_MATCH_WIN,
		type Experience,
		type XpSource
	} from '$lib/domain/experience';
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
		loadExperienceInput().then((input) => (earned = experience(input)));
	});

	const COLOURS: Record<XpSource, string> = {
		arrows: 'var(--c-xp-arrows)',
		rounds: 'var(--c-xp-rounds)',
		badges: 'var(--c-xp-badges)',
		matches: 'var(--c-xp-matches)'
	};

	const share = (xp: number) => (earned && earned.total > 0 ? (xp / earned.total) * 100 : 0);
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
	<div class="mx-auto w-full max-w-2xl space-y-5 p-4">
		<!-- The level, what it took, and what the next one asks: the three numbers the page is for. -->
		<section class="rounded-2xl border border-line bg-surface p-4">
			<div class="flex items-baseline justify-between">
				<h2 class="text-2xl font-bold text-brand-text">
					{$t('experience.level', { level: earned.level })}
				</h2>
				<p class="tabular text-lg font-semibold">
					{$t('experience.points', { xp: earned.total.toLocaleString() })}
				</p>
			</div>

			<div class="mt-3 h-2.5 overflow-hidden rounded-full bg-sunk">
				<div
					class="h-full rounded-full bg-brand"
					style="width: {earned.span > 0 ? (earned.into / earned.span) * 100 : 0}%"
				></div>
			</div>

			<div class="mt-2 flex items-baseline justify-between text-xs text-muted">
				<p class="tabular">
					{$t('experience.intoLevel', {
						into: earned.into.toLocaleString(),
						span: earned.span.toLocaleString()
					})}
				</p>
				<p class="tabular">
					{$t('experience.toNext', {
						xp: earned.toNext.toLocaleString(),
						level: earned.level + 1
					})}
				</p>
			</div>
			<p class="tabular mt-1 text-xs text-muted">
				{$t('experience.nextLevelAt', {
					level: earned.level + 1,
					xp: earned.nextLevelAt.toLocaleString()
				})}
			</p>
		</section>

		<section class="rounded-2xl border border-line bg-surface p-4">
			<h2 class="mb-3 text-[11px] font-semibold tracking-wider text-muted uppercase">
				{$t('experience.sources')}
			</h2>

			{#if earned.total === 0}
				<p class="text-sm text-muted">{$t('experience.empty')}</p>
			{:else}
				<div class="flex flex-wrap items-center justify-center gap-5">
					<ShareDonut {slices}>
						{#snippet centre()}
							<p class="tabular text-2xl leading-none font-bold">{earned!.total.toLocaleString()}</p>
							<p class="mt-1 text-[11px] text-muted">{$t('experience.total')}</p>
						{/snippet}
					</ShareDonut>

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
										{$t(`experience.sourceCounts.${source}`, { n: part.count.toLocaleString() })}
										· {$t('experience.points', { xp: part.xp.toLocaleString() })}
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
			<ul class="space-y-2.5 text-sm text-muted">
				<li>{$t('experience.rateArrows', { xp: XP_PER_ARROW })}</li>
				<li>{$t('experience.rateRounds')}</li>
				<li>{$t('experience.rateBadges')}</li>
				<li>{$t('experience.rateMatches', { xp: XP_MATCH_WIN })}</li>
				<li>{$t('experience.rateDeterministic')}</li>
			</ul>
		</section>
	</div>
{/if}
