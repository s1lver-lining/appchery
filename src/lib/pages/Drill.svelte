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
		rankingIsThin,
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
	 * A drill, shot arrow by arrow at the same keypad a round is scored on. Everything on show is
	 * read from the arrows on the sheet, so taking one back gives back the life it cost.
	 */
	let { activity, onchange }: { activity: ActivityRow; onchange: () => void } = $props();

	let drill = $state<Drill>(parseDrill(null));
	let shots = $state<DrillShot[]>([]);
	let endCount = $state(0);
	/** When the last end was written, taken from the sheet so a reload cannot skip a pause. */
	let lastEndAt = $state(0);
	let pending = $state<Omit<Shot, 'ordinal'>[]>([]);
	let mode = $state<'number' | 'face'>('number');
	let padOpen = $state(true);
	let loadedFrom = $state<string | null>(null);
	let confirmingStop = $state(false);
	let autoScoring = $state(false);
	/** Ticks only while something is counting down, so a still page costs nothing. */
	let now = $state(Date.now());
	/** Writes run one after another: two fast taps would otherwise claim the same end number. */
	let writes: Promise<void> = Promise.resolve();

	const definition = $derived(drillDefinition(drill.game));
	const scoreSet = $derived(getScoreSet(drill.face.scoreSetId));
	const perEnd = $derived(endSize(drill));
	/** The arrows on the sheet and the ones on the screen: the rule reads both, or it reads late. */
	const live = $derived<DrillShot[]>([
		...shots,
		...pending.map((shot, i) => ({ ...shot, ordinal: i + 1 }))
	]);
	const outcome = $derived(summarise(drill, live, now));
	const face = $derived(usesFace(drill));

	const plotted = $derived<Shot[]>(
		shots
			.filter((shot) => shot.x !== null && shot.y !== null)
			.map((shot) => ({ ...shot, source: 'plotted' as const }))
	);
	const pendingShots = $derived<Shot[]>(pending.map((shot, i) => ({ ...shot, ordinal: i + 1 })));

	/** The arrows only. Never the rule: after a save of our own the prop is a version behind. */
	async function loadShots() {
		const { ends, shotsByEnd } = await loadSheet(activity.id);
		endCount = ends.length;
		lastEndAt = ends.length === 0 ? 0 : (ends[ends.length - 1].createdAt ?? 0);
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

	/** One call always stands ready, and arrows taken back take their calls with them. */
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

	async function startClock() {
		drill.state.startedAt = Date.now();
		now = Date.now();
		await save();
	}

	async function stop() {
		confirmingStop = false;
		if (pending.length > 0) commit([...pending]);
		drill.state.endedAt = Date.now();
		await writes;
		await save();
	}

	async function reopen() {
		drill.state.endedAt = null;
		padOpen = true;
		await save();
	}

	/** The pause the one arrow drill is made of, counted from the last end rather than ticked. */
	const waiting = $derived(
		drill.game === 'onePressure' && lastEndAt > 0 && !outcome.done
			? Math.max(0, drill.config.seconds - Math.floor((now - lastEndAt) / 1000))
			: 0
	);

	/** Arrows entered but not written when a clock ends the drill under them: they were still shot. */
	$effect(() => {
		if (outcome.done && pending.length > 0) commit([...pending]);
	});

	const ticking = $derived(
		drill.state.endedAt === null &&
			((drill.game === 'beatTheClock' && drill.state.startedAt !== null) ||
				(drill.game === 'onePressure' && lastEndAt > 0))
	);

	$effect(() => {
		if (!ticking) return;
		const timer = setInterval(() => (now = Date.now()), 500);
		return () => clearInterval(timer);
	});

	function commit(next: Omit<Shot, 'ordinal'>[]) {
		pending = [];
		writes = writes.then(async () => {
			await recordEnd(activity.id, 0, endCount + 1, next);
			now = Date.now();
			await loadShots();
			await ensureCall();
			await save();
		});
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

	/** Plotting takes the value from where it landed, so score and position cannot disagree. */
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

	/** The whole end, because an end is what was written: the rule is then read again over the rest. */
	async function undoLast() {
		if (pending.length > 0) {
			pending = pending.slice(0, -1);
			await ensureCall();
			return;
		}
		if (shots.length === 0) return;
		writes = writes.then(async () => {
			await deleteLastEnd(activity.id);
			await loadShots();
			await ensureCall();
			await save();
		});
	}

	/** Keys that are not what the drill asks for, faded rather than locked: a six still scores six. */
	const dim = $derived((zone: Zone) => {
		if (drill.game === 'calledShot')
			return outcome.called !== null && zone.label !== outcome.called;
		const wanted =
			drill.game === 'shrinkingZone'
				? outcome.stepLabel
				: definition.fields.includes('threshold')
					? drill.config.thresholdLabel
					: null;
		return wanted !== null && !meetsRing(scoreSet, zone.label, wanted);
	});

	/** The one figure the drill is about, and whether it has anything to say yet. */
	const headline = $derived.by(() => {
		const figure = (label: string, value: string, empty = false) => ({ label, value, empty });
		switch (drill.game) {
			case 'lives':
				return figure($t('drill.livesLeft'), String(outcome.livesLeft ?? 0));
			case 'streak':
				return figure($t('drill.bestStreak'), String(outcome.bestStreak));
			case 'shrinkingZone':
				return figure($t('drill.stepRing'), outcome.stepLabel ?? $t('drill.finished'));
			case 'targetScore':
				return figure($t('drill.score'), `${outcome.score} / ${drill.config.goal}`);
			case 'beatTheClock':
				return figure($t('drill.score'), String(outcome.score));
			case 'blindBale':
				return figure($t('drill.blindArrows'), String(outcome.arrows));
			case 'arrowSorting':
				return figure($t('drill.arrows'), String(outcome.arrows));
			default:
				return outcome.rate === null
					? figure($t('drill.rate'), $t('drill.noReading'), true)
					: figure($t('drill.rate'), `${Math.round(outcome.rate * 100)}%`);
		}
	});

	const rating = $derived(drill.state.ratings[0] ?? null);

	/** The second figure worth having, when there is one. */
	const subline = $derived.by(() => {
		if (drill.game === 'blindBale')
			return rating === null ? null : $t('drill.meanRating', { rating: $t(`drill.ratings.${rating}`) });
		if (drill.game === 'targetScore') return $t('drill.arrowsUsed', { n: outcome.arrows });
		if (drill.game === 'streak') return $t('drill.onNow', { n: outcome.currentStreak });
		if (drill.game === 'lives' || drill.game === 'shrinkingZone')
			return $t('drill.arrowsUsed', { n: outcome.arrows });
		if (outcome.remaining !== null && !outcome.done)
			return $t('drill.remaining', { n: outcome.remaining });
		return null;
	});

	const thinRanking = $derived(rankingIsThin(outcome.ranking));

	async function countBlind(delta: number) {
		buzz();
		drill.state.blindArrows = Math.max(0, drill.state.blindArrows + delta);
		await save();
	}

	async function rate(value: number) {
		drill.state.ratings = rating === value ? [] : [value];
		await save();
	}
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col">
	<div class="safe-top flex h-[calc(100dvh-4.6rem)] flex-col gap-3 p-4 pt-6">
		<header class="flex shrink-0 items-center gap-2">
			<a
				href="/sessions/{activity.sessionId}"
				class="shrink-0 text-muted"
				aria-label={$t('common.back')}
			>
				<Icon name="back" size={22} />
			</a>
			<h1 class="min-w-0 flex-1 truncate text-center text-base font-bold">
				{$t(`drill.game.${drill.game}.name`)}
			</h1>
			<span class="shrink-0 text-xs text-muted">
				{face ? drillFaceLabel(drill.face) : ''}
			</span>
		</header>

		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
			<!-- The one figure the drill is about, and the clock when it runs against one. -->
			<section class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex items-end justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs text-muted">{headline.label}</p>
						<p class="tabular text-4xl font-bold {headline.empty ? 'text-muted' : ''}">
							{headline.value}
						</p>
						{#if subline}<p class="mt-0.5 text-xs text-muted">{subline}</p>{/if}
					</div>
					{#if definition.timed}
						<div class="shrink-0 text-right">
							{#if outcome.secondsLeft === null}
								<button
									class="press rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-ink"
									onclick={startClock}
								>
									{$t('drill.startClock')}
								</button>
							{:else}
								<p class="text-xs text-muted">{$t('drill.clock')}</p>
								<p
									class="tabular text-3xl font-bold {outcome.secondsLeft <= 10 ? 'text-danger' : ''}"
								>
									{outcome.secondsLeft}
								</p>
							{/if}
						</div>
					{/if}
				</div>

				<p class="mt-2 text-xs text-muted">{$t(`drill.game.${drill.game}.hint`)}</p>
			</section>

			<!-- Shot at no face, so it counts its own arrows and keeps how they felt. -->
			{#if !face}
				<section class="rounded-2xl border border-line bg-surface p-4">
					<div class="flex gap-2">
						{#each [1, 3, 6] as step (step)}
							<button
								class="press flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
								onclick={() => countBlind(step)}
							>
								{$t('drill.addArrows', { n: step })}
							</button>
						{/each}
						<button
							class="press rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted disabled:opacity-40"
							disabled={drill.state.blindArrows === 0}
							onclick={() => countBlind(-1)}
						>
							{$t('drill.removeArrow')}
						</button>
					</div>

					<h2 class="mt-4 mb-2 text-sm font-semibold text-muted">{$t('drill.rating')}</h2>
					<div class="flex gap-1">
						{#each [1, 2, 3, 4, 5] as value (value)}
							<button
								class="press flex-1 rounded-lg border px-1 py-2 text-xs font-medium
									{rating === value ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
								onclick={() => rate(value)}
							>
								{$t(`drill.ratings.${value}`)}
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Which shaft of the set lands somewhere else, once there are enough plots to say. -->
			{#if drill.game === 'arrowSorting'}
				<section class="rounded-2xl border border-line bg-surface p-4">
					<h2 class="text-sm font-semibold">{$t('drill.ranking')}</h2>
					<p class="mt-1 text-xs text-muted">{$t('drill.rankingHint')}</p>
					{#if outcome.ranking.length === 0}
						<p class="mt-3 text-sm text-muted">{$t('drill.rankingEmpty')}</p>
					{:else if thinRanking}
						<p class="mt-3 text-sm text-muted">{$t('drill.rankingThin')}</p>
					{:else}
						<div class="mt-3 overflow-x-auto">
							<table class="w-full text-sm">
								<thead class="text-xs text-muted">
									<tr>
										<th class="py-1 text-left font-medium">{$t('drill.arrowNo')}</th>
										<th class="py-1 text-right font-medium">{$t('drill.offGroup')}</th>
										<th class="py-1 text-right font-medium">{$t('drill.ownGroup')}</th>
										<th class="py-1 text-right font-medium">{$t('drill.average')}</th>
									</tr>
								</thead>
								<tbody>
									{#each outcome.ranking as entry (entry.ordinal)}
										<tr class="border-t border-line">
											<td class="py-1.5 font-medium">{entry.ordinal}</td>
											<td class="tabular py-1.5 text-right">
												{entry.offset === null ? $t('drill.noReading') : entry.offset.toFixed(2)}
											</td>
											<td class="tabular py-1.5 text-right">
												{entry.spread === null ? $t('drill.noReading') : entry.spread.toFixed(2)}
											</td>
											<td class="tabular py-1.5 text-right">{entry.mean.toFixed(1)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>
			{/if}

			{#if outcome.done}
				<section class="rounded-2xl border border-line bg-surface p-4">
					<p class="text-sm text-muted">{$t('drill.over')}</p>
					<div class="mt-3 flex gap-2">
						{#if drill.state.endedAt !== null}
							<button
								class="press flex-1 rounded-xl border border-line py-2.5 text-sm font-medium"
								onclick={reopen}
							>
								{$t('drill.reopen')}
							</button>
						{/if}
						{#if shots.length > 0}
							<button
								class="press flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-medium text-muted"
								onclick={undoLast}
							>
								<Icon name="back" size={16} />
								{$t('undo.action')}
							</button>
						{/if}
					</div>
				</section>
			{:else}
				<button
					class="press w-full rounded-xl border border-line py-2.5 text-sm font-medium text-muted"
					onclick={() => (confirmingStop = true)}
				>
					{$t('drill.stop')}
				</button>
			{/if}
		</div>

		<!-- The same input a round is scored on, out to both edges: the page is inset, a sheet is not. -->
		{#if face && !outcome.done && padOpen}
			<div class="-mx-4 -mb-4 shrink-0 pb-4">
				<ArrowPad
					flush
					{scoreSet}
					{dim}
					bind:mode
					shots={pendingShots}
					otherShots={plotted}
					onclose={() => (padOpen = false)}
					onpick={tapZone}
					onplot={plot}
				>
					{#snippet title()}
						<span class="tabular font-semibold text-ink">{pending.length} / {perEnd}</span>
					{/snippet}

					{#snippet callout()}
						{#if drill.game === 'calledShot' && outcome.called}
							<span class="text-sm font-semibold text-brand-text">
								{$t('drill.called', { ring: outcome.called })}
							</span>
						{:else if waiting > 0}
							<span class="text-sm font-semibold text-brand-text">
								{$t('drill.waiting', { n: waiting })}
							</span>
						{:else if drill.game === 'onePressure'}
							<span class="text-sm text-muted">{$t('drill.ready')}</span>
						{:else if drill.game === 'shrinkingZone' && outcome.stepLabel}
							<span class="text-sm font-semibold text-brand-text">
								{$t('drill.stepRing')}: {outcome.stepLabel}
							</span>
						{/if}
					{/snippet}

					{#snippet footer()}
						<div class="flex items-stretch gap-2 border-t border-line bg-sunk/60 px-3 py-2">
							<button
								class="press flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40"
								disabled={shots.length === 0 && pending.length === 0}
								onclick={undoLast}
							>
								<Icon name="back" size={18} />
								{$t('undo.action')}
							</button>
							<button
								class="flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-lg border border-brand px-2 py-2 text-sm font-semibold whitespace-nowrap text-brand-text"
								onclick={() => (autoScoring = true)}
							>
								<Icon name="camera" size={18} />
								{$t('auto.open')}
							</button>
						</div>
					{/snippet}
				</ArrowPad>
			</div>
		{:else if face && !outcome.done}
			<button
				class="press shrink-0 rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink"
				onclick={() => (padOpen = true)}
			>
				{$t('drill.enterArrows')}
			</button>
		{/if}
	</div>
</div>

{#if autoScoring}
	<AutoScore
		{scoreSet}
		remaining={perEnd - pending.length}
		videoName="drill-{activity.id}-{endCount + 1}"
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
