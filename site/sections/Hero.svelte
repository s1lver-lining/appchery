<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import OpenApp from '../lib/OpenApp.svelte';
	import Phone from '../lib/Phone.svelte';
	import { EARLIER_SHOTS, END_SHOTS, SCORE_SET } from '../lib/sample';

	const end = END_SHOTS.map((shot) => shot.zoneLabel);
	const total = END_SHOTS.reduce((sum, shot) => sum + shot.value, 0);
</script>

<section class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
	<div>
		<h1 class="text-4xl leading-[1.1] font-black tracking-tight text-balance sm:text-5xl">
			{$t('site.hero.title')}
		</h1>
		<p class="mt-5 max-w-xl text-lg text-muted">{$t('site.hero.body')}</p>

		<div class="mt-8 flex flex-wrap items-center gap-4">
			<OpenApp size="lg" />
			<span class="text-sm text-muted">app.appchery.com</span>
		</div>

		<ul class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
			{#each [['star', 'site.hero.free'], ['cloud', 'site.hero.offline'], ['grid', 'site.hero.install']] as [icon, key] (key)}
				<li class="flex items-center gap-2 text-muted">
					<Icon name={icon as 'star'} size={16} />
					{$t(key)}
				</li>
			{/each}
		</ul>
	</div>

	<Phone label={$t('site.plot.title')}>
		<div class="flex h-full flex-col bg-bg">
			<div class="bg-brand/15 px-4 py-2">
				<p class="text-sm font-semibold">{$t('site.sample.round')}</p>
				<p class="text-xs text-muted">{$t('site.sample.end')}</p>
			</div>
			<div class="p-3">
				<TargetFace scoreSet={SCORE_SET} shots={END_SHOTS} otherShots={EARLIER_SHOTS} showPerimeter />
			</div>
			<div class="mt-auto border-t border-line bg-surface px-3 py-3">
				<div class="flex items-center gap-1.5">
					{#each end as label, i (i)}
						<span class="tabular flex-1 rounded-md bg-sunk py-1.5 text-center text-sm font-semibold">
							{label}
						</span>
					{/each}
					<span class="tabular w-10 text-right font-black">{total}</span>
				</div>
			</div>
		</div>
	</Phone>
</section>
