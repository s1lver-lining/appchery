<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import { formatSince } from '$lib/prefs';

	/**
	 * When what is on the page was read from ianseo. On every page that shows any of it: none of this
	 * is the app's own record, and a result with no date on it is read as live when it is an hour old.
	 */
	let {
		loading,
		stale,
		cachedAt,
		children
	}: {
		loading: boolean;
		/** ianseo could not be reached, so what is shown is whatever the device already had. */
		stale: boolean;
		cachedAt: number | null;
		children?: Snippet;
	} = $props();

	/** Under a minute old, "read one minute ago" is a worse answer than saying it has just been read. */
	const justNow = $derived(cachedAt !== null && Date.now() - cachedAt < 60_000);
</script>

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
