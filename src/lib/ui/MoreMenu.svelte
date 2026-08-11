<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	/**
	 * The narrow half of a split action bar: the primary button does the usual thing, this one opens
	 * the rest. The menu rises from the button rather than dropping from it, because the bar already
	 * sits at the bottom of the screen.
	 */
	let {
		items,
		label,
		icon = 'chevronUp',
		placement = 'up',
		wrapperClass = 'w-1/5',
		triggerClass = 'flex w-full items-center justify-center rounded-xl border border-line bg-surface py-2.5 font-semibold'
	}: {
		items: { label: string; onselect: () => void; icon?: IconName | null }[];
		label: string;
		icon?: IconName;
		/** Where the menu opens. The bottom bar rises, a header drops. */
		placement?: 'up' | 'down';
		wrapperClass?: string;
		triggerClass?: string;
	} = $props();

	let open = $state(false);
	let root = $state<HTMLElement | undefined>();
</script>

<!-- A press anywhere else closes the menu, which is what a tap outside a popup means everywhere. -->
<svelte:window
	onpointerdown={(event) => {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}}
/>

<div class="relative {wrapperClass}" bind:this={root}>
	{#if open}
		<div
			class="absolute z-20 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-xl
				{placement === 'up' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'}"
			role="menu"
		>
			{#each items as item, i (item.label)}
				<button
					class="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-medium
						{i > 0 ? 'border-t border-line' : ''}"
					role="menuitem"
					onclick={() => {
						open = false;
						item.onselect();
					}}
				>
					{#if item.icon !== null}
						<Icon name={item.icon ?? 'plus'} size={18} />
					{/if}
					{item.label}
				</button>
			{/each}
		</div>
	{/if}

	<button
		class={triggerClass}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open = !open)}
	>
		<span class="transition-transform {open && icon === 'chevronUp' ? 'rotate-180' : ''}">
			<Icon name={icon} size={20} />
		</span>
	</button>
</div>
