<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Feature from '../lib/Feature.svelte';
	import Phone from '../lib/Phone.svelte';
	import { END_SHOTS, SCORE_SET } from '../lib/sample';

	/**
	 * The camera screen as the app draws it: the face under the overlay the detector puts on it, and
	 * the proposals along the bottom in the colours of the zones they fell in, each one there to be
	 * dropped before any of them reach the card.
	 */
	const colourOf = (label: string) =>
		SCORE_SET.zones.find((zone) => zone.label === label)?.color ?? 'var(--color-brand)';
	const inkOf = (label: string) =>
		SCORE_SET.zones.find((zone) => zone.label === label)?.strokeColor ?? 'var(--color-ink)';

</script>

<Feature
	title={$t('site.camera.title')}
	body={$t('site.camera.body')}
	note={$t('site.camera.note')}
	tone="surface"
>
	{#snippet visual()}
		<Phone label={$t('site.camera.title')}>
			<div class="flex h-full flex-col bg-black">
				<header class="flex items-center justify-between px-4 py-2 text-white">
					<h3 class="text-base font-bold">{$t('auto.title')}</h3>
					<Icon name="close" size={18} />
				</header>

				<div class="relative flex-1 overflow-hidden">
					<!-- The face fills the frame the way it does through a lens pointed at it, with the
						detector's own ring laid over the edge it locked on to. -->
					<div class="absolute inset-x-2 top-6">
						<div class="relative">
							<TargetFace scoreSet={SCORE_SET} shots={END_SHOTS} />
							<div class="absolute inset-0 rounded-full border-2 border-brand/80"></div>
						</div>
					</div>

					<span
						class="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1"
					>
						<span class="block h-2 w-2 rounded-full bg-danger"></span>
						<span class="text-[10px] font-semibold tracking-wide text-white uppercase">
							{$t('auto.recording')}
						</span>
					</span>
				</div>

				<div class="space-y-2 bg-surface px-3 pt-2.5 pb-4">
					<div class="grid grid-cols-6 gap-1">
						{#each END_SHOTS as shot (shot.ordinal)}
							<span
								class="tabular flex h-9 items-center justify-center rounded-lg text-sm font-bold"
								style="background: {colourOf(shot.zoneLabel)}; color: {inkOf(shot.zoneLabel)}"
							>
								{shot.zoneLabel}
							</span>
						{/each}
					</div>
					<p class="text-center text-[10px] text-muted">{$t('auto.tapToDrop')}</p>
					<div class="flex gap-2">
						<span class="flex-1 rounded-lg border border-line py-2 text-center text-xs font-medium">
							{$t('common.cancel')}
						</span>
						<span
							class="flex-[2] rounded-lg bg-brand py-2 text-center text-sm font-semibold text-brand-ink"
						>
							{$t('auto.keep', { n: END_SHOTS.length })}
						</span>
					</div>
				</div>
			</div>
		</Phone>
	{/snippet}
</Feature>
