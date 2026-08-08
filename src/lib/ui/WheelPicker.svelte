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
		onchange
	}: {
		values: T[];
		value: T;
		label: string;
		format?: (value: T) => string;
		onchange: (value: T) => void;
	} = $props();

	const ITEM = 44;
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
	<span class="text-muted">{label}</span>
	<div class="relative mt-1 h-[132px] overflow-hidden rounded-lg border border-line bg-bg">
		<!-- The selected row sits in the middle band, marked so the wheel reads as a dial. -->
		<div
			class="pointer-events-none absolute inset-x-0 top-[44px] h-[44px] border-y border-brand bg-brand/10"
		></div>
		<div
			bind:this={list}
			class="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			onscroll={onScroll}
			role="listbox"
			aria-label={label}
			tabindex="0"
		>
			<div style="height: 44px"></div>
			{#each values as item (item)}
				<button
					type="button"
					role="option"
					aria-selected={item === value}
					class="flex h-[44px] w-full snap-center items-center justify-center text-base tabular
						{item === value ? 'font-bold text-ink' : 'text-muted'}"
					onclick={() => {
						onchange(item);
						scrollToValue(item);
					}}
				>
					{format(item)}
				</button>
			{/each}
			<div style="height: 44px"></div>
		</div>
	</div>
</div>
