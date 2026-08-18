<script lang="ts">
	import { t } from '$lib/i18n';
	import BadgeGlyph from '$lib/ui/BadgeGlyph.svelte';
	import Feature from '../lib/Feature.svelte';
	import { SAMPLE_BADGES } from '../lib/sample';
</script>

<Feature title={$t('site.badges.title')} body={$t('site.badges.body')} note={$t('site.badges.note')} flip>
	{#snippet visual()}
		<ul class="mx-auto grid max-w-md grid-cols-2 gap-3">
			{#each SAMPLE_BADGES as badge (badge.definition.key)}
				<li class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
					<BadgeGlyph {badge} />
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold">
							{$t(`badges.list.${badge.definition.key}.name`)}
						</p>
						{#if badge.progress}
							<p class="tabular text-xs text-muted">
								{badge.progress.current} / {badge.progress.target}
							</p>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/snippet}
</Feature>
