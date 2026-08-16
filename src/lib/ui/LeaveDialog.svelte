<script lang="ts">
	import { t } from '$lib/i18n';
	import { closeOnBack } from './dismiss.svelte';
	import { scrim } from './statusBar';
	import { lockScroll } from './scrollLock';
	import { portal } from './portal';

	// Leaving a form is not an answer, so the way out asks for one: stay, drop it, or write it down.
	let {
		title,
		message,
		saveLabel,
		onsave,
		ondiscard,
		oncancel
	}: {
		title: string;
		message: string;
		saveLabel: string;
		onsave: () => void;
		ondiscard: () => void;
		oncancel: () => void;
	} = $props();

	closeOnBack(
		() => true,
		() => oncancel()
	);
</script>

<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" use:portal use:lockScroll>
	<button
		class="absolute inset-0 bg-black/50"
		use:scrim={0.5}
		aria-label={$t('common.cancel')}
		onclick={oncancel}
	></button>

	<div
		class="relative w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-xl"
		role="alertdialog"
		aria-label={title}
	>
		<h2 class="text-base font-bold">{title}</h2>
		<p class="mt-1 text-sm whitespace-pre-line text-muted">{message}</p>

		<!-- Saving is the wide one below: it is the answer the page was left in the middle of giving. -->
		<div class="mt-4 space-y-2">
			<div class="flex gap-2">
				<button
					class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
					onclick={oncancel}
				>
					{$t('common.cancel')}
				</button>
				<button
					class="flex-1 rounded-lg border border-danger/40 py-2 text-sm font-medium text-danger"
					onclick={ondiscard}
				>
					{$t('leave.discard')}
				</button>
			</div>
			<button
				class="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
				onclick={onsave}
			>
				{saveLabel}
			</button>
		</div>
	</div>
</div>
