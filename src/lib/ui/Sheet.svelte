<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import { closeOnBack } from './dismiss.svelte';
	import { scrim } from './statusBar';

	/**
	 * A panel over the page, rising from the bottom edge on a phone and centred on a wide screen,
	 * which is where a filter belongs: the thumb is at the bottom and the page must stay in sight.
	 */
	let {
		open,
		title,
		onclose,
		children,
		footer
	}: {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	closeOnBack(
		() => open,
		() => onclose()
	);
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
			use:scrim={0.4}
			aria-label={$t('common.close')}
			onclick={onclose}
		></button>

		<div
			class="safe-bottom relative w-full max-w-sm rounded-t-2xl border border-line bg-surface p-4 shadow-xl sm:m-4 sm:rounded-2xl"
			role="dialog"
			aria-label={title}
		>
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-lg font-bold">{title}</h2>
				<button class="text-muted" aria-label={$t('common.close')} onclick={onclose}>
					<Icon name="close" size={20} />
				</button>
			</div>

			<div class="max-h-[60dvh] overflow-y-auto">
				{@render children()}
			</div>

			{#if footer}
				<div class="mt-3 flex gap-2 border-t border-line pt-3">{@render footer()}</div>
			{/if}
		</div>
	</div>
{/if}
