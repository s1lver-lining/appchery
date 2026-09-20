<script lang="ts">
	import { t } from '$lib/i18n';
	import { pathOf, routeOf } from '$lib/domain/run/route';
	import { thin } from '$lib/domain/run/series';

	/**
	 * Where the run went, drawn from its own fixes and nothing else.
	 *
	 * There is no map under it on purpose: the person reading this ran it, so the shape is enough to
	 * recognise the loop, see which way round it went and find where it doubled back. It also means
	 * it draws with no network, nothing to attribute and nobody told where its owner runs.
	 */
	let {
		fixes,
		at = null
	}: {
		fixes: { lat: number; lon: number }[];
		/** Where along the route to mark, as a share of the way through. Null for no mark. */
		at?: number | null;
	} = $props();

	// A route is a few thousand fixes and a phone screen is a few hundred pixels: past one point per
	// pixel the path costs more to build than it shows.
	const route = $derived(routeOf(thin(fixes, 400)));
	const path = $derived(route ? pathOf(route) : '');
	const start = $derived(route?.points[0] ?? null);
	const end = $derived(route ? route.points[route.points.length - 1] : null);
	const here = $derived.by(() => {
		if (!route || at === null) return null;
		const index = Math.round(Math.min(1, Math.max(0, at)) * (route.points.length - 1));
		return route.points[index] ?? null;
	});
</script>

{#if route}
	<svg
		class="mx-auto block max-h-56 w-full"
		viewBox="0 0 {route.width} {route.height}"
		fill="none"
		role="img"
		aria-label={$t('running.route')}
	>
		<!-- Drawn twice: a wide soft pass under the line so it stays visible where it crosses itself,
		     which is what an out and back looks like for half its length. -->
		<path
			d={path}
			stroke="var(--c-run-pace)"
			stroke-width="5"
			stroke-linecap="round"
			stroke-linejoin="round"
			opacity="0.18"
			vector-effect="non-scaling-stroke"
		/>
		<path
			d={path}
			stroke="var(--c-run-pace)"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			vector-effect="non-scaling-stroke"
		/>
		<!-- Which end is which, because a loop drawn on its own says nothing about where it began. -->
		{#if start}
			<circle cx={start.x} cy={start.y} r="2.4" fill="var(--c-run-work)" />
		{/if}
		{#if end}
			<circle
				cx={end.x}
				cy={end.y}
				r="2.4"
				fill="var(--color-surface)"
				stroke="var(--c-run-heart)"
				stroke-width="1.6"
				vector-effect="non-scaling-stroke"
			/>
		{/if}
		{#if here}
			<circle cx={here.x} cy={here.y} r="3" fill="var(--color-ink)" />
		{/if}
	</svg>
{/if}
