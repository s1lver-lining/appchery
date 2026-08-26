<script lang="ts">
	import { t } from '$lib/i18n';
	import { tap as buzz } from '$lib/haptics';
	import Icon from '$lib/ui/Icon.svelte';
	import ArrowPad from '$lib/ui/ArrowPad.svelte';
	import AutoScore from '$lib/ui/AutoScore.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { getScoreSet } from '$lib/domain/rounds/seed';
	import { scoreAt } from '$lib/domain/rounds/geometry';
	import type { Shot, Zone } from '$lib/domain/rounds/types';
	import {
		drawCall,
		drillDefinition,
		drillFaceLabel,
		endSize,
		meetsRing,
		parseDrill,
		summarise,
		usesFace,
		type Drill,
		type DrillShot
	} from '$lib/domain/drills';
	import {
		deleteLastEnd,
		loadSheet,
		recordEnd,
		shotFromPlot,
		shotFromZone,
		updateDrill,
		type ActivityRow
	} from '$lib/db/repository';

	/**
	 * A drill, shot arrow by arrow at the same keypad a round is scored on.
	 *
	 * Everything on show is worked out from the arrows on the sheet, never from a counter kept
	 * alongside them: the rule is applied to the shots every time the page draws, so an arrow taken
	 * back gives back the life it cost and the run it broke, without a line of code that says so.
	 */
	let { activity, onchange }: { activity: ActivityRow; onchange: () => void } = $props();

	let drill = $state<Drill>(parseDrill(null));
	let shots = $state<DrillShot[]>([]);
	let pending = $state<Omit<Shot, 'ordinal'>[]>([]);
	let mode = $state<'number' | 'face'>('number');
	let loadedFrom = $state<string | null>(null);
	let confirmingStop = $state(false);
	let autoScoring = $state(false);
	/** Ticks only while something on the page is counting down, so a still page costs nothing. */
	let now = $state(Date.now());

	const definition = $derived(drillDefinition(drill.game));
	const scoreSet = $derived(getScoreSet(drill.face.scoreSetId));
	const perEnd = $derived(endSize(drill));
	const outcome = $derived(summarise(drill, shots, now));
	const face = $derived(usesFace(drill));

	/** Arrows already on the sheet, drawn faded behind the ones being entered. */
	const plotted = $derived<Shot[]>(
		shots
			.filter((shot) => shot.x !== null && shot.y !== null)
			.map((shot) => ({ ...shot, source: 'plotted' as const }))
	);
	const pendingShots = $derived<Shot[]>(pending.map((shot, i) => ({ ...shot, ordinal: i + 1 })));

	/**
	 * The arrows, and only the arrows. Called after every write, and deliberately never re-reads the
	 * rule from the row: the measurements on the prop are whatever the parent last handed down, which
	 * after a save of our own is one version behind. What is in hand here is the newer of the two.
	 */
	async function loadShots() {
		const { ends, shotsByEnd } = await loadSheet(activity.id);
		shots = ends.flatMap((one) =>
			(shotsByEnd.get(one.id) ?? []).map((shot) => ({
				ordinal: shot.ordinal,
				value: shot.value,
				zoneLabel: shot.zoneLabel,
				x: shot.x,
				y: shot.y
			}))
		);
	}

	/** The whole drill, which is only ever read once: when the page arrives at a different activity. */
	async function load() {
		drill = parseDrill(activity.measurements);
		if (definition.prefersPlot) mode = 'face';
		await loadShots();
		await ensureCall();
	}

	$effect(() => {
		if (loadedFrom === activity.id) return;
		loadedFrom = activity.id;
		load();
	});

	/**
	 * The called ring is drawn once and then kept, because a call redrawn on every render is a call
	 * that changes while the arrow is on the string. One stands ready at all times; arrows taken back
	 * take their calls with them.
	 */
	async function ensureCall() {
		if (drill.game !== 'calledShot') return;
		const wanted = shots.length + pending.length + 1;
		if (drill.state.calls.length === wanted) return;
		const calls = drill.state.calls.slice(0, wanted);
		while (calls.length < wanted) calls.push(drawCall(scoreSet, drill.config));
		drill.state.calls = calls;
		await save();
	}

	async function save() {
		await updateDrill(activity.id, drill);
		onchange();
	}

	/** A clock nobody started is a clock that has not cost the archer anything yet. */
	async function startClock() {
		drill.state.startedAt = Date.now();
		now = Date.now();
		await save();
	}

	async function stop() {
		confirmingStop = false;
		drill.state.endedAt = Date.now();
		pending = [];
		await save();
	}

	async function reopen() {
		drill.state.endedAt = null;
		await save();
	}

	/**
	 * The pause the one arrow drill is made of. Counted from when the last arrow was written rather
	 * than ticked down, so a phone that locked between arrows comes back knowing the wait is over.
	 */
	let lastEndAt = $state(0);
	const waiting = $derived(
		drill.game === 'onePressure' && lastEndAt > 0
			? Math.max(0, drill.config.seconds - Math.floor((now - lastEndAt) / 1000))
			: 0
	);

	/**
	 * Arrows entered but not yet written when the drill ends under them, which only a clock can do.
	 * Written as a short end rather than lost: they were shot, whatever the clock says.
	 */
	$effect(() => {
		if (outcome.done && pending.length > 0) commit([...pending]);
	});

	// Only a page with something counting down needs a heartbeat, and only while it is counting.
	$effect(() => {
		const ticking =
			(definition.timed && drill.state.startedAt !== null && !outcome.done) || waiting > 0;
		if (!ticking) return;
		const timer = setInterval(() => (now = Date.now()), 500);
		return () => clearInterval(timer);
	});



	async function commit(next: Omit<Shot, 'ordinal'>[]) {
		pending = [];
		// The end number carries on from what is already there, so an undo leaves no gap behind it.
		const endNo = Math.ceil(shots.length / perEnd) + 1;
		await recordEnd(activity.id, 0, endNo, next);
		lastEndAt = Date.now();
		now = Date.now();
		await loadShots();
		await ensureCall();
		await save();
	}

	function add(shot: Omit<Shot, 'ordinal'>) {
		if (outcome.done || waiting > 0) return;
		const next = [...pending, shot];
		if (next.length < perEnd) {
			pending = next;
			ensureCall();
			return;
		}
		commit(next);
	}

	function tapZone(zone: Zone) {
		buzz();
		add(shotFromZone(zone));
	}

	/** Plotting derives the value from where it landed, so the score and the position cannot disagree. */
	function plot(x: number, y: number) {
		add(shotFromPlot(scoreAt(scoreSet, x, y), x, y));
	}

	function acceptDetected(points: { x: number; y: number }[]) {
		autoScoring = false;
		let next = [...pending];
		for (const point of points) {
			if (next.length >= perEnd) break;
			next = [...next, shotFromPlot(scoreAt(scoreSet, point.x, point.y), point.x, point.y)];
		}
		if (next.length >= perEnd) commit(next);
		else {
			pending = next;
			ensureCall();
		}
	}

	/**
	 * Taking back the last end. The whole end rather than the last arrow, because an end is what was
	 * written: the rule is then read again over what is left, which is what gives back the life or
	 * the run that arrow cost.
	 */
	async function undoLastEnd() {
		// The arrow on the screen before the ones on the sheet: it is the last one entered.
		if (pending.length > 0) {
			pending = pending.slice(0, -1);
			await ensureCall();
			return;
		}
		if (shots.length === 0) return;
		await deleteLastEnd(activity.id);
		await loadShots();
		await ensureCall();
		await save();
	}

	/** Keys that are not what the drill is asking for, faded rather than locked. */
	const dim = $derived((zone: Zone) => {
		const wanted =
			drill.game === 'shrinkingZone'
				? outcome.stepLabel
				: drill.game === 'calledShot'
					? null
					: definition.fields.includes('threshold')
						? drill.config.thresholdLabel
						: null;
		if (drill.game === 'calledShot')
			return outcome.called !== null && zone.label !== outcome.called;
		return wanted !== null && !meetsRing(scoreSet, zone.label, wanted);
	});

	/** The one figure the drill is about, said in as few words as it can be. */
	const headline = $derived.by(() => {
		switch (drill.game) {
			case 'lives':
				return { label: $t('drill.livesLeft'), value: String(outcome.livesLeft ?? 0) };
			case 'streak':
				return { label: $t('drill.bestStreak'), value: String(outcome.bestStreak) };
			case 'shrinkingZone':
				return {
					label: $t('drill.stepRing'),
					value: outcome.stepLabel ?? $t('drill.finished')
				};
			case 'targetScore':
				return { label: $t('drill.score'), value: `${outcome.score} / ${drill.config.goal}` };
			case 'beatTheClock':
				return {
					label: $t('drill.score'),
					value: String(outcome.score)
				};
			case 'blindBale':
				return { label: $t('drill.blindArrows'), value: String(outcome.arrows) };
			case 'arrowSorting':
				return { label: $t('drill.arrows'), value: String(outcome.arrows) };
			default:
				return {
					label: $t('drill.rate'),
					value: outcome.rate === null ? '–' : `${Math.round(outcome.rate * 100)}%`
				};
		}
	});

	/** What sits under the headline: the second figure worth having, when there is one. */
	const subline = $derived.by(() => {
		if (drill.game === 'blindBale')
			return drill.state.ratings.length === 0
				? null
				: `${$t('drill.meanRating')} ${
						$t(
							`drill.ratings.${Math.round(
								drill.state.ratings.reduce((sum, one) => sum + one, 0) /
									drill.state.ratings.length
							)}`
						)
					}`;
		if (drill.game === 'targetScore') return $t('drill.arrowsUsed', { n: outcome.arrows });
		if (drill.game === 'streak') return $t('drill.onNow', { n: outcome.currentStreak });
		if (drill.game === 'lives' || drill.game === 'shrinkingZone')
			return $t('drill.hitsOf', { hits: outcome.hits, arrows: outcome.arrows });
		if (outcome.remaining !== null && !outcome.done)
			return $t('drill.remaining', { n: outcome.remaining });
		return null;
	});

	const clockLeft = $derived(outcome.secondsLeft);

	async function countBlind(delta: number) {
		drill.state.blindArrows = Math.max(0, drill.state.blindArrows + delta);
		await save();
	}

	async function rate(value: number) {
		drill.state.ratings = [...drill.state.ratings, value];
		await save();
	}
</script>

<div class="mx-auto w-full max-w-2xl space-y-3 p-4 pb-2">
	<!-- What it is and where it was shot, which is everything the row is filed under. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<div class="flex items-start gap-3">
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-text">
				<Icon name={definition.icon} size={20} />
			</span>
			<div class="min-w-0 flex-1">
				<h2 class="font-semibold">{$t(`drill.game.${drill.game}.name`)}</h2>
				<p class="text-xs text-muted">
					{face ? `${drillFaceLabel(drill.face)} · ` : ''}{$t(`drill.game.${drill.game}.hint`)}
				</p>
			</div>
		</div>
	</section>

	<!-- The live band: the one figure the drill is about, big enough to read from the shooting line. -->
	<section class="rounded-2xl border border-line bg-surface p-4">
		<div class="flex items-end justify-between gap-3">
			<div class="min-w-0">
				<p class="text-xs text-muted">{headline.label}</p>
				<p class="text-4xl font-bold tabular">{headline.value}</p>
				{#if subline}<p class="mt-0.5 text-xs text-muted">{subline}</p>{/if}
			</div>
			{#if definition.timed}
				<div class="shrink-0 text-right">
					<p class="text-xs text-muted">{$t('drill.clock')}</p>
					{#if clockLeft === null}
						<button
							class="mt-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
							onclick={startClock}
						>
							{$t('drill.startClock')}
						</button>
					{:else}
						<p class="text-3xl font-bold tabular {clockLeft <= 10 ? 'text-danger' : ''}">
							{clockLeft}
						</p>
					{/if}
				</div>
			{/if}
		</div>

		{#if outcome.done}
			<p class="mt-3 rounded-lg bg-sunk px-3 py-2 text-xs text-muted">{$t('drill.over')}</p>
		{/if}
	</section>

	<!-- Blind bale is shot at nothing, so it has a tally rather than a keypad. -->
	{#if !face}
		<section class="rounded-2xl border border-line bg-surface p-4">
			<h3 class="mb-2 text-sm font-semibold text-muted">{$t('drill.blindArrows')}</h3>
			<div class="flex gap-2">
				{#each [1, 3, 6] as step (step)}
					<button
						class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
						onclick={() => countBlind(step)}
					>
						{$t('drill.addArrows', { n: step })}
					</button>
				{/each}
				<button
					class="rounded-lg border border-line px-3 py-2 text-sm text-muted"
					aria-label={$t('undo.action')}
					onclick={() => countBlind(-1)}
				>
					<Icon name="back" size={16} />
				</button>
			</div>

			<h3 class="mt-4 mb-1 text-sm font-semibold text-muted">{$t('drill.rating')}</h3>
			<p class="mb-2 text-xs text-muted">{$t('drill.ratingHint')}</p>
			<div class="flex gap-1">
				{#each [1, 2, 3, 4, 5] as value (value)}
					<button
						class="flex-1 rounded-lg border border-line py-2 text-xs font-medium"
						onclick={() => rate(value)}
					>
						{$t(`drill.ratings.${value}`)}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- The sorting drill's whole reading: which shaft of the set lands somewhere else. -->
	{#if drill.game === 'arrowSorting'}
		<section class="rounded-2xl border border-line bg-surface p-4">
			<h3 class="text-sm font-semibold text-muted">{$t('drill.ranking')}</h3>
			<p class="mt-1 mb-3 text-xs text-muted">{$t('drill.rankingHint')}</p>
			{#if outcome.ranking.length === 0}
				<p class="text-sm text-muted">{$t('drill.rankingEmpty')}</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="text-xs text-muted">
							<tr>
								<th class="py-1 text-left font-medium">{$t('drill.arrowNo', { n: '' })}</th>
								<th class="py-1 text-right font-medium">{$t('drill.offGroup')}</th>
								<th class="py-1 text-right font-medium">{$t('drill.ownGroup')}</th>
								<th class="py-1 text-right font-medium">{$t('drill.average')}</th>
							</tr>
						</thead>
						<tbody>
							{#each outcome.ranking as entry (entry.ordinal)}
								<tr class="border-t border-line">
									<td class="py-1.5 font-medium">{entry.ordinal}</td>
									<td class="py-1.5 text-right tabular">
										{entry.offset === null ? $t('drill.noReading') : entry.offset.toFixed(2)}
									</td>
									<td class="py-1.5 text-right tabular">
										{entry.spread === null ? $t('drill.noReading') : entry.spread.toFixed(2)}
									</td>
									<td class="py-1.5 text-right tabular">{entry.mean.toFixed(1)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}

	<div class="flex gap-2">
		{#if outcome.done && drill.state.endedAt !== null}
			<button class="flex-1 rounded-xl border border-line py-2 text-sm font-medium" onclick={reopen}>
				{$t('drill.reopen')}
			</button>
		{:else if !outcome.done}
			<button
				class="flex-1 rounded-xl border border-line py-2 text-sm font-medium text-muted"
				onclick={() => (confirmingStop = true)}
			>
				{$t('drill.stop')}
			</button>
		{/if}
		{#if shots.length > 0 || pending.length > 0}
			<button
				class="flex items-center justify-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted"
				onclick={undoLastEnd}
			>
				<Icon name="back" size={16} />
				{$t('undo.action')}
			</button>
		{/if}
	</div>
</div>

<!-- The same input a round is scored on, so nothing here is a new thing to learn. -->
{#if face && !outcome.done}
	<div class="sticky bottom-0 z-20">
		<ArrowPad
			{scoreSet}
			{dim}
			bind:mode
			shots={pendingShots}
			otherShots={plotted}
			flush
			onpick={tapZone}
			onplot={plot}
		>
			{#snippet title()}
				{pending.length} / {perEnd}
			{/snippet}

			{#snippet callout()}
				{#if drill.game === 'calledShot' && outcome.called}
					<span class="text-sm font-semibold text-brand-text">
						{$t('drill.called', { ring: outcome.called })}
					</span>
				{:else if waiting > 0}
					<span class="text-sm font-semibold text-brand-text">{$t('drill.waiting', { n: waiting })}</span>
				{:else if drill.game === 'onePressure'}
					<span class="text-sm text-muted">{$t('drill.ready')}</span>
				{:else if drill.game === 'shrinkingZone' && outcome.stepLabel}
					<span class="text-sm font-semibold text-brand-text">
						{$t('drill.stepRing')}: {outcome.stepLabel}
					</span>
				{/if}
			{/snippet}

			{#snippet footer()}
				<div class="flex gap-2 border-t border-line p-2">
					<button
						class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm text-muted"
						onclick={() => (autoScoring = true)}
					>
						<Icon name="camera" size={16} />
						{$t('auto.open')}
					</button>
				</div>
			{/snippet}
		</ArrowPad>
	</div>
{/if}

{#if autoScoring}
	<AutoScore
		{scoreSet}
		remaining={perEnd - pending.length}
		videoName="drill-{activity.id}-{shots.length}"
		onaccept={acceptDetected}
		onrecorded={() => {}}
		onclose={() => (autoScoring = false)}
	/>
{/if}

{#if confirmingStop}
	<ConfirmDialog
		title={$t('drill.stopConfirm')}
		message={$t('drill.stopBody')}
		confirmLabel={$t('drill.stop')}
		onconfirm={stop}
		oncancel={() => (confirmingStop = false)}
	/>
{/if}
