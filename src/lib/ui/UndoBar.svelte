<script lang="ts">
	import { undoable, dismissUndo } from './undo.svelte';
	import { noAnimations } from '$lib/prefs';

	/**
	 * Sits above the tab bar rather than over the page, so nothing it covers is anything being read.
	 * It is the only place a deletion can be taken back from, which is why it says what went.
	 */
	async function take() {
		const entry = $undoable;
		dismissUndo();
		await entry?.undo();
	}
</script>

{#if $undoable}
	<div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-20">
		<div
			class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-line bg-ink px-4 py-3 text-bg shadow-xl
				{$noAnimations ? '' : 'motion-safe:animate-[undo-rise_180ms_ease-out]'}"
			role="status"
		>
			<p class="min-w-0 flex-1 truncate text-sm">{$undoable.message}</p>
			<button class="shrink-0 text-sm font-bold text-brand" onclick={take}>
				{$undoable.label}
			</button>
		</div>
	</div>
{/if}
