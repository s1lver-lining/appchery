<script lang="ts">
	import { t } from '$lib/i18n';
	import BandChart from '$lib/ui/BandChart.svelte';
	import DistributionChart from '$lib/ui/DistributionChart.svelte';
	import Progression from '$lib/ui/Progression.svelte';
	import Feature from '../lib/Feature.svelte';
	import { PROGRESSION, SCORE_SET, WIND_BANDS, ZONE_COUNTS } from '../lib/sample';

	const first = PROGRESSION[0];
	const last = PROGRESSION[PROGRESSION.length - 1];
</script>

<Feature title={$t('site.stats.title')} body={$t('site.stats.body')} note={$t('site.stats.note')} flip>
	{#snippet visual()}
		<div class="space-y-4">
			<section class="rounded-xl border border-line bg-surface p-4">
				<div class="flex items-baseline justify-between">
					<h3 class="text-sm font-semibold">{$t('site.sample.round')}</h3>
					<span class="tabular text-sm text-muted">{$t('site.sample.average')}</span>
				</div>
				<Progression
					points={PROGRESSION}
					lowLabel={String(Math.min(...PROGRESSION.map((p) => p.score)))}
					highLabel={String(Math.max(...PROGRESSION.map((p) => p.score)))}
				/>
				<p class="tabular mt-2 text-sm text-muted">
					{first.score} → <span class="font-black text-ink">{last.score}</span>
				</p>
			</section>

			<div class="grid gap-4 sm:grid-cols-2">
				<section class="rounded-xl border border-line bg-surface p-4">
					<h3 class="text-sm font-semibold">{$t('stats.distribution')}</h3>
					<DistributionChart arrows={ZONE_COUNTS} zones={SCORE_SET.zones} />
				</section>
				<BandChart
					title={$t('stats.byWind')}
					bands={WIND_BANDS}
					labelOf={(band) => $t(`stats.wind.${band.key}`)}
				/>
			</div>
		</div>
	{/snippet}
</Feature>
