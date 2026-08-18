<script lang="ts">
	import { t } from '$lib/i18n';
	import { groupMetrics } from '$lib/domain/rounds/geometry';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Feature from '../lib/Feature.svelte';
	import { END_SHOTS, SCORE_SET } from '../lib/sample';

	const metrics = groupMetrics(END_SHOTS)!;
	/** As a fraction of the face radius, which is what the app works in and what a face size scales. */
	const spread = (metrics.meanRadius * 100).toFixed(1);
	const total = END_SHOTS.reduce((sum, shot) => sum + shot.value, 0);
</script>

<Feature title={$t('site.plot.title')} body={$t('site.plot.body')} note={$t('site.plot.note')} flip>
	{#snippet visual()}
		<div class="mx-auto max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-sm">
			<TargetFace scoreSet={SCORE_SET} shots={END_SHOTS} showPerimeter showCentreDefault showCentreToggle />
			<dl class="mt-4 grid grid-cols-3 gap-2 text-center">
				{#each [[$t('site.plot.arrows'), String(END_SHOTS.length)], [$t('site.plot.score'), String(total)], [$t('site.plot.spread'), `${spread}%`]] as [label, value] (label)}
					<div class="rounded-xl bg-sunk px-2 py-2">
						<dt class="text-xs text-muted">{label}</dt>
						<dd class="tabular text-lg font-black">{value}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/snippet}
</Feature>
