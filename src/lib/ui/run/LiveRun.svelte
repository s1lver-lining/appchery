<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { clock } from '$lib/domain/running';
	import { splitsNow } from '$lib/domain/run/track';
	import type { RunStep } from '$lib/domain/run/workout';
	import { blockColour, blockTint } from './kinds';
	import { paceUnitKey, sayPace, saySplit, type PaceUnit } from './pace';
	import { sayDistance } from './distance';
	import type { LiveRun } from '$lib/run/live.svelte';

	/**
	 * A run while it is being run.
	 *
	 * Read at arm's length, in the sun, at a pace: three numbers large enough to take in without
	 * stopping, the block being run above them, and the controls along the bottom edge where a thumb
	 * already is. Everything else is below the fold, because mid run there is nothing else worth
	 * looking at.
	 */
	let { run }: { run: LiveRun } = $props();

	let jumping = $state(false);
	let stopping = $state(false);
	/** Minutes a kilometre unless this run is told otherwise, and told afresh on every run. */
	let unit = $state<PaceUnit>('pace');
	const swap = () => (unit = unit === 'pace' ? 'speed' : 'pace');

	const name = (step: RunStep) => step.label?.trim() || $t(`workouts.blockKinds.${step.kind}`);

	/** What a block asks for, said the way it is run: a time, a distance, or nothing in particular. */
	const goalOf = (step: RunStep) =>
		step.goal.type === 'time'
			? clock(step.goal.seconds)
			: step.goal.type === 'distance'
				? sayDistance(step.goal.metres, $t)
				: $t('workouts.goalOpen');

	const steps = $derived(run.steps);
	const step = $derived(run.step);
	// By key, because the steps are unrolled afresh on every read and never the same objects twice.
	const stepAt = $derived(steps.findIndex((one) => one.key === step?.key) + 1);
	const progress = $derived(run.stepProgress);
	const splits = $derived(splitsNow(run.track, run.seconds));
	const paused = $derived(run.status === 'paused');
</script>

<div class="mx-auto w-full max-w-page space-y-3 p-4 pb-40">
	{#if run.failure}
		<p class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
			{$t(
				run.failure === 'denied'
					? 'running.noPermission'
					: run.failure === 'location-off'
						? 'running.locationOff'
						: 'running.unsupported'
			)}
		</p>
	{:else if !run.background}
		<p class="rounded-xl border border-line bg-sunk p-3 text-xs text-muted">
			{$t('running.browserOnly')}
		</p>
	{/if}

	{#if step}
		<!-- The block being run, and the one tap that says the runner is somewhere else in the programme. -->
		<button class="press w-full rounded-2xl border border-line bg-surface p-4 text-left" onclick={() => (jumping = true)}>
			<div class="flex items-center gap-2">
				<span
					class="rounded-full px-2.5 py-1 text-xs font-semibold"
					style="background:{blockTint(step.kind)};color:{blockColour(step.kind)}"
				>
					{name(step)}
				</span>
				<span class="text-xs text-muted">
					{$t('running.blockOf', { n: stepAt, of: steps.length })}
					{#if step.repeatOf > 1}
						· {$t('running.repeatOf', { n: step.repeat, of: step.repeatOf })}
					{/if}
				</span>
				<span class="ml-auto text-muted"><Icon name="list" size={18} /></span>
			</div>

			<div class="mt-2 flex items-end justify-between gap-3">
				<p class="text-3xl font-bold tabular">
					{step.goal.type === 'distance' ? sayDistance(progress.done, $t) : clock(progress.done)}
					<span class="text-base font-medium text-muted">/ {goalOf(step)}</span>
				</p>
				{#if step.targetPace}
					<p class="text-right text-sm text-muted tabular">
						{$t('running.blockTarget', { pace: sayPace(step.targetPace, unit) })}
						<span
							class="block text-lg font-semibold {run.stepPace && run.stepPace <= step.targetPace + 10
								? 'text-accent'
								: 'text-danger'}"
						>
							{sayPace(run.stepPace, unit)}
						</span>
					</p>
				{/if}
			</div>

			{#if progress.goal !== null}
				<div class="mt-2 h-2 overflow-hidden rounded-full bg-sunk">
					<div class="h-full rounded-full bg-brand transition-[width]" style="width: {progress.share * 100}%"></div>
				</div>
			{/if}
		</button>
	{/if}

	<!-- The three numbers the run is actually run on. -->
	<section class="rounded-2xl border border-line bg-surface p-4 text-center">
		{#if paused}
			<p class="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{$t('running.paused')}</p>
		{/if}
		<p class="text-6xl leading-none font-bold tabular {paused ? 'text-muted' : ''}">
			{clock(run.seconds)}
		</p>
		<div class="mt-4 grid grid-cols-2 gap-3">
			<div>
				<p class="text-4xl leading-none font-bold tabular">{(run.distanceM / 1000).toFixed(2)}</p>
				<p class="mt-1 text-xs tracking-wide text-muted uppercase">{$t('running.km')}</p>
			</div>
			<!-- Tapped to swap the unit, which is the one preference a runner has about a number. -->
			<button class="press" onclick={swap}>
				<p class="text-4xl leading-none font-bold tabular">{sayPace(run.pace, unit)}</p>
				<p class="mt-1 text-xs tracking-wide text-muted uppercase">{$t(paceUnitKey(unit))}</p>
			</button>
		</div>
		<div class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted tabular">
			<span>{$t('running.averagePace')} {sayPace(run.averagePace, unit)}</span>
			<span>{$t('running.elevation')} {sayDistance(run.track.elevationGainM, $t)}</span>
			{#if run.heart !== null}
				<!-- Only while the wrist is actually talking: a figure that stays behind when the watch
				     goes quiet is a heart rate from five minutes ago read as the runner's now. -->
				<span class="flex items-center gap-1 font-semibold" style="color:var(--c-run-heart)">
					<Icon name="heart" size={13} filled />
					{$t('running.bpmValue', { n: run.heart })}
				</span>
			{/if}
		</div>
	</section>

	<section class="rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.splits')}</h2>
		{#if splits.length === 0}
			<p class="text-sm text-muted">{$t('running.noSplits')}</p>
		{:else}
			<ul class="space-y-1">
				{#each splits as split (split.index)}
					<li class="flex items-center gap-3 text-sm tabular">
						<span class="w-14 text-muted">{$t('running.splitNumber', { n: split.index })}</span>
						<span class="flex-1 font-semibold">{clock(split.seconds)}</span>
						{#if split.partial}
							<span class="text-xs text-muted">
								{sayDistance(split.distanceM, $t)} · {$t('running.splitPartial')}
							</span>
						{:else}
							<span class="text-xs text-muted">
								{saySplit(split.seconds, split.distanceM, unit)}
								{$t(paceUnitKey(unit))}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<!-- Along the bottom edge, thumb sized, and in the same place whether the run is going or paused. -->
<div class="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-3 backdrop-blur">
	<div class="mx-auto flex w-full max-w-page gap-2">
		<button
			class="press flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-bold
				{paused ? 'bg-brand text-brand-ink' : 'border border-line'}"
			onclick={() => (paused ? run.start() : run.pause())}
		>
			<Icon name={paused ? 'play' : 'pause'} size={22} />
			{$t(paused ? 'running.resume' : 'running.pause')}
		</button>

		{#if steps.length > 0}
			<button
				class="press flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-line text-[0.65rem] font-semibold"
				onclick={() => run.advance()}
			>
				<Icon name="flag" size={20} />
				{$t('running.skip')}
			</button>
		{/if}

		<button
			class="press flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-danger/50 text-[0.65rem] font-semibold text-danger"
			onclick={() => (stopping = true)}
		>
			<Icon name="stop" size={20} />
			{$t('running.stop')}
		</button>
	</div>
</div>

<Sheet open={jumping} title={$t('running.jump')} onclose={() => (jumping = false)}>
	<p class="mb-2 text-xs text-muted">{$t('running.jumpHint')}</p>
	<ul class="space-y-1">
		{#each steps as one (one.key)}
			<li>
				<button
					class="press flex w-full items-center gap-2 rounded-xl border p-2.5 text-left
						{one.key === step?.key ? 'border-brand bg-brand/10' : 'border-line'}"
					onclick={() => {
						run.jumpTo(one.key);
						jumping = false;
					}}
				>
					<span
						class="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
						style="background:{blockTint(one.kind)};color:{blockColour(one.kind)}"
					>
						{name(one)}
					</span>
					<span class="text-sm tabular">{goalOf(one)}</span>
					{#if one.targetPace}
						<span class="text-xs text-muted tabular">{sayPace(one.targetPace, unit)}</span>
					{/if}
					{#if one.repeatOf > 1}
						<span class="ml-auto text-xs text-muted">
							{$t('running.repeatOf', { n: one.repeat, of: one.repeatOf })}
						</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

{#if stopping}
	<ConfirmDialog
		title={$t('running.stopTitle')}
		message={$t('running.stopBody')}
		confirmLabel={$t('running.stopConfirm')}
		onconfirm={() => {
			stopping = false;
			run.stop();
		}}
		oncancel={() => (stopping = false)}
	/>
{/if}
