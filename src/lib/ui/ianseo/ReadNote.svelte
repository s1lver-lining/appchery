<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import { formatSince } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';

	/**
	 * When what is on the page was read from ianseo. On every page that shows any of it: none of this
	 * is the app's own record, and a result with no date on it is read as live when it is an hour old.
	 */
	let {
		loading,
		stale,
		cachedAt,
		banner = false,
		children
	}: {
		loading: boolean;
		/** ianseo could not be reached, so what is shown is whatever the device already had. */
		stale: boolean;
		cachedAt: number | null;
		/**
		 * Shown at the top of the page and only while it is stale. The quiet line belongs at the
		 * bottom, where a page that is current is read out; a page that is not has to say so where the
		 * archer is already looking, since a long list is never scrolled to its end to find out.
		 */
		banner?: boolean;
		children?: Snippet;
	} = $props();

	/** Under a minute old, "read one minute ago" is a worse answer than saying it has just been read. */
	const justNow = $derived(cachedAt !== null && Date.now() - cachedAt < 60_000);
</script>

{#if banner}
	{#if stale && cachedAt}
		<p class="flex items-center gap-2 rounded-xl border border-line bg-line/25 px-3 py-2 text-xs text-muted">
			<span class="shrink-0"><Icon name="cloud" size={16} /></span>
			{$t('ianseo.stale', { when: $formatSince(cachedAt) })}
		</p>
	{/if}
{:else}
<div class="flex flex-wrap items-center justify-center gap-2 pb-2 text-center text-[11px] text-muted">
	<span>
		{#if loading}
			{$t('ianseo.reading')}
		{:else if stale && cachedAt}
			{$t('ianseo.stale', { when: $formatSince(cachedAt) })}
		{:else if justNow}
			{$t('ianseo.justRead')}
		{:else if cachedAt}
			{$t('ianseo.readAt', { when: $formatSince(cachedAt) })}
		{:else}
			{$t('ianseo.readNever')}
		{/if}
	</span>
	{#if children}{@render children()}{/if}
</div>
{/if}
