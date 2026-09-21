<script lang="ts">
	import { onDestroy } from 'svelte';
	import { GeoJSONSource, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
	import type { FeatureCollection } from 'geojson';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { t } from '$lib/i18n';
	import { theme } from '$lib/theme';
	import { paceBand } from '$lib/domain/run/route';
	import { thin, type RunSample } from '$lib/domain/run/series';

	/**
	 * The route on the ground it was run over.
	 *
	 * The same line, the same colours and the same marker as the drawing it replaces: what the map
	 * adds is the streets under them, which is the difference between recognising a shape and
	 * knowing where you turned back.
	 *
	 * This whole component is loaded only when a map is asked for, which is why the renderer and its
	 * stylesheet are imported here plainly: a run nobody wanted a map for downloads neither, and
	 * tells nobody where it went.
	 */
	let {
		fixes,
		samples = [],
		byPace = false,
		at = null,
		onbusy = undefined
	}: {
		fixes: { lat: number; lon: number; elapsedSeconds?: number }[];
		samples?: RunSample[];
		byPace?: boolean;
		/** The run's clock to mark, or null for no mark. */
		at?: number | null;
		/**
		 * Whether the map is still working the route out. Repainting a line as three hundred
		 * separately coloured stretches takes a moment the page should not pretend it did not.
		 */
		onbusy?: (busy: boolean) => void;
	} = $props();

	/** Positron rather than the full basemap: a quiet grey ground is what a route is read against. */
	const STYLES = 'https://tiles.openfreemap.org/styles/';

	/*
	 * MapLibre works its worker's address out from its own module's address, which is right while it
	 * is served as the package and wrong the moment a bundler rewrites it: the app asked for a worker
	 * under its own hashed chunks, got a 404, and drew a grey box with no tiles and no error. The
	 * worker is copied into static/ by scripts/sync-maplibre.sh and named here instead.
	 */
	setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

	let holder = $state<HTMLDivElement | null>(null);
	let failed = $state(false);
	let map: MapLibreMap | null = null;
	let painted = $state(false);
	/** The style the map is already wearing. Plain, because comparing it must not be a reason to run. */
	let wearing = '';

	const shown = $derived(thin(fixes, byPace ? 300 : 600));
	const dark = $derived($theme === 'dark' || ($theme === 'system' && prefersDark()));
	const band = $derived(byPace ? paceBand(samples.map((one) => one.pace)) : null);

	function prefersDark(): boolean {
		return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	/** A colour out of the stylesheet: the map is drawn beside the app and wears the same palette. */
	function ink(name: string): string {
		if (typeof document === 'undefined') return '#1a6ba8';
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#1a6ba8';
	}

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

	function inkOf(pace: number | null): string {
		if (!band || pace === null) return ink('--c-run-pace');
		const share = Math.min(1, Math.max(0, (pace - band.fast) / (band.slow - band.fast)));
		if (share < 0.33) return ink('--c-run-work');
		if (share < 0.66) return ink('--c-run-warmup');
		return ink('--c-run-heart');
	}

	/** The route as one line, or as a line per stretch where it is painted by pace. */
	function routeData(): FeatureCollection {
		const line = shown.map((fix) => [fix.lon, fix.lat]);
		if (!band) {
			return {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						properties: { ink: ink('--c-run-pace') },
						geometry: { type: 'LineString', coordinates: line }
					}
				]
			};
		}
		return {
			type: 'FeatureCollection',
			features: line.slice(1).map((point, i) => ({
				type: 'Feature' as const,
				properties: { ink: inkOf(paceAt(shown[i + 1].elapsedSeconds ?? 0)) },
				geometry: { type: 'LineString' as const, coordinates: [line[i], point] }
			}))
		};
	}

	/** Which end is which, with the start drawn last so a loop does not bury it under its own finish. */
	function endsData(): FeatureCollection {
		const first = shown[0];
		const last = shown[shown.length - 1];
		if (!first || !last) return { type: 'FeatureCollection', features: [] };
		return {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: { ink: ink('--c-run-heart') },
					geometry: { type: 'Point', coordinates: [last.lon, last.lat] }
				},
				{
					type: 'Feature',
					properties: { ink: ink('--c-run-work') },
					geometry: { type: 'Point', coordinates: [first.lon, first.lat] }
				}
			]
		};
	}

	/** Where the finger is on the graph, marked on the ground as well as on the line. */
	function hereData(): FeatureCollection {
		if (at === null || shown.length === 0) return { type: 'FeatureCollection', features: [] };
		let best = shown[0];
		let closest = Infinity;
		for (const fix of shown) {
			const gap = Math.abs((fix.elapsedSeconds ?? 0) - at);
			if (gap < closest) {
				closest = gap;
				best = fix;
			}
		}
		return {
			type: 'FeatureCollection',
			features: [
				{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [best.lon, best.lat] } }
			]
		};
	}

	/**
	 * The run's own layers, added over whichever ground is underneath. Called again after a change of
	 * theme, because setting a new style takes every layer on the map with it.
	 */
	function paint(on: MapLibreMap) {
		if (on.getSource('route')) return;
		on.addSource('route', { type: 'geojson', data: routeData() });
		on.addSource('ends', { type: 'geojson', data: endsData() });
		on.addSource('here', { type: 'geojson', data: hereData() });
		// A wide pale pass under the line, so it stays visible where it crosses itself.
		on.addLayer({
			id: 'route-halo',
			type: 'line',
			source: 'route',
			paint: { 'line-color': ink('--color-surface'), 'line-width': 7, 'line-opacity': 0.7 },
			layout: { 'line-cap': 'round', 'line-join': 'round' }
		});
		on.addLayer({
			id: 'route-line',
			type: 'line',
			source: 'route',
			paint: { 'line-color': ['get', 'ink'], 'line-width': 3.5 },
			layout: { 'line-cap': 'round', 'line-join': 'round' }
		});
		on.addLayer({
			id: 'route-ends',
			type: 'circle',
			source: 'ends',
			paint: {
				'circle-radius': 5,
				'circle-color': ['get', 'ink'],
				'circle-stroke-width': 2,
				'circle-stroke-color': ink('--color-surface')
			}
		});
		on.addLayer({
			id: 'route-here',
			type: 'circle',
			source: 'here',
			paint: {
				'circle-radius': 6,
				'circle-color': ink('--color-ink'),
				'circle-stroke-width': 2,
				'circle-stroke-color': ink('--color-surface')
			}
		});
		painted = true;
	}

	function setData(id: string, data: FeatureCollection) {
		const source = map?.getSource(id);
		if (source instanceof GeoJSONSource) source.setData(data);
	}

	$effect(() => {
		if (!holder || map || shown.length < 2) return;
		let lowLon = Infinity;
		let lowLat = Infinity;
		let highLon = -Infinity;
		let highLat = -Infinity;
		for (const fix of shown) {
			lowLon = Math.min(lowLon, fix.lon);
			highLon = Math.max(highLon, fix.lon);
			lowLat = Math.min(lowLat, fix.lat);
			highLat = Math.max(highLat, fix.lat);
		}
		wearing = `${STYLES}${dark ? 'dark' : 'positron'}`;
		const built = new MapLibreMap({
			container: holder,
			style: wearing,
			center: [(lowLon + highLon) / 2, (lowLat + highLat) / 2],
			zoom: 11,
			/*
			 * Pinched, dragged and double tapped as any map is, but only with two fingers, and only
			 * with a modifier on a wheel. A map that took a one fingered drag inside a page that
			 * scrolls is a trap for the thumb: the page would stop moving wherever the map happened
			 * to be under it. Two fingers is what every map embedded in a page asks for, and it is
			 * the gesture nobody makes by accident while scrolling past.
			 */
			cooperativeGestures: true,
			// North stays up. A run is read against the streets it was run on, and a tilted or turned
			// map is one more thing to put right before it can be.
			dragRotate: false,
			pitchWithRotate: false,
			touchPitch: false,
			attributionControl: false,
			locale: {
				'CooperativeGesturesHandler.WindowsHelpText': $t('running.mapCtrlZoom'),
				'CooperativeGesturesHandler.MacHelpText': $t('running.mapCmdZoom'),
				'CooperativeGesturesHandler.MobileHelpText': $t('running.mapTwoFingers')
			}
		});
		built.touchZoomRotate.disableRotation();
		// Back to the whole run, because a map that has been pushed about has no way home otherwise.
		built.addControl(new NavigationControl({ showCompass: false }), 'top-right');
		// Said rather than left as an empty grey box: the tiles come from somebody else's server,
		// and the one thing that can go wrong with that is that it is not there.
		built.on('error', () => (failed = true));
		const whole: [[number, number], [number, number]] = [
			[lowLon, lowLat],
			[highLon, highLat]
		];
		built.on('load', () => {
			// Fitted once the map is up rather than in the constructor: a bounds given before the
			// container is measured leaves the map without a viewport to ask for tiles for.
			built.fitBounds(whole, { padding: 24, animate: false });
			paint(built);
		});
		// A double tap on a map zooms in; this one, held, puts the whole run back on the screen.
		built.on('contextmenu', () => built.fitBounds(whole, { padding: 24 }));
		// A change of theme brings a new style and takes the layers with it, so they go back on.
		built.on('styledata', () => {
			if (built.isStyleLoaded()) paint(built);
		});
		map = built;
	});

	// The line, the ends and the marker follow the page without the map being built again.
	$effect(() => {
		const data = routeData();
		if (!painted) return;
		onbusy?.(true);
		setData('route', data);
		// Idle is the map saying it has drawn everything it was given, which is when it is done.
		map?.once('idle', () => onbusy?.(false));
	});
	$effect(() => {
		const data = hereData();
		if (painted) setData('here', data);
	});
	/**
	 * A change of theme is a change of ground, and the only thing worth asking for the style again
	 * for. Compared against what the map is already wearing rather than against whether it has been
	 * painted: reading that here made this run when the layers went on, ask for the style again,
	 * lose them, put them back, and go round for ever with no route ever staying on the screen.
	 */
	$effect(() => {
		const wanted = `${STYLES}${dark ? 'dark' : 'positron'}`;
		if (!map || wearing === wanted) return;
		wearing = wanted;
		painted = false;
		map.setStyle(wanted);
	});

	onDestroy(() => {
		map?.remove();
		map = null;
	});
</script>

<div bind:this={holder} class="h-56 w-full overflow-hidden rounded-xl bg-sunk"></div>
<!--
	Said in a line of our own rather than in the library's box, which is two lines tall on a phone and
	covers a third of a map this size. Owed either way: the ground is OpenStreetMap's work.
-->
<p class="mt-1 text-center text-[0.625rem] text-muted">{$t('running.mapCredit')}</p>
{#if failed}
	<p class="mt-1 text-center text-xs text-muted">{$t('running.mapFailed')}</p>
{/if}
