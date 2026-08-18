<script lang="ts">
	/**
	 * A phone around whatever a section wants to show. The app is drawn live inside it rather than
	 * photographed, so the page cannot show a screen the app has stopped having.
	 *
	 * Sized in ch-free absolute pixels and scaled by the caller, because a device is a fixed shape
	 * and a frame that reflows is a frame that stops looking like one.
	 */
	let {
		children,
		label = '',
		bar = 'bg-bg'
	}: {
		children: import('svelte').Snippet;
		label?: string;
		/** The strip the cutout sits in. A real phone paints it the colour of whatever is under it,
			so a screen with a coloured header has to be given that colour here too. */
		bar?: string;
	} = $props();
</script>

<div
	class="relative mx-auto w-[min(20rem,80vw)] rounded-[2.5rem] border-[6px] border-ink/85 bg-bg shadow-2xl"
	style="aspect-ratio: 9 / 17.5"
	role="img"
	aria-label={label}
>
	<div class="flex h-full flex-col overflow-hidden rounded-[2rem]">
		<!-- The cutout, which is what the eye reads as a phone before it reads the corners. -->
		<div class="relative h-5 shrink-0 {bar}">
			<div class="absolute top-1.5 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-ink/70"></div>
		</div>
		<div class="min-h-0 flex-1">{@render children()}</div>
	</div>
</div>
