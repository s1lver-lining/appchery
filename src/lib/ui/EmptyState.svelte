<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';

	/**
	 * What an empty list says. A list that reads "nothing yet" tells an archer what the app knows,
	 * which they can see; this tells them what the page is for and what fills it.
	 *
	 * The sample above the words is drawn from nothing and labelled as a sample, because a made up
	 * row that looks real is worse than no row at all: an archer who taps it and finds it gone learns
	 * not to trust what the app shows them.
	 */
	let {
		title,
		body,
		action,
		sample
	}: {
		title: string;
		/** One sentence, two at the very most: an empty page is read, not studied. */
		body: string;
		action?: { label: string; href?: string; onclick?: () => void };
		/** A drawing of what a filled row looks like here. */
		sample?: Snippet;
	} = $props();
</script>

<div class="rounded-xl border border-dashed border-line p-5 text-center">
	{#if sample}
		<!-- Faded and named: it is an example of the page, never a thing that can be opened. -->
		<div class="relative mb-4" aria-hidden="true">
			<span
				class="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line bg-bg px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase"
			>
				{$t('empty.sample')}
			</span>
			<div class="pointer-events-none opacity-45 select-none">
				{@render sample()}
			</div>
		</div>
	{/if}

	<p class="font-semibold">{title}</p>
	<p class="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>

	{#if action}
		{#if action.href}
			<a
				class="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
				href={action.href}
			>
				{action.label}
			</a>
		{:else}
			<button
				class="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
				onclick={action.onclick}
			>
				{action.label}
			</button>
		{/if}
	{/if}
</div>
