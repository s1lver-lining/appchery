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
		label = ''
	}: { children: import('svelte').Snippet; label?: string } = $props();
</script>

<div
	class="relative mx-auto w-[min(20rem,80vw)] rounded-[2.5rem] border-[6px] border-ink/85 bg-bg shadow-2xl"
	style="aspect-ratio: 9 / 17.5"
	role="img"
	aria-label={label}
>
	<!-- The cutout, which is what the eye reads as a phone before it reads the corners. -->
	<div class="absolute top-2 left-1/2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-ink/70"></div>
	<div class="h-full overflow-hidden rounded-[2rem] pt-5">
		{@render children()}
	</div>
</div>
