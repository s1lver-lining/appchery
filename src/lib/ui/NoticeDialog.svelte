<script lang="ts">
	import { t } from '$lib/i18n';
	import { closeOnBack } from './dismiss.svelte';
	import { scrim } from './statusBar';
	import { lockScroll } from './scrollLock';
	import { portal } from './portal';

	/**
	 * Something that was not done, said so it cannot be missed: it stays until dismissed. The sibling
	 * of ConfirmDialog for when there is nothing to confirm, only something to know, and at most one
	 * way to act on it.
	 */
	let {
		title,
		message,
		actionLabel,
		onaction,
		onclose
	}: {
		title: string;
		message: string;
		actionLabel?: string;
		onaction?: () => void;
		onclose: () => void;
	} = $props();

	closeOnBack(
		() => true,
		() => onclose()
	);
</script>

<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" use:portal use:lockScroll>
	<button class="absolute inset-0 bg-black/50" use:scrim={0.5} aria-label={$t('common.close')} onclick={onclose}
	></button>

	<div
		class="relative w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-xl"
		role="alertdialog"
		aria-label={title}
	>
		<h2 class="text-base font-bold">{title}</h2>
		<p class="mt-1 text-sm whitespace-pre-line text-muted">{message}</p>

		<div class="mt-4 flex gap-2">
			{#if actionLabel && onaction}
				<button class="press flex-1 rounded-lg border border-line py-2 text-sm font-medium" onclick={onaction}>
					{actionLabel}
				</button>
			{/if}
			<button class="press flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink" onclick={onclose}>
				{$t('common.close')}
			</button>
		</div>
	</div>
</div>
