<script lang="ts" generics="T extends string | number">
	/**
	 * A scrolling list you drag through rather than a number field, because entering a round on a
	 * phone at the shooting line should not raise a keyboard.
	 *
	 * Selection follows native scrolling with snap points, so touch inertia and accessibility come
	 * from the browser rather than from hand-rolled drag maths.
	 */
	let {
		values,
		value,
		label,
		format = (v: T) => String(v),
		onchange,
		item = 44,
		labelHidden = false
	}: {
		values: T[];
		value: T;
		label: string;
		format?: (value: T) => string;
		onchange: (value: T) => void;
		/** Row height. Shrunk where several wheels share a screen that has to fit without scrolling. */
		item?: number;
		/** The label still names the wheel for a screen reader, but the page draws its own heading. */
		labelHidden?: boolean;
	} = $props();

	const ITEM = $derived(item);
	let list = $state<HTMLDivElement | null>(null);
	let settling: ReturnType<typeof setTimeout> | null = null;

	function scrollToValue(next: T, behavior: ScrollBehavior = 'smooth') {
		const index = values.indexOf(next);
		if (index >= 0) list?.scrollTo({ top: index * ITEM, behavior });
	}

	// Keep the wheel aligned when the value changes from outside, without fighting an active drag.
	$effect(() => {
		const index = values.indexOf(value);
		if (!list || index < 0 || settling) return;
		if (Math.abs(list.scrollTop - index * ITEM) > 2) scrollToValue(value, 'auto');
	});

	function onScroll() {
		if (!list) return;
		if (settling) clearTimeout(settling);
		// Read after scrolling stops: reporting mid-flick would fire a value per frame.
		settling = setTimeout(() => {
			settling = null;
			if (!list) return;
			const index = Math.round(list.scrollTop / ITEM);
			const next = values[Math.max(0, Math.min(values.length - 1, index))];
			if (next !== undefined && next !== value) onchange(next);
		}, 90);
	}
</script>

<div class="text-sm">
	{#if !labelHidden}<span class="text-muted">{label}</span>{/if}
	<div
		class="relative mt-1 overflow-hidden rounded-lg border border-line bg-bg"
		style="height: {ITEM * 3}px"
	>
		<!-- The selected row sits in the middle band, marked so the wheel reads as a dial. -->
		<div
			class="pointer-events-none absolute inset-x-0 border-y border-brand bg-brand/10"
			style="top: {ITEM}px; height: {ITEM}px"
		></div>
		<div
			bind:this={list}
			class="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			onscroll={onScroll}
			role="listbox"
			aria-label={label}
			tabindex="0"
		>
			<div style="height: {ITEM}px"></div>
			{#each values as option (option)}
				<button
					type="button"
					role="option"
					aria-selected={option === value}
					class="tabular flex w-full snap-center items-center justify-center text-base
						{option === value ? 'font-bold text-ink' : 'text-muted'}"
					style="height: {ITEM}px"
					onclick={() => {
						onchange(option);
						scrollToValue(option);
					}}
				>
					{format(option)}
				</button>
			{/each}
			<div style="height: {ITEM}px"></div>
		</div>
	</div>
</div>
