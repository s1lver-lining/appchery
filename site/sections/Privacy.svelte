<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import Feature from '../lib/Feature.svelte';
</script>

<Feature
	title={$t('site.private.title')}
	body={$t('site.private.body')}
	note={$t('site.private.note')}
	tone="surface"
>
	{#snippet visual()}
		<!-- The claim drawn rather than restated: the phone holds the data, and the copy to the other
			device is the only thing that ever leaves it, at the archer's asking. -->
		<div class="mx-auto flex max-w-md items-center justify-center">
			<span
				class="flex h-28 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-ink/70 bg-bg text-brand-text"
			>
				<Icon name="home" size={28} />
			</span>

			<!-- The chip sits on the line between the two devices rather than floating between them,
				and wears the app's own flat chip rather than a second bordered card. -->
			<span class="relative flex flex-1 items-center px-2">
				<span class="h-px flex-1 border-t border-dashed border-line"></span>
				<span
					class="tabular mx-1.5 flex shrink-0 items-center gap-1 rounded bg-sunk px-1.5 py-0.5 text-[11px] font-medium text-muted"
				>
					<Icon name="share" size={12} />
					{$t('site.private.sync')}
				</span>
				<span class="h-px flex-1 border-t border-dashed border-line"></span>
			</span>

			<span
				class="flex h-28 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-ink/70 bg-bg text-brand-text"
			>
				<Icon name="friends" size={28} />
			</span>
		</div>
	{/snippet}
</Feature>
