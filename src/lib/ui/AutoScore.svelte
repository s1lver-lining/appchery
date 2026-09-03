<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import { regionBox, toImageCoords, type FaceLocation, type Impact } from '$lib/vision/pipeline';
	import type { LiveImpact } from '$lib/vision/live';
	import { DETECT_EVERY_MS, LiveScanner } from '$lib/vision/live';
import { SteadyFace } from '$lib/vision/steady';
	import { MotionLog, allowMotion } from '$lib/vision/motion';
	import { scoreAt, decimalScore } from '$lib/domain/rounds/geometry';
	import type { ScoreSet } from '$lib/domain/rounds/types';
	import Icon from './Icon.svelte';
	import {
		recordCameraVideo,
		arrowDetector,
		smoothOverlay,
		recordMotion,
		detectorReadout
	} from '$lib/prefs';
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
	let found = $state<LiveImpact[]>([]);
	let pending = $state(0);
	/** Something worth telling the archer that is not about the arrows, such as a file not written. */
	let notice = $state('');

	// Detection lives in a worker, so a slow pass costs the overlay nothing and the video never stalls.
	/** What the last pass saw. Only read when the readout is on, and only ever shown. */
	let readout = $state({ proposals: 0, early: 0, cost: 0, passes: 0 });

	const scanner = new LiveScanner(() => {
		found = scanner.arrows;
		steady = scanner.steady;
		pending = scanner.pending;
		readout = scanner.readout;
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
	/** Raised by stop, because the archer can close this while the browser is still asking for the camera. */
	let closed = false;

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

	/**
	 * Where a mark is for the purpose of scoring it, which is not where it is drawn.
	 *
	 * The detector found it in the worker's fit of the face, and the worker is the half that searches:
	 * it looks for the face afresh a few times a second, checks the rings agree with it, and refits from
	 * a blob when a stride throws the follow off. The page never does any of that. It takes the worker's
	 * faces only when their number changes and follows them from there, so its fit is a chain hundreds
	 * of frames long with nothing to correct it, and over a sweep it walks: measured against the
	 * worker's, half the readings are within 1.6% of a face radius and a tenth are more than a ring out.
	 *
	 * A mark is rebased into the page's fit so that it is drawn where the drawn rings say, which is the
	 * right thing to draw and the wrong thing to score. Every number this page writes down is read here
	 * instead, in the frame the arrow was actually found in, which is also the only frame anything has
	 * ever been measured in.
	 */
	const scored = (arrow: LiveImpact) => arrow.source ?? arrow;

	/** Highest first, as a scoresheet reads, so the pills are checked in a predictable order. */
	const ranked = $derived(
		[...found].sort((a, b) => {
			const left = scoreAt(scoreSet, scored(a).x, scored(a).y);
			const right = scoreAt(scoreSet, scored(b).x, scored(b).y);
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
	function pillStyle(arrow: LiveImpact): string {
		const zone = scoreAt(scoreSet, scored(arrow).x, scored(arrow).y);
		if (!zone.countsAsHit) return 'background-color: var(--c-sunk); color: var(--c-muted);';
		return `background-color: ${zone.color}; color: ${zone.strokeColor}; box-shadow: inset 0 0 0 1px ${zone.strokeColor}59;`;
	}

	/** Just the tenth, as a suffix: the ring is what matters, the depth is a detail beside it. */
	function detail(arrow: LiveImpact): string {
		const decimal = decimalScore(scoreSet, scored(arrow).x, scored(arrow).y);
		return decimal === null ? '' : `.${Math.round((decimal % 1) * 10)}`;
	}

	$effect(() => {
		start();
		return stop;
	});

	async function start() {
		closed = false;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 1280 } },
				audio: false
			});
			// A stop that ran while the permission sheet was up had no camera yet to let go of, so the
			// answer is handed straight back rather than leaving the light on with nothing watching it.
			if (closed) return stop();
			if (video) {
				video.srcObject = stream;
				await video.play();
			}
			if (closed) return stop();
			starting = false;
			/*
			 * Started whenever the camera is, not only when a recording is being kept. Gravity is the one
			 * thing that can say which way up the boss is, and without it the fit's angular origin drifts
			 * and carries the found arrows round the gold with it. A device that has no such sensor, or an
			 * archer who has refused them, simply gets the old behaviour, and so does one who has turned the
			 * sensors off in settings: that switch is the escape hatch for a device they misbehave on, and
			 * it would be a poor one if something else went on using them.
			 */
			if ($recordMotion) {
				void allowMotion().then((allowed) => {
					if (allowed && !closed) motion.start();
				});
			}
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
		recording = true;
	}

	function save(video: Blob) {
		// Reported straight away: the end keeps the name whether or not the write itself succeeds.
		onrecorded(videoName);
		void storeRecording(video, videoName);
		/**
		 * Said out loud when there is nothing to save. A file that never appears looks the same as a file
		 * that was lost, and the difference matters: a laptop reports no motion at all, while a phone
		 * that reports none has usually refused the permission.
		 */
		if (motion.any) void storeMotion(motion.toJSON(), videoName);
		else if ($recordMotion) notice = $t('settings.motionNone');
	}

	function stop() {
		closed = true;
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
	let lastDetection = 0;

	/** One smoother per face, made on demand, so a three spot's three faces are steadied separately. */
	const steadying: SteadyFace[] = [];
	function smoother(index: number): SteadyFace {
		return (steadying[index] ??= new SteadyFace());
	}

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

	/** The canvas the sharper cut is taken with, kept beside the one the whole frame is reduced on. */
	const regionWork = document.createElement('canvas');

	/**
	 * The paper around the face, cut from the video for the proposer to read.
	 *
	 * Cut from the video element rather than from the reduced frame, which is the whole point: taken
	 * from a picture already shrunk to a quarter, this would be a magnified copy of the same information
	 * rather than more of it. One resampling, by the GPU, straight from the camera.
	 *
	 * Where the box goes is `regionBox`, shared with the replay the labelling tool watches and with the
	 * measuring harness, so the three cannot drift apart. All that differs here is who resamples.
	 */
	function cutRegion(): { frame: { width: number; height: number; data: Uint8ClampedArray }; x: number; y: number; scale: number } | null {
		const face = faces[0];
		if (!video || !face) return null;
		const box = regionBox(face, scanner.scaleFactor, video.videoWidth, video.videoHeight);
		if (!box) return null;

		regionWork.width = box.width;
		regionWork.height = box.height;
		const context = regionWork.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(
			video,
			box.x,
			box.y,
			box.width * box.scale,
			box.height * box.scale,
			0,
			0,
			box.width,
			box.height
		);
		return {
			frame: {
				width: box.width,
				height: box.height,
				data: context.getImageData(0, 0, box.width, box.height).data
			},
			x: box.x,
			y: box.y,
			scale: box.scale
		};
	}

	function tick(now: number) {
		raf = requestAnimationFrame(tick);
		if (!video || video.readyState < 2 || !overlay) return;

		// One sample a frame, so a sample can be paired with the frame it was taken during.
		if (recording) motion.sample(now);
		/*
		 * Which way up the boss is, which is the one thing the picture cannot say. A face is a set of
		 * circles, so the fit is free to describe it from any angle, and left free it wanders and takes
		 * the arrows written in its coordinates with it. Read every frame whether or not anything is
		 * being recorded: this is not a diagnostic, it is what stops the arrows creeping round the gold.
		 */
		scanner.setUp(motion.up);

		const small = reduce();
		if (!small) return;

		/**
		 * The face is followed here and the search is handed away. Nothing on this path waits for a
		 * detection, so the overlay keeps the camera's own rate whatever the detector is costing.
		 */
		faces = scanner.follow(small);
		/**
		 * What the rings are drawn with, which is not quite what was fitted. Nothing is ever read off
		 * this: it exists to stop the lines trembling between frames, and it is handed to `draw` for the
		 * rings alone. The arrows go through `faces`, the fit itself, because a mark on the boss is an
		 * answer and answers are not worth smoothing.
		 */
		const shown = $smoothOverlay ? faces.map((face, i) => smoother(i).show(face)) : faces;
		if (now - lastDetection >= DETECT_EVERY_MS) {
			lastDetection = now;
			// Cut before the offer and after the follow: it is framed on the fit this frame just made.
			const region = cutRegion();
			// Offered last, because both buffers are given away rather than copied.
			scanner.offer(small, region);
		}

		draw(shown, faces, found, overlay, video.videoWidth, video.videoHeight);
	}

	/** The overlay is drawn in the small image's pixels, so every coordinate scales back up. */
	function draw(
		located: FaceLocation[],
		fitted: FaceLocation[],
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
			// The fit, not the smoothed line. Smoothing lags the fit by up to a tenth of a ring, and a
			// ring drawn a tenth of a ring from the shaft is the difference between a 9 and a 10 to look at.
			const face = fitted[arrow.face] ?? located[arrow.face];
			if (!face) return;
			const point = toImageCoords(face, arrow.x, arrow.y);
			context.strokeStyle = index < remaining ? '#3ddc84' : 'rgba(255,255,255,0.4)';
			// Dashed for one offered to make the end's number up rather than one the sweep agreed on, so
			// the archer knows which marks to look at twice.
			context.setLineDash(arrow.unsure ? [width / 120, width / 120] : []);
			context.beginPath();
			context.arc(point.x * scale, point.y * scale, width / 60, 0, Math.PI * 2);
			context.stroke();
			context.setLineDash([]);

			/*
			 * The score written on the picture, where the arrow is, rather than only in the pills below.
			 * That is the reading the pills cannot give: which mark on the boss the detector thinks it
			 * scored. A pill saying 9 is right or wrong depending on which shaft it is about, and only
			 * the archer looking at the boss can say.
			 */
			if (!$detectorReadout) return;
			// Saved, because the line width and the font here are not the ones the rings are drawn with.
			context.save();
			const text = `${label(arrow)}${detail(arrow)}`;
			context.font = `600 ${Math.max(11, width / 40)}px system-ui, sans-serif`;
			context.textAlign = 'center';
			context.textBaseline = 'bottom';
			context.lineWidth = Math.max(2, width / 300);
			context.strokeStyle = 'rgba(0,0,0,0.75)';
			context.strokeText(text, point.x * scale, point.y * scale - width / 45);
			context.fillStyle = '#ffffff';
			context.fillText(text, point.x * scale, point.y * scale - width / 45);
			context.restore();
		});
	}

	function label(arrow: LiveImpact): string {
		return scoreAt(scoreSet, scored(arrow).x, scored(arrow).y).label;
	}

	function accept() {
		onaccept(kept.map((a) => ({ x: scored(a).x, y: scored(a).y })));
		// The arrows stay in the boss, so the detector is told they are scored rather than new.
		scanner.accept();
	}

	function drop(arrow: LiveImpact) {
		scanner.reject(arrow);
		found = found.filter((a) => a !== arrow);
	}

	// The camera view really is black, in either theme, and it covers the scoring page whose own
	// claim on the bar has to come back when this closes.
	$effect(() => overrideStatusBar('#000000'));
</script>

<div class="fixed inset-0 z-[60] flex flex-col bg-black" use:lockScroll>
	<header class="safe-top flex items-center justify-between px-4 py-3 pt-6 text-white">
		<div class="min-w-0">
			<h2 class="text-lg font-bold">{$t('auto.title')}</h2>
			<p class="text-xs text-white/60">{$t('auto.experimental')}</p>
		</div>
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

		<!--
			The readout switch. Deliberately tiny and in a corner: it is a diagnostic, wanted only while
			standing at the boss watching the detector miss something, and it must not compete with the
			camera for the archer's attention the rest of the time.
		-->
		<button
			class="absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase
				tracking-wide {$detectorReadout ? 'bg-white/25 text-white' : 'bg-black/40 text-white/40'}"
			aria-pressed={$detectorReadout}
			aria-label={$t('auto.readout')}
			onclick={() => detectorReadout.set(!$detectorReadout)}
		>
			{$t('auto.readoutShort')}
		</button>

		{#if $detectorReadout}
			<!--
				The same numbers the replay tool burns into a recording, in the same order, so a session
				that went wrong on the field can be described without having to record it first.
			-->
			<div
				class="tabular pointer-events-none absolute bottom-2 left-14 right-2 rounded bg-black/55
					px-2 py-1 text-[9px] leading-relaxed text-white/85"
			>
				<span class={steady ? 'text-[#3ddc84]' : 'text-[#ffc107]'}>
					FACES {faces.length} {steady ? 'STEADY' : 'NOT STEADY'}
				</span>
				<span class="ml-2">
					PROPOSED {readout.proposals} PENDING {pending} UNSURE {readout.early} KEPT {found.length}
				</span>
				<span class="ml-2">PASS {readout.cost.toFixed(0)}MS x{readout.passes}</span>
			</div>
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
								{i < remaining ? '' : 'opacity-40'} {arrow.unsure ? 'border border-dashed border-white/60' : ''}"
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
			{#if notice}
				<span class="text-muted">{notice}</span>
			{:else if found.length > remaining}
				<span class="text-danger">{$t('auto.tooMany', { n: remaining })}</span>
			{:else if found.length > 0}
				<span class="text-muted">{$t('auto.tapToDrop')}</span>
			{/if}
		</p>

		<div class="flex gap-2">
			<button class="press flex-1 rounded-lg border border-line py-2.5 text-sm font-medium" onclick={onclose}>
				{$t('common.cancel')}
			</button>
			<button
				class="press flex-[2] rounded-lg bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-40"
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
