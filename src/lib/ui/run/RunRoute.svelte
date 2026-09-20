<script lang="ts">
	import { t } from '$lib/i18n';
	import { paceBand, pathOf, routeOf } from '$lib/domain/run/route';
	import { thin, type RunSample } from '$lib/domain/run/series';

	/**
	 * Where the run went, drawn from its own fixes and nothing else.
	 *
	 * There is no map under it on purpose: the person reading this ran it, so the shape is enough to
	 * recognise the loop, see which way round it went and find where it doubled back. It also means
	 * it draws with no network, nothing to attribute and nobody told where its owner runs.
	 */
	let {
		fixes,
		at = null,
		samples = [],
		byPace = false
	}: {
		fixes: { lat: number; lon: number; elapsedSeconds?: number }[];
		/** The run's clock to mark on the route, or null for no mark. */
		at?: number | null;
		/** The run as the graph reads it, for painting the route by pace. Empty leaves it one colour. */
		samples?: RunSample[];
		/** Whether to paint it. Off by default: a route is read for its shape before anything else. */
		byPace?: boolean;
	} = $props();

	// A route is a few thousand fixes and a phone screen is a few hundred pixels: past one point per
	// pixel the path costs more to build than it shows.
	// Fewer points when it is painted: each stretch is a path of its own, and four hundred of those
	// is four hundred elements for a picture the size of a palm.
	const shown = $derived(thin(fixes, byPace ? 160 : 400));
	const route = $derived(routeOf(shown));
	const path = $derived(route ? pathOf(route) : '');

	const band = $derived(byPace ? paceBand(samples.map((one) => one.pace)) : null);

	/** The pace where the run was at a moment, for painting the stretch that follows it. */
	function paceAt(seconds: number): number | null {
		let best: number | null = null;
		let closest = Infinity;
		for (const sample of samples) {
			const gap = Math.abs(sample.seconds - seconds);
			if (gap < closest) {
				closest = gap;
				best = sample.pace;
			}
		}
		return best;
	}

	/**
	 * Green where it was quick, amber in the middle and red where it was slow: the same three the
	 * rest of the app judges a pace with, and the order anybody reads a scale of effort in.
	 */
	function inkOf(pace: number | null): string {
		if (!band || pace === null) return 'var(--c-run-pace)';
		const share = Math.min(1, Math.max(0, (pace - band.fast) / (band.slow - band.fast)));
		if (share < 0.33) return 'var(--c-run-work)';
		if (share < 0.66) return 'var(--c-run-warmup)';
		return 'var(--c-run-heart)';
	}

	/** The route as stretches, each painted for the pace it was run at. */
	const painted = $derived.by(() => {
		if (!route || !band) return [];
		const out: { d: string; ink: string }[] = [];
		for (let i = 1; i < route.points.length; i++) {
			const from = route.points[i - 1];
			const to = route.points[i];
			out.push({
				d: `M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${to.x.toFixed(2)} ${to.y.toFixed(2)}`,
				ink: inkOf(paceAt(shown[i].elapsedSeconds ?? 0))
			});
		}
		return out;
	});
	const start = $derived(route?.points[0] ?? null);
	const end = $derived(route ? route.points[route.points.length - 1] : null);
	/**
	 * The point the graph is being read at, found by the run's own clock rather than by how far
	 * through the list it is: a run with a pause in it has fixes that are not evenly spread, and a
	 * share of the count would put the mark somewhere the runner never was at that moment.
	 */
	const here = $derived.by(() => {
		if (!route || at === null) return null;
		let best = 0;
		let closest = Infinity;
		for (let i = 0; i < shown.length; i++) {
			const gap = Math.abs((shown[i].elapsedSeconds ?? 0) - at);
			if (gap < closest) {
				closest = gap;
				best = i;
			}
		}
		return route.points[best] ?? null;
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
		{#if painted.length > 0}
			{#each painted as leg, i (i)}
				<path
					d={leg.d}
					stroke={leg.ink}
					stroke-width="2.5"
					stroke-linecap="round"
					vector-effect="non-scaling-stroke"
				/>
			{/each}
		{:else}
			<path
				d={path}
				stroke="var(--c-run-pace)"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				vector-effect="non-scaling-stroke"
			/>
		{/if}
		<!-- Which end is which, because a loop drawn on its own says nothing about where it began.
		     The start goes on top, because a loop ends where it started and the ring would hide it. -->
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
		{#if start}
			<circle cx={start.x} cy={start.y} r="2.4" fill="var(--c-run-work)" />
		{/if}
		{#if here}
			<circle cx={here.x} cy={here.y} r="3" fill="var(--color-ink)" />
		{/if}
	</svg>
{/if}
