<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';
	import { closeOnBack } from './dismiss.svelte';

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
		align = 'left',
		wrapperClass = 'w-1/5',
		triggerClass = 'flex w-full items-center justify-center rounded-xl border border-line bg-surface py-2.5 font-semibold'
	}: {
		items: { label: string; onselect: () => void; icon?: IconName | null; accent?: boolean }[];
		label: string;
		icon?: IconName;
		/** Where the menu opens. The bottom bar rises, a header drops. */
		placement?: 'up' | 'down';
		/** Which edge the menu hangs from, so a button in a corner never opens off screen. */
		align?: 'left' | 'right';
		wrapperClass?: string;
		triggerClass?: string;
	} = $props();

	let open = $state(false);

	// An open menu is the innermost thing on screen: back shuts it rather than leaving the page.
	closeOnBack(
		() => open,
		() => (open = false)
	);
	let root = $state<HTMLElement | undefined>();
	/** Set while the click that closed the menu is still on its way, so the page never receives it. */
	let swallow = false;
</script>

<!--
	A press anywhere else closes the menu, which is what a tap outside a popup means everywhere. That
	press does nothing else: the click it turns into is swallowed, so shutting a menu over the session
	list never opens the session that happened to be underneath it.
-->
<svelte:window
	onpointerdown={(event) => {
		// Cleared first: a click always follows its own pointer press, so the flag never outlives one.
		swallow = false;
		if (open && root && !root.contains(event.target as Node)) {
			open = false;
			swallow = true;
		}
	}}
	onclickcapture={(event) => {
		if (!swallow) return;
		swallow = false;
		event.preventDefault();
		event.stopPropagation();
	}}
/>

<div class="relative {wrapperClass}" bind:this={root}>
	{#if open}
		<div
			class="absolute z-20 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-xl
				{placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}
				{placement === 'down' || align === 'right' ? 'right-0' : 'left-0'}"
			role="menu"
		>
			{#each items as item, i (item.label)}
				<button
					class="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-medium
						{i > 0 ? 'border-t border-line' : ''} {item.accent ? 'text-brand-text' : ''}"
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
