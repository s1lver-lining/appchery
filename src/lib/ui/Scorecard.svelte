<script lang="ts">
	import { t } from '$lib/i18n';
	import { saveFile, shareFile } from '$lib/files';
	import Icon from './Icon.svelte';
	import { scorecardSvg, scorecardPng, type CardData } from './scorecard';

	/**
	 * The round as one picture, filling the screen. It exists to be shared: everything an archer
	 * would want to say about a round is on it, and nothing they would have to explain.
	 */
	let { data, onclose }: { data: CardData; onclose: () => void } = $props();

	const svg = $derived(scorecardSvg(data));
	let busy = $state<'share' | 'save' | null>(null);
	let error = $state<string | null>(null);

	const filename = $derived(
		`appchery-${data.roundName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.png`
	);

	async function send(how: 'share' | 'save') {
		busy = how;
		error = null;
		try {
			const blob = await scorecardPng(svg);
			if (how === 'share') await shareFile(blob, filename, data.roundName);
			else await saveFile(blob, filename, data.roundName);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		busy = null;
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
		<!-- Two ways out: to another app, or onto the phone. Neither needs the width of the screen. -->
		<div class="mx-auto flex max-w-md items-center justify-center gap-2">
			<button
				class="flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
				disabled={busy !== null}
				onclick={() => send('share')}
			>
				<Icon name="share" size={18} />
				{busy === 'share' ? $t('share.saving') : $t('share.action')}
			</button>
			<button
				class="flex items-center justify-center gap-2 rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
				disabled={busy !== null}
				onclick={() => send('save')}
			>
				<Icon name="camera" size={18} />
				{busy === 'save' ? $t('share.saving') : $t('share.save')}
			</button>
		</div>
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
