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
		notch = 'bg-ink/70'
	}: {
		children: import('svelte').Snippet;
		label?: string;
		/** The cutout is a hole in the screen, so it is read against the screen: dark ink over a page,
			and a pale one over a screen that is black. */
		notch?: string;
	} = $props();
</script>

<div
	class="relative mx-auto w-[min(20rem,80vw)] rounded-[2.5rem] border-[6px] border-ink/85 bg-bg shadow-2xl"
	style="aspect-ratio: 9 / 17.5"
	role="img"
	aria-label={label}
>
	<!--
		The screen runs the whole height of the glass and the cutout sits on top of it, rather than in
		a strip of its own above it. That is what lets a header's tint and the geometry struck across
		it carry on past the cutout, the way they do on the phone this is a picture of. The room the
		cutout needs is taken inside the header itself, by `.phone [data-page-header]` in styles.css.
	-->
	<div class="phone relative h-full overflow-hidden rounded-[2rem]">
		{@render children()}
		<!-- The cutout, which is what the eye reads as a phone before it reads the corners. -->
		<div class="absolute top-1.5 left-1/2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full {notch}"></div>
	</div>
</div>
