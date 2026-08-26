<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';

	/**
	 * The line every page of the competitions section is read from: what to look for, and what to
	 * show. It scrolls away with the page rather than sitting over it, because a result list is read
	 * downwards and a bar pinned to the top of a phone costs a line of the very thing being read.
	 */
	let {
		value = $bindable(''),
		placeholder,
		settings,
		settingsLabel,
		count
	}: {
		value: string;
		placeholder: string;
		/** Opens whatever the page has to configure. Absent on a page with nothing to set. */
		settings?: () => void;
		settingsLabel?: string;
		/** What the search has left, said only while something is being searched for. */
		count?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="flex items-center gap-2">
	<div class="relative min-w-0 flex-1">
		<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
			<Icon name="search" size={16} />
		</span>
		<input
			class="w-full rounded-xl border border-line bg-surface py-2.5 pr-9 pl-9 text-sm"
			bind:value
			autocomplete="off"
			type="search"
			{placeholder}
			aria-label={placeholder}
		/>
		{#if value}
			<button
				class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1 text-muted"
				aria-label={$t('common.close')}
				onclick={() => (value = '')}
			>
				<Icon name="close" size={16} />
			</button>
		{/if}
	</div>

	{#if settings}
		<button
			class="press shrink-0 rounded-xl border border-line bg-surface p-2.5 text-muted"
			aria-label={settingsLabel ?? $t('ianseo.columns')}
			onclick={settings}
		>
			<Icon name="sliders" size={18} />
		</button>
	{/if}
</div>

{#if count}
	<p class="px-1 text-xs text-muted">{count}</p>
{/if}

<style>
	/* The browser draws its own cross inside a search field, and the app already has one that matches
	   everything else it draws. Two of them side by side is the app looking like two apps. */
	input[type='search']::-webkit-search-cancel-button,
	input[type='search']::-webkit-search-decoration {
		appearance: none;
	}
</style>
