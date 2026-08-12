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
	import { timerSound, timerPreset } from '$lib/prefs';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';

	/**
	 * The shooting clock. It runs the way a line is run: two blasts to come up, one to start, thirty
	 * seconds of amber, three blasts to collect. The time left is worked out from the moment the clock
	 * was started rather than ticked down, so a phone that slept through half an end wakes up right.
	 */
	const origin = $derived(originOf($page.url, '/'));
	$effect(() => setPageUp(origin));

	const preset = $derived(
		TIMER_PRESETS.find((entry) => entry.key === $timerPreset) ?? TIMER_PRESETS[0]
	);

	let startedAt = $state<number | null>(null);
	let now = $state(Date.now());
	/** Which half of an alternating end is on the clock, for the pages that shoot in turns. */
	let turn = $state(1);

	const total = $derived(preset.seconds);
	const remaining = $derived(startedAt === null ? total : remainingAt(startedAt, total, now));
	const running = $derived(startedAt !== null && remaining > 0);
	const light = $derived(lightFor(remaining, total, startedAt !== null));

	// A frame loop rather than an interval: the clock is read, never counted, so a missed tick is free.
	$effect(() => {
		if (!running) return;
		let frame = requestAnimationFrame(function step() {
			now = Date.now();
			frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	});

	/** The three blasts belong to the end finishing, so they sound the moment the clock reaches zero. */
	let ended = false;
	$effect(() => {
		if (startedAt === null || remaining > 0) {
			ended = false;
			return;
		}
		if (ended) return;
		ended = true;
		if ($timerSound) whistle('end');
	});

	/**
	 * The screen is the clock, so it must not go dark while an end is being shot. Released the moment
	 * the clock stops, because holding the screen awake through a whole session flattens a phone.
	 */
	let lock: WakeLockSentinel | null = null;
	$effect(() => {
		if (!running) {
			void lock?.release();
			lock = null;
			return;
		}
		navigator.wakeLock
			?.request('screen')
			.then((sentinel) => (lock = sentinel))
			.catch(() => undefined);
		return () => {
			void lock?.release();
			lock = null;
		};
	});

	function choose(next: TimerPreset) {
		timerPreset.set(next.key);
		startedAt = null;
		turn = 1;
	}

	/** Two blasts, then one, then the clock: the start is a sequence, not a button. */
	async function callUp() {
		unlockSound();
		if (!$timerSound) return start();
		whistle('lineUp');
		await new Promise((done) => setTimeout(done, whistleMs('lineUp') + 400));
		whistle('start');
		setTimeout(start, whistleMs('start'));
	}

	function start() {
		now = Date.now();
		startedAt = now;
	}

	function stop() {
		startedAt = null;
		if ($timerSound) whistle('stop');
	}

	function reset() {
		startedAt = null;
		turn = preset.alternating ? (turn === 1 ? 2 : 1) : 1;
	}

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

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<!-- The clock itself, the size of the screen: it is read from the shooting line, not from a desk. -->
	<section
		class="flex flex-col items-center justify-center rounded-2xl py-10 transition-colors {BAND[light]}"
	>
		<p class="tabular text-7xl leading-none font-bold">{formatClock(remaining)}</p>
		<p class="mt-2 text-sm font-medium opacity-80">
			{$t(`timer.preset.${preset.key}`)}
			{#if preset.alternating}
				· {$t('timer.turn', { n: turn })}
			{/if}
		</p>
	</section>

	<div class="flex gap-2">
		{#if running}
			<button
				class="flex-1 rounded-xl border border-line bg-surface py-3 font-semibold"
				onclick={stop}
			>
				{$t('timer.stop')}
			</button>
		{:else}
			<button
				class="flex-1 rounded-xl bg-brand py-3 font-semibold text-brand-ink"
				onclick={callUp}
			>
				{$t('timer.start')}
			</button>
		{/if}
		<button
			class="rounded-xl border border-line bg-surface px-4 py-3 font-semibold"
			onclick={reset}
		>
			{preset.alternating ? $t('timer.nextTurn') : $t('timer.reset')}
		</button>
	</div>

	<section>
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('timer.times')}</h2>
		<div class="grid gap-2 sm:grid-cols-2">
			{#each TIMER_PRESETS as entry (entry.key)}
				<button
					class="flex items-center gap-3 rounded-xl border p-3 text-left
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

		<div class="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
			{#each ['lineUp', 'start', 'end', 'stop'] as const as signal (signal)}
				<button
					class="rounded-lg border border-line px-3 py-1.5 text-sm"
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
