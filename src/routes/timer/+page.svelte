<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import {
		TIMER_PRESETS,
		lightFor,
		remainingAt,
		formatClock,
		type TimerPreset
	} from '$lib/domain/timer';
	import { whistle, whistleMs, unlockSound } from '$lib/whistle';
	import { timerSound, timerPreset, timerTimes, timerPrepSeconds, timerVolume } from '$lib/prefs';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';
	import { screenLock } from '$lib/ui/wakeLock';
	import { fullscreenSupported, isFullscreen, onFullscreenChange, setFullscreen } from '$lib/fullscreen';
	import { ownsStatusBar } from '$lib/ui/statusBar';

	/**
	 * The shooting clock. It runs the way a line is run: two blasts to come up, one to start, thirty
	 * seconds of amber, three blasts to collect. The time left is worked out from the moment the clock
	 * was started rather than ticked down, so a phone that slept through half an end wakes up right.
	 */
	const origin = $derived(originOf($page.url, '/'));
	$effect(() => setPageUp(origin));

	/** The rules' times, with anything the archer has changed put over the top of them. */
	const times = $derived(
		TIMER_PRESETS.map((entry) => ({ ...entry, seconds: $timerTimes[entry.key] ?? entry.seconds }))
	);
	const preset = $derived(times.find((entry) => entry.key === $timerPreset) ?? times[0]);
	let editing = $state(false);

	let startedAt = $state<number | null>(null);
	/** How far the start sequence has got: the two blasts, the walk up, then the start blast. */
	let phase = $state<'idle' | 'lineUp' | 'prep' | 'start'>('idle');
	/** While the line walks up: the clock is not running yet, but it is not idle either. */
	let preparingUntil = $state<number | null>(null);
	let now = $state(Date.now());
	/** Which half of an alternating end is on the clock, for the pages that shoot in turns. */
	let turn = $state(1);

	const total = $derived(preset.seconds);
	const prep = $derived(Math.max(0, Math.round($timerPrepSeconds)));
	const remaining = $derived(startedAt === null ? total : remainingAt(startedAt, total, now));
	const running = $derived(startedAt !== null && remaining > 0);
	const preparing = $derived(phase !== 'idle');
	// The blasts either side of the walk up show it whole and show it spent: the sequence never stalls.
	const prepLeft = $derived(
		phase === 'lineUp'
			? prep
			: phase === 'prep' && preparingUntil !== null
				? Math.max(0, Math.ceil((preparingUntil - now) / 1000))
				: 0
	);
	// Nobody may shoot while the line is walking up, which is the same thing red says at the end.
	const light = $derived(preparing ? 'red' : lightFor(remaining, total, startedAt !== null));

	// A frame loop rather than an interval: the clock is read, never counted, so a missed tick is free.
	$effect(() => {
		if (!running && !preparing) return;
		let frame = requestAnimationFrame(function step() {
			now = Date.now();
			frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	});

	/**
	 * Three blasts to collect the arrows, scheduled off the start stamp rather than off the frame
	 * loop: a backgrounded or sleeping phone draws no frames, and the end of an end still has to
	 * sound. Never the five blast stop signal, which means somebody is walking out there.
	 */
	$effect(() => {
		if (startedAt === null) return;
		const left = remainingAt(startedAt, total, Date.now()) * 1000;
		const timer = setTimeout(() => {
			if ($timerSound) whistle('end');
		}, left);
		return () => clearTimeout(timer);
	});

	/**
	 * The screen is the clock, so it must not go dark while an end is being shot. Released the moment
	 * the clock stops, because holding the screen awake through a whole session flattens a phone.
	 */
	const lock = screenLock(() => navigator.wakeLock?.request('screen'));
	$effect(() => {
		if (!running) return;
		lock.acquire();
		return () => lock.release();
	});

	/** An emptied field falls back to what the rules say rather than to a clock of zero seconds. */
	function setTime(key: string, raw: string) {
		const seconds = Math.round(Number(raw));
		startedAt = null;
		timerTimes.update((all) => {
			const next = { ...all };
			if (!Number.isFinite(seconds) || seconds < 5) delete next[key];
			else next[key] = seconds;
			return next;
		});
	}

	function choose(next: TimerPreset) {
		callOff();
		timerPreset.set(next.key);
		startedAt = null;
		turn = 1;
	}

	/**
	 * Two blasts, the preparation time, one blast, then the clock: the start is a sequence, not a
	 * button. It can be called off part way through, so each run carries a token and a stale one
	 * starts nothing.
	 */
	let calling = 0;
	const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

	async function callUp() {
		unlockSound();
		const token = ++calling;
		const sound = $timerSound;
		// Marked before the first blast, because a button that does nothing for a second reads as broken.
		phase = 'lineUp';

		if (sound) {
			whistle('lineUp');
			await wait(whistleMs('lineUp'));
			if (token !== calling) return;
		}

		// Kept even with the sound off: the pause is time the archers are given, not a gap between noises.
		if (prep > 0) {
			now = Date.now();
			phase = 'prep';
			preparingUntil = now + prep * 1000;
			await wait(prep * 1000);
			if (token !== calling) return;
			preparingUntil = null;
		}

		phase = 'start';
		if (sound) {
			whistle('start');
			await wait(whistleMs('start'));
			if (token !== calling) return;
		}
		start();
	}

	/** Nothing half started survives: a called off sequence leaves the clock where it was. */
	function callOff() {
		calling += 1;
		phase = 'idle';
		preparingUntil = null;
	}

	function start() {
		phase = 'idle';
		now = Date.now();
		startedAt = now;
	}

	function stop() {
		// The same three blasts the clock ends on: stopping early still means the end is called and the
		// arrows collected. Five blasts mean somebody is walking out there, and only the signal says it.
		const early = remaining > 0;
		callOff();
		startedAt = null;
		if ($timerSound && early) whistle('end');
	}

	function reset() {
		callOff();
		startedAt = null;
		turn = preset.alternating ? (turn === 1 ? 2 : 1) : 1;
	}

	/**
	 * The clock alone, for when the phone is propped up as the line's timer: nothing on the screen but
	 * the time and the button that runs it. Browser fullscreen is asked for on top of it where it
	 * exists, and the mode survives on its own where it does not, so iPhone Safari still gets the view.
	 */
	let bare = $state(false);
	/** Turned by hand rather than by the device, because a propped phone is not free to rotate itself. */
	let rotated = $state(false);

	function showBare(on: boolean) {
		bare = on;
		if (fullscreenSupported()) void setFullscreen(on);
		if (!on) rotated = false;
	}

	// Escape and the system gesture leave fullscreen without telling the page, so the browser is asked.
	$effect(() => onFullscreenChange(() => (bare = bare && isFullscreen())));

	const BAND: Record<string, string> = {
		idle: 'bg-sunk text-muted',
		green: 'bg-[var(--c-win)] text-white',
		amber: 'bg-accent text-brand-ink',
		red: 'bg-danger text-white'
	};
</script>

<PageHeader motif="session" title={$t('timer.title')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<!-- Drawn once and shown twice: the page and the bare clock must never disagree about the time. -->
{#snippet clockFace(sizing: string, digits: string)}
	<section
		class="flex flex-col items-center justify-center rounded-2xl transition-colors {sizing} {BAND[
			light
		]}"
	>
		<!-- Announced before the clock runs, because the archers are owed the walk up as well as the end. -->
		{#if startedAt === null && !preparing && prep > 0}
			<p class="mb-1 text-sm font-medium opacity-80">
				{$t('timer.prepAhead', { time: formatClock(prep) })}
			</p>
		{/if}
		<p class="tabular leading-none font-bold {digits}">
			{formatClock(preparing ? prepLeft : remaining)}
		</p>
		<p class="mt-2 text-sm font-medium opacity-80">
			{preparing ? $t('timer.preparation') : $t(`timer.preset.${preset.key}`)}
			{#if preset.alternating}
				· {$t('timer.turn', { n: turn })}
			{/if}
		</p>
	</section>
{/snippet}

{#snippet runButton()}
	{#if running || preparing}
		<button
			class="press flex-1 rounded-xl border border-line bg-surface py-3 font-semibold"
			onclick={stop}
		>
			{$t('timer.stop')}
		</button>
	{:else}
		<button
			class="press flex-1 rounded-xl bg-brand py-3 font-semibold text-brand-ink"
			onclick={callUp}
		>
			{$t('timer.start')}
		</button>
	{/if}
{/snippet}

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	{@render clockFace('py-10', 'text-7xl')}

	<div class="flex gap-2">
		{@render runButton()}
		<button
			class="press rounded-xl border border-line bg-surface px-4 py-3 font-semibold"
			onclick={reset}
		>
			{preset.alternating ? $t('timer.nextTurn') : $t('timer.reset')}
		</button>
		<!-- Beside the buttons it hides: one tap from the clock to the clock on its own. -->
		<button
			class="press rounded-xl border border-line bg-surface px-4 py-3"
			aria-label={$t('timer.fullscreen')}
			title={$t('timer.fullscreen')}
			onclick={() => showBare(true)}
		>
			<Icon name="expand" size={20} />
		</button>
	</div>

	<section>
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-muted">{$t('timer.times')}</h2>
			<button class="text-sm font-medium text-brand-text" onclick={() => (editing = true)}>
				{$t('timer.edit')}
			</button>
		</div>
		<div class="grid gap-2 sm:grid-cols-2">
			{#each times as entry (entry.key)}
				<button
					class="press flex items-center gap-3 rounded-xl border p-3 text-left
						{preset.key === entry.key ? 'border-brand bg-brand/5' : 'border-line bg-surface'}"
					onclick={() => choose(entry)}
				>
					<span class="tabular w-12 shrink-0 text-lg font-bold">{formatClock(entry.seconds)}</span>
					<span class="min-w-0 flex-1">
						<span class="block text-sm font-medium">{$t(`timer.preset.${entry.key}`)}</span>
						<span class="block text-xs text-muted">
							{$t('round.arrows', { n: entry.arrows })}
						</span>
					</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="rounded-xl border border-line bg-surface p-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="font-medium">{$t('timer.soundTitle')}</p>
				<p class="mt-0.5 text-sm text-muted">{$t('timer.soundHint')}</p>
			</div>
			<Toggle
				checked={$timerSound}
				label={$t('timer.soundTitle')}
				onchange={(v) => {
					unlockSound();
					timerSound.set(v);
				}}
			/>
		</div>

		<!-- Heard, not read: the slider sounds a blast as it is let go, so a level is chosen by ear. -->
		<div class="mt-3 flex items-center gap-3 border-t border-line pt-3">
			<span class="text-sm text-muted">{$t('timer.volume')}</span>
			<input
				type="range"
				min="0"
				max="0.6"
				step="0.02"
				class="min-w-0 flex-1 accent-brand"
				aria-label={$t('timer.volume')}
				value={$timerVolume}
				oninput={(event) => timerVolume.set(Number(event.currentTarget.value))}
				onchange={() => {
					unlockSound();
					whistle('start');
				}}
			/>
		</div>

		<div class="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
			{#each ['lineUp', 'start', 'end', 'stop'] as const as signal (signal)}
				<button
					class="press rounded-lg border border-line px-3 py-1.5 text-sm"
					onclick={() => {
						unlockSound();
						whistle(signal);
					}}
				>
					{$t(`timer.signal.${signal}`)}
				</button>
			{/each}
		</div>
		<p class="mt-2 text-xs text-muted">{$t('timer.signalHint')}</p>
	</section>
</div>

<!-- The rules' times are a starting point: a club shoots to its own clock and this is where it is set. -->
<Sheet open={editing} title={$t('timer.edit')} onclose={() => (editing = false)}>
	<ul class="space-y-2">
		<!-- Not a shooting time: the pause before the clock, which is why it sits above the presets. -->
		<li class="flex items-center gap-2 border-b border-line pb-2">
			<span class="min-w-0 flex-1">
				<span class="block truncate text-sm">{$t('timer.preparation')}</span>
				<span class="block text-[11px] text-muted">{$t('timer.preparationHint')}</span>
			</span>
			<input
				type="number"
				inputmode="numeric"
				min="0"
				step="5"
				class="tabular w-20 shrink-0 rounded-lg border border-line bg-bg p-2 text-center text-sm text-ink"
				aria-label={$t('timer.preparation')}
				value={$timerPrepSeconds}
				onchange={(event) => {
					const seconds = Math.round(Number(event.currentTarget.value));
					timerPrepSeconds.set(Number.isFinite(seconds) && seconds >= 0 ? seconds : 10);
				}}
			/>
			<span class="w-6 shrink-0 text-xs text-muted">{$t('timer.seconds')}</span>
		</li>
		{#each times as entry (entry.key)}
			{@const rule = TIMER_PRESETS.find((preset) => preset.key === entry.key)!}
			<li class="flex items-center gap-2">
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm">{$t(`timer.preset.${entry.key}`)}</span>
					<span class="block text-[11px] text-muted">
						{$t('timer.ruleTime', { time: formatClock(rule.seconds) })}
					</span>
				</span>
				<input
					type="number"
					inputmode="numeric"
					min="5"
					step="5"
					class="tabular w-20 shrink-0 rounded-lg border border-line bg-bg p-2 text-center text-sm text-ink"
					aria-label={$t(`timer.preset.${entry.key}`)}
					value={entry.seconds}
					onchange={(event) => setTime(entry.key, event.currentTarget.value)}
				/>
				<span class="w-6 shrink-0 text-xs text-muted">{$t('timer.seconds')}</span>
			</li>
		{/each}
	</ul>

	{#snippet footer()}
		<button
			class="press flex-1 rounded-lg border border-line py-2 text-sm font-medium"
			onclick={() => {
				timerTimes.set({});
				timerPrepSeconds.set(10);
			}}
		>
			{$t('timer.resetTimes')}
		</button>
		<button
			class="press flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
			onclick={() => (editing = false)}
		>
			{$t('common.done')}
		</button>
	{/snippet}
</Sheet>

<!-- The clock as the line sees it: no presets, no sound panel, nothing to touch by accident. -->
{#if bare}
	<div class="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-bg" use:ownsStatusBar>
		<div
			class="flex flex-col gap-4 p-4 {rotated
				? 'absolute top-1/2 left-1/2 h-[100dvw] w-[100dvh] -translate-x-1/2 -translate-y-1/2 rotate-90'
				: 'h-full w-full'}"
		>
			<div class="flex justify-end gap-2">
				<button
					class="press rounded-xl border border-line bg-surface p-3"
					aria-label={$t('timer.rotate')}
					title={$t('timer.rotate')}
					onclick={() => (rotated = !rotated)}
				>
					<Icon name="rotate" size={20} />
				</button>
				<button
					class="press rounded-xl border border-line bg-surface p-3"
					aria-label={$t('timer.exitFullscreen')}
					title={$t('timer.exitFullscreen')}
					onclick={() => showBare(false)}
				>
					<Icon name="shrink" size={20} />
				</button>
			</div>
			{@render clockFace('min-h-0 flex-1', 'text-[22vmin]')}
			<div class="flex">
				{@render runButton()}
			</div>
		</div>
	</div>
{/if}
