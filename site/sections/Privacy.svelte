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
		<div class="mx-auto flex max-w-md items-center justify-center gap-4">
			{#each ['home', 'friends'] as name, i (name)}
				{#if i === 1}
					<span
						class="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-muted"
					>
						<Icon name="share" size={16} />
						<span class="text-[11px] font-medium">{$t('site.private.sync')}</span>
					</span>
				{/if}
				<span
					class="flex h-28 w-20 items-center justify-center rounded-2xl border-2 border-ink/70 bg-bg text-brand-text"
				>
					<Icon name={name as 'home'} size={28} />
				</span>
			{/each}
		</div>
	{/snippet}
</Feature>
