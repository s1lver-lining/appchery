<!--
	The drawn edge every header ends on. One curve, not one per page: it leaves the left side at the
	same height it reaches on the right, so two headers standing side by side during a swipe read as
	one band rather than as two blocks that happen to touch.

	The curve is a masked background rather than a filled SVG. A browser darkening the page itself,
	as Samsung Internet does by default, rewrites background colours but leaves SVG fills alone: the
	header would go dark around an edge that stayed pale, and the seam it is here to hide would show
	as a bright band. Masking makes the edge the page colour by the same route as the page.
-->
<script lang="ts">
	// preserveAspectRatio is the mask's own, so the curve stretches to the header width the way the
	// drawn shape used to. The fill colour is irrelevant: only the alpha is read.
	const CURVE =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 12" preserveAspectRatio="none">' +
				'<path d="M0 12 V6.5 C18 2.5 34 9.5 52 7 C70 4.5 86 9 100 6.5 V12 Z" fill="#000"/>' +
				'</svg>'
		);

	const mask = `url("${CURVE}") no-repeat center / 100% 100%`;
</script>

<div
	class="pointer-events-none absolute inset-x-0 -bottom-px h-6 w-full bg-bg"
	style="-webkit-mask: {mask}; mask: {mask}"
	aria-hidden="true"
></div>
