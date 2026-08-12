<script lang="ts">
	import { t } from '$lib/i18n';
	import Sheet from './Sheet.svelte';
	import Toggle from './Toggle.svelte';

	/**
	 * What the page is made of. Everything beyond the chart is optional and most of it starts off:
	 * a block an archer never reads is noise on every visit, and one they turn on is a question they
	 * actually have.
	 */
	let {
		open,
		blocks,
		enabled,
		onclose,
		ontoggle
	}: {
		open: boolean;
		blocks: { key: string; available: boolean }[];
		enabled: (key: string) => boolean;
		onclose: () => void;
		ontoggle: (key: string, on: boolean) => void;
	} = $props();
</script>

<Sheet {open} title={$t('stats.blocks.title')} {onclose}>
	<p class="mb-3 text-xs text-muted">{$t('stats.blocks.hint')}</p>
	<ul class="space-y-1">
		{#each blocks as block (block.key)}
			<li class="flex items-center gap-3 py-1.5">
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium">{$t(`stats.blocks.${block.key}`)}</p>
					{#if !block.available}
						<!-- Kept switchable while it has nothing to show, or turning it on looks broken. -->
						<p class="text-xs text-muted">{$t('stats.blocks.noData')}</p>
					{/if}
				</div>
				<Toggle
					checked={enabled(block.key)}
					label={$t(`stats.blocks.${block.key}`)}
					onchange={(value) => ontoggle(block.key, value)}
				/>
			</li>
		{/each}
	</ul>
</Sheet>
