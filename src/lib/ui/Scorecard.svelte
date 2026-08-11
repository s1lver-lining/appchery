<script lang="ts">
	import { t } from '$lib/i18n';
	import { saveFile } from '$lib/files';
	import Icon from './Icon.svelte';
	import { scorecardSvg, scorecardPng, type CardData } from './scorecard';

	/**
	 * The round as one picture, filling the screen. It exists to be shared: everything an archer
	 * would want to say about a round is on it, and nothing they would have to explain.
	 */
	let { data, onclose }: { data: CardData; onclose: () => void } = $props();

	const svg = $derived(scorecardSvg(data));
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function share() {
		busy = true;
		error = null;
		try {
			const blob = await scorecardPng(svg);
			const stamp = new Date().toISOString().slice(0, 10);
			const name = `appchery-${data.roundName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}.png`;
			await saveFile(blob, name, data.roundName);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
</script>

<div class="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur">
	<header class="safe-top flex items-center justify-between px-4 py-3 pt-6">
		<h2 class="text-lg font-bold text-white">{$t('share.title')}</h2>
		<button class="text-white/70" aria-label={$t('common.close')} onclick={onclose}>
			<Icon name="close" size={24} />
		</button>
	</header>

	<!-- The card keeps its 4:5 whatever the screen is, because that is the shape it will be posted in. -->
	<div class="flex min-h-0 flex-1 items-center justify-center px-4 pb-2">
		<div class="aspect-[4/5] max-h-full w-full max-w-md overflow-hidden rounded-2xl shadow-2xl">
			<!-- Built by us from escaped values, never from anything fetched. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html svg}
		</div>
	</div>

	<div class="safe-bottom px-4 pt-2 pb-4">
		{#if error}
			<p class="mb-2 text-center text-sm text-danger">{error}</p>
		{/if}
		<button
			class="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-brand-ink disabled:opacity-50"
			disabled={busy}
			onclick={share}
		>
			<Icon name="camera" size={20} />
			{busy ? $t('share.saving') : $t('share.action')}
		</button>
		<p class="mt-2 text-center text-xs text-white/50">{$t('share.hint')}</p>
	</div>
</div>

<style>
	/* The card is drawn at 1080 wide and scaled to whatever room the screen has. */
	div :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
