<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon, { type IconName } from './Icon.svelte';

	// At the foot of the page rather than in its header: the hand that picked the rows is already there.
	let {
		count,
		total,
		onall,
		onclear,
		actions
	}: {
		count: number;
		total: number;
		onall: () => void;
		onclear: () => void;
		actions: { label: string; icon: IconName; danger?: boolean; onselect: () => void }[];
	} = $props();
</script>

<div class="sticky bottom-0 z-20 shrink-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<div class="mx-auto w-full max-w-2xl space-y-2">
		<div class="flex items-center gap-2">
			<button
				class="shrink-0 rounded-lg p-1 text-muted"
				aria-label={$t('common.close')}
				onclick={onclear}
			>
				<Icon name="close" size={20} />
			</button>
			<p class="tabular min-w-0 flex-1 truncate text-sm font-semibold">
				{$t('select.count', { n: count })}
			</p>
			<!-- One button for both ways: with everything picked the only move left is to let it go. -->
			<button class="shrink-0 text-sm font-medium text-brand-text" onclick={onall}>
				{count >= total ? $t('select.none') : $t('select.all')}
			</button>
		</div>

		<div class="flex gap-2">
			{#each actions as action (action.label)}
				<button
					class="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold
						{action.danger ? 'border-danger/40 text-danger' : 'border-line'}"
					disabled={count === 0}
					onclick={action.onselect}
				>
					<Icon name={action.icon} size={16} />
					{action.label}
				</button>
			{/each}
		</div>
	</div>
</div>
