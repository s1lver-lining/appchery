<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import { Scanner, toImageCoords, type FaceLocation, type Impact } from '$lib/vision/pipeline';
	import { scoreAt, decimalScore } from '$lib/domain/rounds/geometry';
	import type { ScoreSet } from '$lib/domain/rounds/types';
	import Icon from './Icon.svelte';

	/**
	 * Live scoring from the camera. Nothing detected is ever written on its own: the archer keeps or
	 * drops each arrow, because a wrong score entered silently is worse than no score at all.
	 */
	let {
		scoreSet,
		remaining,
		onaccept,
		onclose
	}: {
		scoreSet: ScoreSet;
		/** Arrows still to enter in this end, which caps how many can be taken. */
		remaining: number;
		onaccept: (shots: { x: number; y: number }[]) => void;
		onclose: () => void;
	} = $props();

	let video = $state<HTMLVideoElement | null>(null);
	let overlay = $state<HTMLCanvasElement | null>(null);
	let error = $state<string | null>(null);
	let starting = $state(true);

	let faces = $state<FaceLocation[]>([]);
	let steady = $state(false);
	let found = $state<Impact[]>([]);
	let pending = $state(0);

	const scanner = new Scanner();
	const work = document.createElement('canvas');
	let stream: MediaStream | null = null;
	let raf = 0;

	/** Highest first, as a scoresheet reads, so the pills are checked in a predictable order. */
	const ranked = $derived(
		[...found].sort((a, b) => {
			const left = scoreAt(scoreSet, a.x, a.y);
			const right = scoreAt(scoreSet, b.x, b.y);
			return right.value - left.value || Number(right.isInner ?? false) - Number(left.isInner ?? false);
		})
	);
	const kept = $derived(ranked.slice(0, remaining));

	// The scanner stops proposing once the end is full, rather than piling up arrows to discard.
	$effect(() => {
		scanner.setLimit(remaining);
	});

	/** A pill wears the colour of the ring it scored, exactly as the keypad and the sheet do. */
	function pillStyle(arrow: Impact): string {
		const zone = scoreAt(scoreSet, arrow.x, arrow.y);
		if (!zone.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor}; box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	}

	/** Just the tenth, as a suffix: the ring is what matters, the depth is a detail beside it. */
	function detail(arrow: Impact): string {
		const decimal = decimalScore(scoreSet, arrow.x, arrow.y);
		return decimal === null ? '' : `.${Math.round((decimal % 1) * 10)}`;
	}

	$effect(() => {
		start();
		return stop;
	});

	async function start() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 1280 } },
				audio: false
			});
			if (video) {
				video.srcObject = stream;
				await video.play();
			}
			starting = false;
			raf = requestAnimationFrame(tick);
		} catch (e) {
			starting = false;
			error = e instanceof Error && e.name === 'NotAllowedError' ? $t('auto.denied') : String(e);
		}
	}

	function stop() {
		cancelAnimationFrame(raf);
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}
	onDestroy(stop);

	function tick() {
		raf = requestAnimationFrame(tick);
		if (!video || video.readyState < 2 || !overlay) return;

		const width = video.videoWidth;
		const height = video.videoHeight;
		if (width === 0) return;

		work.width = width;
		work.height = height;
		const context = work.getContext('2d', { willReadFrequently: true });
		if (!context) return;
		context.drawImage(video, 0, 0, width, height);
		const image = context.getImageData(0, 0, width, height);

		const result = scanner.push({ width, height, data: image.data });
		faces = result.faces;
		steady = result.steady;
		found = result.arrows;
		pending = result.pending.length;

		draw(result.faces, result.arrows, overlay, width, height);
	}

	/** The overlay is drawn in the small image's pixels, so every coordinate scales back up. */
	function draw(
		located: FaceLocation[],
		arrows: Impact[],
		canvas: HTMLCanvasElement,
		width: number,
		height: number
	) {
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return;

		const scale = scanner.scaleFactor;
		context.lineWidth = Math.max(2, width / 300);

		// Every face is outlined, so a three spot shows all three being watched.
		context.strokeStyle = 'rgba(255,255,255,0.85)';
		for (const face of located) {
			context.beginPath();
			context.ellipse(
				face.cx * scale,
				face.cy * scale,
				face.semiMajor * scale,
				face.semiMinor * scale,
				face.rotation,
				0,
				Math.PI * 2
			);
			context.stroke();
		}

		arrows.forEach((arrow, index) => {
			const face = located[arrow.face];
			if (!face) return;
			const point = toImageCoords(face, arrow.x, arrow.y);
			context.strokeStyle = index < remaining ? '#3ddc84' : 'rgba(255,255,255,0.4)';
			context.beginPath();
			context.arc(point.x * scale, point.y * scale, width / 60, 0, Math.PI * 2);
			context.stroke();
		});
	}

	function label(arrow: Impact): string {
		return scoreAt(scoreSet, arrow.x, arrow.y).label;
	}

	function accept() {
		onaccept(kept.map((a) => ({ x: a.x, y: a.y })));
	}

	function drop(arrow: Impact) {
		scanner.reject(arrow);
		found = found.filter((a) => a !== arrow);
	}
</script>

<div class="fixed inset-0 z-[60] flex flex-col bg-black">
	<header class="safe-top flex items-center justify-between px-4 py-3 pt-6 text-white">
		<h2 class="text-lg font-bold">{$t('auto.title')}</h2>
		<button class="opacity-80" aria-label={$t('common.close')} onclick={onclose}>
			<Icon name="close" size={22} />
		</button>
	</header>

	<div class="relative flex-1 overflow-hidden">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} class="h-full w-full object-contain" playsinline muted></video>
		<canvas
			bind:this={overlay}
			class="pointer-events-none absolute inset-0 h-full w-full object-contain"
		></canvas>

		{#if starting}
			<p class="absolute inset-0 grid place-items-center text-white">{$t('common.loading')}</p>
		{:else if error}
			<p class="absolute inset-x-4 top-4 rounded-lg bg-danger/90 p-3 text-sm text-white">{error}</p>
		{:else if faces.length === 0}
			<p
				class="absolute inset-x-4 bottom-4 rounded-lg bg-black/70 p-3 text-center text-sm text-white"
			>
				{$t('auto.aiming')}
			</p>
		{/if}
	</div>

	<div class="safe-bottom space-y-3 bg-surface p-4">
		{#if found.length === 0}
			<p class="text-center text-sm text-muted">
				{faces.length === 0
					? $t('auto.noFace')
					: steady
						? $t('auto.watching', { n: pending })
						: $t('auto.settling')}
			</p>
		{:else}
			<!--
				Six to a row, matching the longest common end, so a full end reads as one line. Scrollable
				as well, because a bad frame must never push the buttons off the screen.
			-->
			<div class="grid max-h-28 grid-cols-6 gap-1.5 overflow-y-auto">
				{#each ranked as arrow, i (i)}
					<button
						class="tabular flex h-10 items-center justify-center rounded-lg text-base font-bold
							{i < remaining ? '' : 'opacity-40'}"
						style={pillStyle(arrow)}
						aria-label={$t('auto.drop')}
						onclick={() => drop(arrow)}
					>
						{label(arrow)}<span class="ml-0.5 text-[10px] font-semibold opacity-70">
							{detail(arrow)}
						</span>
					</button>
				{/each}
			</div>
			<p class="text-center text-[11px] text-muted">{$t('auto.tapToDrop')}</p>
			{#if found.length > remaining}
				<p class="text-xs text-danger">{$t('auto.tooMany', { n: remaining })}</p>
			{/if}
		{/if}

		<div class="flex gap-2">
			<button class="flex-1 rounded-lg border border-line py-3 text-sm font-medium" onclick={onclose}>
				{$t('common.cancel')}
			</button>
			<button
				class="flex-[2] rounded-lg bg-brand py-3 font-semibold text-brand-ink disabled:opacity-40"
				disabled={kept.length === 0}
				onclick={accept}
			>
				{$t('auto.keep', { n: kept.length })}
			</button>
		</div>
	</div>
</div>
