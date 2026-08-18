<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import TargetFace from '$lib/ui/TargetFace.svelte';
	import Feature from '../lib/Feature.svelte';
	import Phone from '../lib/Phone.svelte';
	import { END_SHOTS, SCORE_SET } from '../lib/sample';

	/**
	 * The viewfinder as the archer holds it: a face seen from the shooting line, so at an angle and
	 * never square on. The same drawing tilted in perspective rather than a photograph, because a
	 * photograph of one target on one day is a promise about lighting the app cannot keep.
	 */
	const found = END_SHOTS.slice(0, 4);
</script>

<Feature
	title={$t('site.camera.title')}
	body={$t('site.camera.body')}
	note={$t('site.camera.note')}
	tone="surface"
>
	{#snippet visual()}
		<Phone label={$t('site.camera.title')}>
			<div class="flex h-full flex-col bg-face-black text-face-white">
				<div class="flex items-center gap-2 px-4 py-2 text-xs font-medium">
					<Icon name="camera" size={16} />
					{$t('site.sample.round')}
				</div>

				<div class="relative flex-1 overflow-hidden" style="perspective: 700px">
					<div
						class="absolute inset-x-6 top-10 opacity-95"
						style="transform: rotateX(28deg) rotateZ(-4deg) scale(1.05)"
					>
						<TargetFace scoreSet={SCORE_SET} shots={found} />
					</div>
					<!-- The reticle, which is what tells the archer the app has the face and not the sky. -->
					<div class="absolute inset-8 rounded-xl border-2 border-face-gold/70"></div>
				</div>

				<div class="space-y-2 px-4 pb-4">
					<div class="flex gap-1.5">
						{#each found as shot (shot.ordinal)}
							<span
								class="tabular flex-1 rounded-md bg-face-white/15 py-1.5 text-center text-sm font-bold"
							>
								{shot.zoneLabel}
							</span>
						{/each}
					</div>
					<button
						class="flex w-full items-center justify-center gap-2 rounded-full bg-face-gold py-2.5 font-semibold text-face-black"
					>
						<Icon name="check" size={18} />
						{$t('common.done')}
					</button>
				</div>
			</div>
		</Phone>
	{/snippet}
</Feature>
