<script lang="ts">
	import { t } from '$lib/i18n';
	import { closeOnBack } from './dismiss.svelte';
	import { scrim } from './statusBar';
	import { lockScroll } from './scrollLock';
	import { portal } from './portal';

	/**
	 * Deletions here remove scores that exist nowhere else, so they ask first. The confirming button
	 * carries the danger colour rather than the cancel one, so a reflex tap is the safe tap.
	 */
	let {
		title,
		message,
		confirmLabel,
		onconfirm,
		oncancel
	}: {
		title: string;
		message: string;
		confirmLabel?: string;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	// A dialog is a place: the back key leaves it, not the page underneath it.
	closeOnBack(
		() => true,
		() => oncancel()
	);
</script>

<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" use:portal use:lockScroll>
	<button class="absolute inset-0 bg-black/50" use:scrim={0.5} aria-label={$t('common.cancel')} onclick={oncancel}
	></button>

	<div
		class="relative w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-xl"
		role="alertdialog"
		aria-label={title}
	>
		<h2 class="text-base font-bold">{title}</h2>
		<p class="mt-1 text-sm whitespace-pre-line text-muted">{message}</p>

		<div class="mt-4 flex gap-2">
			<button class="flex-1 rounded-lg border border-line py-2 text-sm font-medium" onclick={oncancel}>
				{$t('common.cancel')}
			</button>
			<button
				class="flex-1 rounded-lg bg-danger py-2 text-sm font-semibold text-white"
				onclick={onconfirm}
			>
				{confirmLabel ?? $t('common.delete')}
			</button>
		</div>
	</div>
</div>
