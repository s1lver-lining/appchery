<script lang="ts">
	import { onDestroy } from 'svelte';
	import { scoreAt, decimalScore } from '$lib/domain/rounds/geometry';
	import { WA_10_RING } from '$lib/domain/rounds/seed';
	import { LiveScanner, type LiveImpact } from '$lib/vision/live';
	import { LiveView } from '$lib/vision/live-view';
	import { upFromGravity } from '$lib/vision/motion';
	import type { Impact } from '$lib/vision/pipeline';
	import Icon from '$lib/ui/Icon.svelte';

	// A recording played into the phone's own live path, from the file instead of the camera.
	let { video, count, onclose }: { video: string; count: number; onclose: () => void } = $props();

	type MotionSample = { at: number; gravity: { x: number; y: number; z: number } | null };

	let film = $state<HTMLVideoElement | null>(null);
	let overlay = $state<HTMLCanvasElement | null>(null);
	let playing = $state(false);
	let found = $state<LiveImpact[]>([]);
	let steady = $state(false);
	let passes = $state(0);
	let motion: MotionSample[] | null = null;
	let scanner: LiveScanner | null = null;
	let view: LiveView | null = null;
	let raf = 0;

	const scored = (arrow: LiveImpact) => arrow.source ?? arrow;
	const label = (arrow: Impact) => {
		const at = scored(arrow as LiveImpact);
		const decimal = decimalScore(WA_10_RING, at.x, at.y);
		return `${scoreAt(WA_10_RING, at.x, at.y).label}${decimal === null ? '' : `.${Math.round((decimal % 1) * 10)}`}`;
	};
	const ranked = $derived(
		[...found].sort((a, b) => scoreAt(WA_10_RING, scored(b).x, scored(b).y).value - scoreAt(WA_10_RING, scored(a).x, scored(a).y).value)
	);

	/** Started afresh, because everything the scanner knows it learnt from the frames before this one. */
	function restart() {
		scanner?.stop();
		scanner = new LiveScanner(() => {
			found = scanner!.arrows;
			steady = scanner!.steady;
			passes = scanner!.readout.passes;
		});
		scanner.setLimit(count || 6);
		view = new LiveView(scanner);
		found = [];
		passes = 0;
	}

	function upAt(ms: number): number | null {
		if (!motion?.length) return null;
		let best = motion[0];
		for (const sample of motion) {
			if (sample.at > ms) break;
			best = sample;
		}
		return upFromGravity(best.gravity);
	}

	function tick(now: number) {
		raf = requestAnimationFrame(tick);
		if (!film || !overlay || !scanner || !view || film.readyState < 2 || film.paused) return;
		scanner.setUp(upAt(film.currentTime * 1000));
		const step = view.frame(film, now, true);
		if (!step) return;
		view.draw(overlay, step.shown, step.faces, found, film.videoWidth, film.videoHeight, count || 6, label);
	}

	async function start() {
		try {
			motion = (await (await fetch(`/__label/motion/${encodeURIComponent(video)}`)).json()).samples ?? null;
		} catch {
			motion = null;
		}
		restart();
		if (!film) return;
		film.src = `/__label/video/${encodeURIComponent(video)}`;
		film.playbackRate = 1;
		await film.play().catch(() => {});
		playing = !film.paused;
		raf = requestAnimationFrame(tick);
	}

	function toggle() {
		if (!film) return;
		if (film.paused) void film.play();
		else film.pause();
		playing = !film.paused;
	}

	function again() {
		if (!film) return;
		restart();
		film.currentTime = 0;
		void film.play();
		playing = true;
	}

	$effect(() => {
		if (film) void start();
	});

	onDestroy(() => {
		cancelAnimationFrame(raf);
		scanner?.stop();
	});

	function keys(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose();
		else if (event.key === ' ') {
			event.preventDefault();
			toggle();
		} else if (event.key === 'r') again();
	}
</script>

<svelte:window onkeydown={keys} />

<div class="fixed inset-0 z-[80] flex flex-col bg-black text-white">
	<header class="flex items-center justify-between gap-3 px-4 py-3">
		<div class="min-w-0">
			<h2 class="font-bold">Live scorer</h2>
			<p class="truncate text-xs text-white/60">The phone's own path, played at the speed it was shot · {passes} passes</p>
		</div>
		<button class="press rounded-lg p-2 opacity-80" aria-label="Close" onclick={onclose}><Icon name="close" size={22} /></button>
	</header>
	<div class="relative min-h-0 flex-1">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={film} class="absolute inset-0 h-full w-full object-contain" playsinline muted onended={() => (playing = false)}></video>
		<canvas bind:this={overlay} class="pointer-events-none absolute inset-0 h-full w-full object-contain"></canvas>
	</div>
	<footer class="flex flex-wrap items-center gap-2 px-4 py-3">
		<button class="press rounded-xl bg-brand px-4 py-2 font-semibold text-brand-ink" onclick={toggle}>
			<Icon name={playing ? 'pause' : 'play'} size={18} />
		</button>
		<button class="press inline-flex items-center gap-1.5 rounded-xl border border-white/30 px-4 py-2 text-sm" onclick={again}>
			<Icon name="refresh" size={16} /> From the start
		</button>
		<span class="text-xs text-white/60">{steady ? 'steady' : 'not steady yet'}</span>
		<div class="ml-auto flex flex-wrap gap-1.5">
			{#each ranked as arrow, i (arrow)}
				{@const zone = scoreAt(WA_10_RING, scored(arrow).x, scored(arrow).y)}
				<span
					class="tabular rounded-full px-2.5 py-1 text-sm font-bold"
					class:opacity-40={i >= (count || 6)}
					style="background-color: {zone.countsAsHit ? zone.color : '#333'}; color: {zone.countsAsHit ? zone.strokeColor : '#fff'}"
				>{label(arrow)}{arrow.unsure ? '?' : ''}</span>
			{/each}
		</div>
	</footer>
</div>
