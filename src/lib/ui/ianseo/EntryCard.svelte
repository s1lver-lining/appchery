<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import type { Entry } from '$lib/inscriptarc/types';

	/**
	 * The way in to a competition: the club's own announcement, the entry form, and who has entered
	 * already. All of it lives on Inscript'Arc rather than in the app, so these are links out and are
	 * drawn as links out.
	 */
	let { entry, compact = false }: { entry: Entry; compact?: boolean } = $props();

	/** The entry form leads, because it is the one an archer reading this came to press. */
	const ordered = $derived(
		[...entry.links].sort((a, b) => Number(/inscription/i.test(b.label)) - Number(/inscription/i.test(a.label)))
	);
</script>

<div class="rounded-2xl border border-brand/40 bg-gradient-to-r from-brand/8 to-surface p-3">
	{#if compact}
		<!-- The section it sits in says what these are and where they go, so the card only names one. -->
		<p class="font-semibold break-words">{entry.name}</p>
		<p class="text-xs text-muted">{entry.dates} · {entry.club}</p>
	{:else}
		<p class="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-brand-text uppercase">
			<Icon name="edit" size={13} />
			{$t('ianseo.entryOpen')}
		</p>
	{/if}

	<div class="mt-2 flex flex-wrap gap-1.5">
		{#each ordered as link, index (link.href)}
			<a
				class="rounded-lg px-2.5 py-1.5 text-xs font-semibold {index === 0
					? 'bg-brand text-brand-ink'
					: 'border border-line text-muted'}"
				href={link.href}
				target="_blank"
				rel="noreferrer"
			>
				{link.label}
			</a>
		{/each}
	</div>
	{#if !compact}
		<p class="mt-2 text-[11px] text-muted">{$t('ianseo.entryBy')}</p>
	{/if}
</div>
