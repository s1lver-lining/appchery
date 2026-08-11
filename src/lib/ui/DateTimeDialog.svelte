<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n';
	import { closeOnBack } from './dismiss.svelte';

	/**
	 * When something is meant to happen. Native fields rather than a hand-rolled calendar, so the
	 * phone raises the picker its owner already knows.
	 */
	let {
		title,
		value,
		confirmLabel,
		onconfirm,
		oncancel
	}: {
		title: string;
		/** Milliseconds the dialog opens on. */
		value: number;
		confirmLabel?: string;
		onconfirm: (at: number) => void;
		oncancel: () => void;
	} = $props();

	// A dialog is a place: the back key leaves it, not the page underneath it.
	closeOnBack(
		() => true,
		() => oncancel()
	);

	const pad = (n: number) => String(n).padStart(2, '0');
	// Read once on purpose: the dialog opens on the value it was given and is then the archer's.
	const opened = new Date(untrack(() => value));
	let date = $state(
		`${opened.getFullYear()}-${pad(opened.getMonth() + 1)}-${pad(opened.getDate())}`
	);
	let time = $state(`${pad(opened.getHours())}:${pad(opened.getMinutes())}`);

	function confirm() {
		const [year, month, day] = date.split('-').map(Number);
		const [hour, minute] = time.split(':').map(Number);
		if (!year || !month || !day) return;
		onconfirm(new Date(year, month - 1, day, hour || 0, minute || 0).getTime());
	}
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
	<button class="absolute inset-0 bg-black/40" aria-label={$t('common.close')} onclick={oncancel}
	></button>

	<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
		<h2 class="mb-3 text-lg font-bold">{title}</h2>

		<div class="flex gap-2">
			<input
				type="date"
				class="tabular flex-1 rounded-lg border border-line bg-bg p-2 text-ink"
				aria-label={$t('session.date')}
				bind:value={date}
			/>
			<input
				type="time"
				class="tabular flex-1 rounded-lg border border-line bg-bg p-2 text-ink"
				aria-label={$t('session.time')}
				bind:value={time}
			/>
		</div>

		<div class="mt-4 flex gap-2">
			<button
				class="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
				onclick={oncancel}
			>
				{$t('common.cancel')}
			</button>
			<button
				class="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
				onclick={confirm}
			>
				{confirmLabel ?? $t('common.save')}
			</button>
		</div>
	</div>
</div>
