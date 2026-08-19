<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import { toImageCoords, type FaceLocation, type Impact } from '$lib/vision/pipeline';
	import { LiveScanner } from '$lib/vision/live';
	import { MotionLog, allowMotion } from '$lib/vision/motion';
	import { scoreAt, decimalScore } from '$lib/domain/rounds/geometry';
	import type { ScoreSet } from '$lib/domain/rounds/types';
	import Icon from './Icon.svelte';
	import { recordCameraVideo, arrowDetector } from '$lib/prefs';
	import { storeRecording, storeMotion } from '$lib/files';
	import { closeOnBack } from './dismiss.svelte';
	import { overrideStatusBar } from '$lib/theme';
	import { lockScroll } from './scrollLock';

	/**
	 * Live scoring from the camera. Nothing detected is ever written on its own: the archer keeps or
	 * drops each arrow, because a wrong score entered silently is worse than no score at all.
	 */
	let {
		scoreSet,
		remaining,
		videoName,
		onaccept,
		onrecorded,
		onclose
	}: {
		scoreSet: ScoreSet;
		/** Arrows still to enter in this end, which caps how many can be taken. */
		remaining: number;
		/** File name to record under, identifying the end this footage belongs to. */
		videoName: string;
		onaccept: (shots: { x: number; y: number }[]) => void;
		/** Reports the stored file so the end keeps a reference to its own footage. */
		onrecorded: (name: string) => void;
		onclose: () => void;
	} = $props();

	// The camera fills the screen, so the back key is the way out of it rather than out of the round.
	closeOnBack(
		() => true,
		() => onclose()
	);

	/** Rings 9 and 10 of ten equal rings, which is the gold's share of the face radius. */
	const GOLD_SHARE = 0.2;

	let video = $state<HTMLVideoElement | null>(null);
	let overlay = $state<HTMLCanvasElement | null>(null);
	let error = $state<string | null>(null);
	let starting = $state(true);

	let faces = $state<FaceLocation[]>([]);
	let steady = $state(false);
	let found = $state<Impact[]>([]);
	let pending = $state(0);

	// Detection lives in a worker, so a slow pass costs the overlay nothing and the video never stalls.
	const scanner = new LiveScanner(() => {
		found = scanner.arrows;
		steady = scanner.steady;
		pending = scanner.pending;
	});

	/**
	 * The learned detector's weights, fetched only when it is the one chosen. About a megabyte of
	 * numbers, which has no business in the bundle of an app most archers will score by hand.
	 */
	$effect(() => {
		if ($arrowDetector !== 'learned') return;
		let cancelled = false;
		import('$lib/vision/arrow-model.json')
			.then((module) => {
				if (cancelled) return;
				scanner.setModel((module.default ?? module) as never);
				scanner.setLimit(remaining);
			})
			.catch(() => {
				// No weights shipped means the classical detector, which is the default anyway.
			});
		return () => {
			cancelled = true;
		};
	});
	const work = document.createElement('canvas');
	let stream: MediaStream | null = null;
	let raf = 0;

	/**
	 * Optional recording of the session, off unless the archer turned it on in settings. Detection is
	 * only ever going to get better on footage of real ends on real bosses, and the archer holding the
	 * phone is the only person who can capture that. The file is saved to the device, never sent.
	 */
	let recorder: MediaRecorder | null = null;
	let recording = $state(false);
	/**
	 * How the phone was held, one sample a frame, saved beside the video. Nothing reads it yet: it is
	 * captured because a recording made without it can never have it added afterwards.
	 */
	const motion = new MotionLog();

	/** Highest first, as a scoresheet reads, so the pills are checked in a predictable order. */
	const ranked = $derived(
		[...found].sort((a, b) => {
			const left = scoreAt(scoreSet, a.x, a.y);
			const right = scoreAt(scoreSet, b.x, b.y);
			return right.value - left.value || Number(right.isInner ?? false) - Number(left.isInner ?? false);
		})
	);
	const kept = $derived(ranked.slice(0, remaining));

	/**
	 * A face read from well off to one side comes back as a stretched ellipse. The fit is affine, so it
	 * cannot express real perspective, and the far rings drift. Saying so is more useful than asking
	 * for a steady hand: where the archer stands is the thing that actually decides the reading.
	 */
	const skewed = $derived(
		faces.length > 0 && faces[0].semiMajor / Math.max(faces[0].semiMinor, 1) > 1.25
	);

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
			if ($recordCameraVideo) startRecording();
			raf = requestAnimationFrame(tick);
		} catch (e) {
			starting = false;
			error = e instanceof Error && e.name === 'NotAllowedError' ? $t('auto.denied') : String(e);
		}
	}

	function startRecording() {
		if (!stream || typeof MediaRecorder === 'undefined') return;
		// Whatever the device is willing to encode: asking for a specific codec fails on some phones.
		try {
			recorder = new MediaRecorder(stream);
		} catch {
			return;
		}

		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = () => save(new Blob(chunks, { type: recorder?.mimeType ?? 'video/webm' }));
		recorder.start(1000);
		void allowMotion().then((allowed) => {
			if (allowed && recording) motion.start();
		});
		recording = true;
	}

	function save(video: Blob) {
		// Reported straight away: the end keeps the name whether or not the write itself succeeds.
		onrecorded(videoName);
		void storeRecording(video, videoName);
		if (motion.any) void storeMotion(motion.toJSON(), videoName);
	}

	function stop() {
		cancelAnimationFrame(raf);
		scanner.stop();
		motion.stop();
		if (recorder && recorder.state !== 'inactive') recorder.stop();
		recorder = null;
		recording = false;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}
	onDestroy(stop);

	/**
	 * How often the full search for faces and arrows runs. Everything in between follows the geometry
	 * already found, which is cheap, so the overlay tracks the camera at the display's own rate instead
	 * of waiting for a detection to finish. Detection three times a second is far more often than an
	 * arrow arrives.
	 */
	const DETECT_EVERY_MS = 300;
	let lastDetection = 0;

	/** The frame reduced for detection, scaled by the canvas rather than by a loop over every pixel. */
	function reduce(): { width: number; height: number; data: Uint8ClampedArray } | null {
		if (!video) return null;
		const scale = scanner.scaleFactor;
		const width = Math.floor(video.videoWidth / scale);
		const height = Math.floor(video.videoHeight / scale);
		if (width === 0 || height === 0) return null;

		work.width = width;
		work.height = height;
		const context = work.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		// Drawing straight to the smaller canvas hands the scaling to the GPU, which is most of the win.
		context.drawImage(video, 0, 0, width, height);
		return { width, height, data: context.getImageData(0, 0, width, height).data };
	}

	function tick(now: number) {
		raf = requestAnimationFrame(tick);
		if (!video || video.readyState < 2 || !overlay) return;

		// One sample a frame, so a sample can be paired with the frame it was taken during.
		if (recording) motion.sample(now);

		const small = reduce();
		if (!small) return;

		/**
		 * The face is followed here and the search is handed away. Nothing on this path waits for a
		 * detection, so the overlay keeps the camera's own rate whatever the detector is costing.
		 */
		faces = scanner.follow(small);
		if (now - lastDetection >= DETECT_EVERY_MS) {
			lastDetection = now;
			// Offered last, because the frame's buffer is given away rather than copied.
			scanner.offer(small);
		}

		draw(faces, found, overlay, video.videoWidth, video.videoHeight);
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
		for (const face of located) {
			/**
			 * Drawn through the face's own projection rather than as an ellipse. A boss seen from
			 * anywhere but square on is a projection, and the ellipse matching it near the middle does
			 * not match it at the edge: the gold sits perfectly while the outer ring lands a couple of
			 * rings inside where it belongs.
			 */
			const ring = (share: number) => {
				context.beginPath();
				for (let i = 0; i <= 128; i++) {
					const angle = (i / 128) * Math.PI * 2;
					const point = toImageCoords(face, Math.cos(angle) * share, Math.sin(angle) * share);
					const x = point.x * scale;
					const y = point.y * scale;
					i === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
				}
				context.closePath();
				context.stroke();
			};

			context.strokeStyle = 'rgba(255,255,255,0.85)';
			ring(1);
			/**
			 * The gold as well. It is the one ring present on every face including a three spot, and
			 * seeing it sit on the real gold is how the archer can tell at a glance that the fit is right.
			 */
			context.strokeStyle = 'rgba(247,224,60,0.95)';
			ring(GOLD_SHARE);
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
		// The arrows stay in the boss, so the detector is told they are scored rather than new.
		scanner.accept();
	}

	function drop(arrow: Impact) {
		scanner.reject(arrow);
		found = found.filter((a) => a !== arrow);
	}

	// The camera view really is black, in either theme, and it covers the scoring page whose own
	// claim on the bar has to come back when this closes.
	$effect(() => overrideStatusBar('#000000'));
</script>

<div class="fixed inset-0 z-[60] flex flex-col bg-black" use:lockScroll>
	<header class="safe-top flex items-center justify-between px-4 py-3 pt-6 text-white">
		<h2 class="text-lg font-bold">{$t('auto.title')}</h2>
		<button class="opacity-80" aria-label={$t('common.close')} onclick={onclose}>
			<Icon name="close" size={22} />
		</button>
	</header>

	<div class="relative flex-1 overflow-hidden">
		<!-- svelte-ignore a11y_media_has_caption -->
		<!--
			Cover rather than contain: letterboxing wasted the sides of the screen, and the edges of the
			frame are the least interesting part of a picture pointed at a target. The canvas carries the
			video's own pixel dimensions and the same object fit, so the two crop identically and the
			overlay stays on the rings.
		-->
		<video bind:this={video} class="h-full w-full object-cover" playsinline muted></video>
		<canvas
			bind:this={overlay}
			class="pointer-events-none absolute inset-0 h-full w-full object-cover"
		></canvas>

		{#if starting}
			<!--
				The camera takes a moment to come up, and until it does the video element is an empty grey
				rectangle. Rather than label that, the wait is drawn as the thing being waited for: a face,
				with its rings sweeping into place.
			-->
			<div class="absolute inset-0 grid place-items-center bg-black">
				<div class="flex flex-col items-center gap-5">
					<svg viewBox="0 0 100 100" class="h-24 w-24" aria-hidden="true">
						<g fill="none" stroke-linecap="round" data-motion="keep">
							<circle cx="50" cy="50" r="44" stroke="#ffffff" stroke-opacity="0.12" stroke-width="4" />
							<circle cx="50" cy="50" r="32" stroke="#ffffff" stroke-opacity="0.12" stroke-width="4" />
							<circle cx="50" cy="50" r="20" stroke="#ffffff" stroke-opacity="0.12" stroke-width="4" />
							<!-- Three arcs on the ring radii, each sweeping at its own rate. -->
							<circle
								class="sweep"
								cx="50" cy="50" r="44"
								stroke="var(--c-brand)" stroke-width="4"
								stroke-dasharray="60 217" style="animation-duration: 2.4s"
							/>
							<circle
								class="sweep"
								cx="50" cy="50" r="32"
								stroke="var(--c-brand)" stroke-width="4" stroke-opacity="0.75"
								stroke-dasharray="40 161" style="animation-duration: 1.8s; animation-direction: reverse"
							/>
							<circle
								class="sweep"
								cx="50" cy="50" r="20"
								stroke="#f7e03c" stroke-width="4"
								stroke-dasharray="26 100" style="animation-duration: 1.2s"
							/>
							<circle cx="50" cy="50" r="6" fill="#f7e03c" stroke="none" class="pulse" />
						</g>
					</svg>
					<p class="text-sm text-white/70">{$t('auto.starting')}</p>
				</div>
			</div>
		{/if}

		{#if error}
			<p class="absolute inset-x-4 top-4 rounded-lg bg-danger/90 p-3 text-sm text-white">{error}</p>
		{/if}

		{#if recording}
			<!-- Never record without saying so on screen, for as long as it is happening. -->
			<div
				class="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1"
			>
				<span class="pulse block h-2.5 w-2.5 rounded-full bg-danger"></span>
				<span class="text-[11px] font-semibold uppercase tracking-wide text-white">
					{$t('auto.recording')}
				</span>
			</div>
		{/if}

	</div>


	<div class="safe-bottom-gap space-y-2 bg-surface px-4 pt-3">
		<!--
			The arrow area keeps its height whether or not anything has been found. Letting it collapse made
			the buttons jump every time a detection came and went, which on a hand held phone is constantly.
			One row's worth, because six pills to a row already covers the longest common end, and anything
			past that scrolls: this panel is stealing height from the camera, which is what matters here.
		-->
		<div class="h-11 overflow-y-auto">
			{#if found.length === 0}
				<p class="flex h-full items-center justify-center text-center text-sm text-muted">
					<!--
						Two states, not five. The old messages swapped as fast as detection did and were
						never on screen long enough to read, which made the panel look broken rather than busy.
					-->
					{faces.length === 0
						? $t('auto.noFace')
						: skewed
							? $t('auto.angle')
							: $t('auto.watching')}
				</p>
			{:else}
				<div class="grid grid-cols-6 gap-1.5">
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

			{/if}
		</div>


		<!-- Fixed height as well, so the hint and the warning swapping does not move anything either. -->
		<p class="flex h-4 items-center justify-center text-center text-[11px]">
			{#if found.length > remaining}
				<span class="text-danger">{$t('auto.tooMany', { n: remaining })}</span>
			{:else if found.length > 0}
				<span class="text-muted">{$t('auto.tapToDrop')}</span>
			{/if}
		</p>

		<div class="flex gap-2">
			<button class="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium" onclick={onclose}>
				{$t('common.cancel')}
			</button>
			<button
				class="flex-[2] rounded-lg bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-40"
				disabled={kept.length === 0}
				onclick={accept}
			>
				{$t('auto.keep', { n: kept.length })}
			</button>
		</div>

	</div>

</div>

<style>
	.sweep {
		transform-origin: 50% 50%;
		animation-name: sweep;
		animation-timing-function: cubic-bezier(0.5, 0, 0.5, 1);
		animation-iteration-count: infinite;
	}

	.pulse {
		transform-origin: 50% 50%;
		animation: pulse 1.6s ease-in-out infinite;
	}

	@keyframes sweep {
		to {
			transform: rotate(1turn);
		}
	}

	@keyframes pulse {
		50% {
			transform: scale(1.35);
			opacity: 0.65;
		}
	}

	/* A steady target for anyone who would rather the screen held still. */
	@media (prefers-reduced-motion: reduce) {
		.sweep,
		.pulse {
			animation: none;
		}
	}
</style>
