<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import {
		EFFORTS,
		clock,
		distanceParts,
		emptyRun,
		parseRun,
		type Effort,
		type RunRecord
	} from '$lib/domain/running';
	import { heartOf, paceOf, replayTracked, type TrackedFix } from '$lib/domain/run/track';
	import { parseGpx, toGpx } from '$lib/domain/run/gpx';
	import { zoneOf } from '$lib/domain/run/zones';
	import { pausesOf, samplesOf, type RunPause, type RunSample } from '$lib/domain/run/series';
	import {
		emptyWorkout,
		flatten,
		formatPace,
		snapshotWorkout,
		type RunWorkout
	} from '$lib/domain/run/workout';
	import { workoutSummary } from '$lib/ui/run/summary';
	import { exercise } from '$lib/domain/exercises';
	import { goto } from '$app/navigation';
	import { withOrigin } from '$lib/nav';
	import {
		appendRunPoints,
		clearRunPoints,
		listRunPoints,
		listRunWorkouts,
		markWorkoutUsed,
		saveRunWorkout,
		type ActivityRow
	} from '$lib/db/repository';
	import { shareFile } from '$lib/files';
	import { LiveRun } from '$lib/run/live.svelte';
	import { canTrack } from '$lib/run/source';
	import type { Load, MuscleId } from '$lib/domain/muscles';
	import Icon from '$lib/ui/Icon.svelte';
	import MovementFigure from '$lib/ui/MovementFigure.svelte';
	import MuscleBoard from '$lib/ui/MuscleBoard.svelte';
	import LiveRunView from '$lib/ui/run/LiveRun.svelte';
	import ManualRun from '$lib/ui/run/ManualRun.svelte';
	import RunGraph from '$lib/ui/run/RunGraph.svelte';
	import RunRoute from '$lib/ui/run/RunRoute.svelte';
	import HeartZones from '$lib/ui/run/HeartZones.svelte';
	import { maxHeartRate } from '$lib/prefs';
	import { sayDistance } from '$lib/ui/run/distance';

	/**
	 * A run: set up, run, and looked at afterwards, or simply written down.
	 *
	 * One page for all four because they are one thing at four moments, and a run is opened again
	 * mid way more often than not: a phone put away at a red light comes back to whichever of them it
	 * left. What is shown is decided by the record alone, so the page has no state of its own to lose.
	 */
	let { activity, onchange }: { activity: ActivityRow; onchange: () => void } = $props();

	const run = new LiveRun();
	let loadedFrom = $state<string | null>(null);
	let workouts = $state<RunWorkout[]>([]);

	$effect(() => {
		if (loadedFrom === activity.id) return;
		loadedFrom = activity.id;
		// A run created before this device could track keeps whatever it was created as.
		const record: RunRecord = activity.measurements
			? parseRun(activity.measurements)
			: emptyRun(canTrack() ? 'tracked' : 'manual');
		run.open(activity.id, record);
	});

	// Read again on every arrival, so a programme edited and come back from is shown as it is now.
	$effect(() => {
		void activity.id;
		listRunWorkouts().then(async (all) => {
			workouts = all;
			// And taken again, because the wrist is shown what the run would be, not what it was.
			const source = run.record?.workout?.sourceId ?? null;
			const latest = source ? all.find((one) => one.id === source) : null;
			if (latest && run.status === 'idle') await run.setWorkout(snapshotWorkout(latest));
		});
	});

	onDestroy(() => {
		void run.close();
	});

	// Picked up again after the screen was off: the service may have paused or finished the run.
	$effect(() => {
		const woke = () => {
			if (document.visibilityState === 'visible') void run.resumed();
		};
		document.addEventListener('visibilitychange', woke);
		return () => document.removeEventListener('visibilitychange', woke);
	});

	const record = $derived(run.record);
	const status = $derived(run.status);
	const tracked = $derived(record?.mode === 'tracked');

	async function edited(next: RunRecord) {
		if (!run.record) return;
		run.record.distanceM = next.distanceM;
		run.record.durationSeconds = next.durationSeconds;
		await run.persist();
		onchange();
	}

	async function setEffort(level: Effort) {
		if (!run.record) return;
		run.record.effort = run.record.effort === level ? null : level;
		await run.persist();
		onchange();
	}

	async function choose(id: string) {
		const workout = workouts.find((one) => one.id === id) ?? null;
		await run.setWorkout(workout ? snapshotWorkout(workout) : null);
		if (workout) await markWorkoutUsed(workout.id);
	}

	/** Written on the programmes page rather than in a form here: there is one place for that. */
	async function writeOne() {
		const fresh = emptyWorkout($t('workouts.newWorkout'));
		await saveRunWorkout(fresh);
		await run.setWorkout(snapshotWorkout(fresh));
		goto(withOrigin(`/workouts/${fresh.id}`, here));
	}

	/**
	 * Copied afresh at the start rather than when it was picked, so a programme edited in between is
	 * the one that gets run and the copy the run keeps is still its own.
	 */
	async function start() {
		const source = run.record?.workout?.sourceId ?? null;
		if (source) {
			workouts = await listRunWorkouts();
			const latest = workouts.find((one) => one.id === source);
			if (latest) await run.setWorkout(snapshotWorkout(latest));
		}
		await run.start();
		onchange();
	}

	const here = $derived(`/activities/${activity.id}`);
	const chosen = $derived(record?.workout?.sourceId ?? '');
	/**
	 * The library's copy rather than the run's, until the run starts. The run holds a copy of its own
	 * so that history cannot be rewritten, but before the start there is no history: what is offered
	 * has to be the programme as it is now, or editing one and coming back shows it as it was.
	 */
	const offered = $derived(workouts.find((one) => one.id === chosen) ?? record?.workout ?? null);
	const running = $derived(exercise('running'));
	const load = $derived((running?.load ?? {}) as Partial<Record<MuscleId, Load>>);
	const steps = $derived(record?.workout ? flatten(record.workout) : []);
	const stepName = (key: string) => {
		const step = steps.find((one) => one.key === key);
		return step ? step.label?.trim() || $t(`workouts.blockKinds.${step.kind}`) : key;
	};

	const summaryOf = (workout: RunWorkout) => workoutSummary(workout, $t);

	/**
	 * The track itself, read once a run is over. The splits and the totals live on the activity, but
	 * the graph is the fixes, and there is no point holding thousands of them while one is running.
	 */
	let samples = $state<RunSample[]>([]);
	/** Where the run was held, which is what explains a gap in the lines and in the kilometres. */
	let pauses = $state<RunPause[]>([]);
	/** The fixes themselves, for the route: a drawing of where it went is not a series of figures. */
	let fixes = $state<TrackedFix[]>([]);
	/** The run's clock where the finger is on the graph, so the route can mark the same moment. */
	let scrubbing = $state<number | null>(null);
	/** A kilometre picked off the list, which is the other way of asking the graph about a moment. */
	let showing = $state<number | null>(null);
	/** Whether the route is painted by pace, which it is not until it is asked for. */
	let routeByPace = $state(false);
	let tab = $state<'splits' | 'graph'>('splits');
	let importing = $state(false);
	let importFailed = $state(false);

	$effect(() => {
		const id = activity.id;
		if (status !== 'done') {
			samples = [];
			fixes = [];
			pauses = [];
			return;
		}
		listRunPoints(id).then((points) => {
			if (activity.id !== id) return;
			samples = samplesOf(points);
			pauses = pausesOf(points);
			fixes = points;
		});
	});

	/** The run as the rest of the world reads one, handed to whatever the phone shares files with. */
	async function exportGpx() {
		const points = await listRunPoints(activity.id);
		if (points.length === 0) return;
		const name = record?.workout?.name?.trim() || $t('running.title');
		const day = new Date(record?.live?.startedAt ?? points[0].at).toISOString().slice(0, 10);
		const text = toGpx(points, name, record?.live?.startedAt ?? null);
		await shareFile(new Blob([text], { type: 'application/gpx+xml' }), `${day} ${name}.gpx`, name);
	}

	/**
	 * Somebody else's watch, read in as a run of ours.
	 *
	 * The file is the track and nothing else: the totals are worked out here through the same gates
	 * a tracked run is measured by, so a run imported and a run recorded add up the same way and the
	 * graph reads one shape. Only ever into a run with nothing in it yet, which is why the button is
	 * gone the moment there is.
	 */
	async function importGpx(file: File) {
		if (!run.record) return;
		importing = true;
		importFailed = false;
		try {
			const read = parseGpx(await file.text());
			if (read.fixes.length < 2) {
				importFailed = true;
				return;
			}
			await clearRunPoints(activity.id);
			await appendRunPoints(activity.id, read.fixes);
			const track = replayTracked(read.fixes);
			const last = read.fixes[read.fixes.length - 1];
			const beats = heartOf(read.fixes);
			run.record.mode = 'tracked';
			run.record.live = {
				status: 'done',
				startedAt: read.startedAt,
				baseSeconds: last.elapsedSeconds,
				legStartedAt: null,
				stepKey: null,
				stepFrom: { seconds: 0, distanceM: 0 }
			};
			run.record.distanceM = Math.round(track.distanceM) || null;
			run.record.durationSeconds = Math.round(last.elapsedSeconds) || null;
			run.record.splits = track.splits;
			run.record.elevationGainM = Math.round(track.elevationGainM);
			run.record.averageHeartRate = beats?.average ?? null;
			run.record.maxHeartRate = beats?.max ?? null;
			run.record.steps = [];
			await run.persist();
			samples = samplesOf(read.fixes as TrackedFix[]);
			pauses = pausesOf(read.fixes as TrackedFix[]);
			fixes = read.fixes;
			onchange();
		} finally {
			importing = false;
		}
	}

	/** What the run averaged out at, in the runner's own terms, which is what colours the figure. */
	const averageZone = $derived(zoneOf(record?.averageHeartRate ?? null, $maxHeartRate));

	/** The run's own total, which is the one distance read to the hundred metres rather than the metre. */
	const total = $derived(distanceParts(record?.distanceM ?? 0, 2));

	/** The clock at the end of each kilometre, which is the figure a runner reads down the column. */
	const reached = $derived(
		(record?.splits ?? []).reduce<number[]>(
			(running, split) => [...running, (running[running.length - 1] ?? 0) + split.seconds],
			[]
		)
	);

	const paces = $derived(
		(record?.splits ?? []).map((split) => paceOf(split.distanceM, split.seconds) ?? 0).filter((pace) => pace > 0)
	);
	const averagePace = $derived(paces.length > 0 ? paces.reduce((sum, pace) => sum + pace, 0) / paces.length : 0);
	const fastestPace = $derived(paces.length > 0 ? Math.min(...paces) : 0);
	const fastest = $derived(
		(record?.splits ?? []).find((split) => paceOf(split.distanceM, split.seconds) === fastestPace)?.index ?? -1
	);

	/**
	 * How long a kilometre's bar is. Drawn against the run's own average rather than from zero,
	 * because from zero every kilometre of a run is nearly the same length and the one that hurt is
	 * invisible. The spread is stretched to fill the bar, with a floor under it so the slowest
	 * kilometre is still a bar rather than a sliver.
	 */
	function barOf(pace: number): number {
		if (pace <= 0 || paces.length === 0) return 0;
		const slowest = Math.max(...paces);
		if (slowest === fastestPace) return 100;
		// Faster is longer: the bar reads as how well the kilometre went, not as how long it took.
		return 30 + ((slowest - pace) / (slowest - fastestPace)) * 70;
	}
</script>

{#if record && tracked && (status === 'running' || status === 'paused')}
	<LiveRunView {run} />
{:else if record}
	<div class="mx-auto w-full max-w-page space-y-4 p-4">
		{#if tracked && status === 'idle'}
			<!-- Before the start: which programme, and one button that is hard to miss with a thumb. -->
			<section class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex items-center gap-2">
					<span class="text-sm font-semibold text-muted">{$t('running.ready')}</span>
					<a class="ml-auto text-sm font-medium text-brand-text" href={withOrigin('/workouts', here)}>
						{$t('workouts.title')}
					</a>
				</div>

				<div class="mt-2 flex gap-2">
					<select
						class="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 text-base"
						aria-label={$t('running.chooseWorkout')}
						value={chosen}
						onchange={(event) => choose(event.currentTarget.value)}
					>
						<option value="">{$t('running.freeRun')}</option>
						{#each workouts as workout (workout.id)}
							<option value={workout.id}>{workout.name || $t('workouts.newWorkout')}</option>
						{/each}
					</select>

					{#if chosen}
						<a
							class="press flex items-center justify-center rounded-lg border border-line px-3 text-muted"
							aria-label={$t('workouts.open')}
							href={withOrigin(`/workouts/${chosen}`, here)}
						>
							<Icon name="edit" size={18} />
						</a>
					{:else}
						<button
							class="press rounded-lg border border-line px-3 text-sm font-semibold"
							onclick={writeOne}
						>
							{$t('workouts.create')}
						</button>
					{/if}
				</div>

				<p class="mt-2 text-xs text-muted tabular">
					{offered ? summaryOf(offered) : $t('running.freeRunHint')}
				</p>
			</section>

			<button
				class="press flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-brand text-2xl font-bold text-brand-ink"
				onclick={start}
			>
				<Icon name="play" size={28} />
				{$t('running.start')}
			</button>
			<button class="press w-full py-2 text-sm text-muted" onclick={() => run.setMode('manual')}>
				{$t('running.switchToHand')}
			</button>

			<!--
				A file from another watch, read in as a run of this one. Only while there is nothing to
				lose: a run already recorded is not something an import should be able to walk over.
			-->
			<label class="press block w-full cursor-pointer py-2 text-center text-sm text-muted">
				<span class="mr-1 inline-block align-[-3px] rotate-180"><Icon name="download" size={16} /></span>
				{importing ? $t('running.importing') : $t('running.importGpx')}
				<input
					class="hidden"
					type="file"
					accept=".gpx,application/gpx+xml,text/xml"
					onchange={(event) => {
						const file = event.currentTarget.files?.[0];
						event.currentTarget.value = '';
						if (file) void importGpx(file);
					}}
				/>
			</label>
			{#if importFailed}
				<p class="text-center text-xs text-danger">{$t('running.importFailed')}</p>
			{/if}
		{/if}

		{#if tracked && status === 'done'}
			<!-- What it came to. The tracked figures lead, and the fields under them are for putting right. -->
			<section class="rounded-2xl border border-line bg-surface p-4 text-center">
				<p class="text-5xl leading-none font-bold tabular">
					{total.value}
					<span class="text-lg font-medium text-muted">
						{total.unit === 'km' ? $t('running.km') : $t('running.metresShort')}
					</span>
				</p>
				<div class="mt-3 grid grid-cols-3 gap-2 text-sm">
					<div>
						<p class="text-xl font-bold tabular">{clock(record.durationSeconds ?? 0)}</p>
						<p class="text-xs text-muted">{$t('running.elapsed')}</p>
					</div>
					<div>
						<p class="text-xl font-bold tabular">
							{formatPace(paceOf(record.distanceM ?? 0, record.durationSeconds ?? 0)) || '–:--'}
						</p>
						<p class="text-xs text-muted">{$t('running.averagePace')}</p>
					</div>
					<div>
						<p class="text-xl font-bold tabular">
							{sayDistance(record.elevationGainM ?? 0, $t)}
						</p>
						<p class="text-xs text-muted">{$t('running.elevation')}</p>
					</div>
				</div>

				{#if record.averageHeartRate}
					<!-- Beside the rest rather than on a card of its own: it is a figure of the run. -->
					<div class="mt-3 flex items-center justify-center gap-4 border-t border-line pt-3 text-sm">
						<span
							class="flex items-center gap-1.5"
							style="color:{averageZone ? `var(--c-zone-${averageZone})` : 'var(--c-run-heart)'}"
						>
							<Icon name="heart" size={16} filled />
							<span class="font-bold tabular">
								{$t('running.bpmValue', { n: record.averageHeartRate })}
							</span>
						</span>
						{#if record.maxHeartRate}
							<span class="text-muted tabular">
								{$t('running.heartMax', { n: record.maxHeartRate })}
							</span>
						{/if}
					</div>
				{/if}

				{#if fixes.length > 1}
				<button class="press mt-3 w-full py-1 text-sm font-medium text-brand-text" onclick={exportGpx}>
					<span class="mr-1 inline-block align-[-3px]"><Icon name="download" size={16} /></span>
					{$t('running.exportGpx')}
				</button>
				{/if}
			</section>

			{#if record.splits.length > 0 || samples.length > 1}
				<section class="rounded-2xl border border-line bg-surface p-4">
					<!-- Two readings of the same run: what each kilometre came to, and why it did. -->
					<div class="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-line bg-sunk p-0.5">
						{#each [{ key: 'splits', label: $t('running.splits') }, { key: 'graph', label: $t('running.graph') }] as option (option.key)}
							<button
								class="press truncate rounded-md px-2 py-1.5 text-xs font-medium {tab === option.key
									? 'bg-brand text-brand-ink'
									: 'text-muted'}"
								aria-pressed={tab === option.key}
								onclick={() => {
									tab = option.key as 'splits' | 'graph';
									scrubbing = null;
									showing = null;
								}}
							>
								{option.label}
							</button>
						{/each}
					</div>

					{#if tab === 'splits'}
						<ul class="space-y-1.5">
							{#each record.splits as split, i (split.index)}
								{@const pace = paceOf(split.distanceM, split.seconds) ?? 0}
								<!-- The row is the way into the graph at that kilometre: the table says
								     which one was slow and only the graph says what happened in it. -->
								<li>
								<button
									class="press flex w-full items-center gap-2 text-left text-sm tabular"
									onclick={() => {
										showing = reached[i];
										tab = 'graph';
									}}
								>
									<span class="w-10 shrink-0 text-xs text-muted">
										{$t('running.splitNumber', { n: split.index })}
									</span>
									<!--
										A bar each, drawn against the run's own average rather than from zero.
										From zero every kilometre of a run is nearly the same length and the one
										that hurt is invisible; against the average, it is the only one that is.
									-->
									<span class="relative h-5 flex-1 overflow-hidden rounded-md bg-sunk">
										<span
											class="absolute inset-y-0 left-0 rounded-md"
											style="width:{barOf(pace)}%;background:{pace <= averagePace
												? 'var(--c-run-work)'
												: 'var(--c-run-pace)'};opacity:0.35"
										></span>
										{#if split.index === fastest}
											<!-- The best kilometre said outright: it is the one worth finding. -->
											<span class="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-semibold" style="color:var(--c-run-work)">
												{$t('running.fastestKm')}
											</span>
										{/if}
										<span class="absolute inset-y-0 left-2 flex items-center text-xs font-semibold">
											{formatPace(pace)} {$t('running.perKm')}
										</span>
									</span>
									<!-- Where the run had got to, not how long the kilometre took: for a whole
									     kilometre that is the pace again, said a second time. -->
									<span class="w-12 shrink-0 text-right text-xs text-muted">{clock(reached[i])}</span>
								</button>
								</li>
							{:else}
								<li class="py-4 text-center text-xs text-muted">{$t('running.noSplits')}</li>
							{/each}
						</ul>
					{:else if samples.length > 1}
						<RunGraph {samples} {pauses} focus={showing} onscrub={(at) => (scrubbing = at)} />
						{#if fixes.length > 1}
							<!-- Under the graph rather than above it: the shape of the ground is what
							     explains the lines, and it is read after them rather than instead. -->
							<div class="mt-3 border-t border-line pt-3">
								<!-- Marked where the finger is on the graph, so the two are one reading. -->
								<RunRoute {fixes} {samples} at={scrubbing ?? showing} byPace={routeByPace} />
								<!-- Off unless asked for: a route is read for its shape before anything
								     else, and three colours over it is the shape harder to see. -->
								<button
									class="press mx-auto mt-1 block py-1 text-xs font-medium text-muted"
									aria-pressed={routeByPace}
									onclick={() => (routeByPace = !routeByPace)}
								>
									{routeByPace ? $t('running.routePlain') : $t('running.routeByPace')}
								</button>
							</div>
						{/if}
					{:else}
						<p class="py-8 text-center text-xs text-muted">{$t('running.noTrack')}</p>
					{/if}
				</section>
			{/if}

			{#if $maxHeartRate > 0}
				<HeartZones {fixes} max={$maxHeartRate} />
			{/if}

			{#if record.laps.length > 0}
				<!-- Above the block results and the kilometres: a lap is what the runner chose to
				     measure, and what they chose is what they came back to read. -->
				<section class="rounded-2xl border border-line bg-surface p-4">
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.laps')}</h2>
					<ul class="space-y-1">
						{#each record.laps as lap (lap.index)}
							<li class="flex items-center gap-3 text-sm tabular">
								<span class="w-14 text-muted">{$t('running.lapNumber', { n: lap.index })}</span>
								<span class="flex-1 font-semibold">{clock(lap.seconds)}</span>
								<span class="text-xs text-muted">
									{sayDistance(lap.distanceM, $t)} · {formatPace(paceOf(lap.distanceM, lap.seconds)) || '–:--'}
									{$t('running.perKm')}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if record.steps.length > 0}
				<section class="rounded-2xl border border-line bg-surface p-4">
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.blockResults')}</h2>
					<ul class="space-y-1">
						{#each record.steps as step (step.key)}
							<li class="flex items-center gap-3 text-sm">
								<span class="min-w-0 flex-1 truncate">{stepName(step.key)}</span>
								<span class="tabular text-muted">
									{sayDistance(step.distanceM, $t)} · {clock(step.seconds)}
								</span>
								<span class="w-14 text-right font-semibold tabular">
									{formatPace(paceOf(step.distanceM, step.seconds)) || '–:--'}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="rounded-2xl border border-line bg-surface p-4">
				<h2 class="mb-3 text-sm font-semibold text-muted">{$t('running.correct')}</h2>
				<ManualRun run={record} onchange={edited} />
			</section>
		{/if}

		{#if !tracked}
			<section class="rounded-2xl border border-line bg-surface p-4">
				<ManualRun run={record} onchange={edited} />
			</section>

			{#if record.distanceM === null && record.durationSeconds === null}
				{#if canTrack()}
					<button class="press w-full py-2 text-sm text-muted" onclick={() => run.setMode('tracked')}>
						{$t('running.switchToTrack')}
					</button>
				{/if}

			<!--
				A file from another watch, read in as a run of this one. Only while there is nothing to
				lose: a run already recorded is not something an import should be able to walk over.
			-->
			<label class="press block w-full cursor-pointer py-2 text-center text-sm text-muted">
				<span class="mr-1 inline-block align-[-3px] rotate-180"><Icon name="download" size={16} /></span>
				{importing ? $t('running.importing') : $t('running.importGpx')}
				<input
					class="hidden"
					type="file"
					accept=".gpx,application/gpx+xml,text/xml"
					onchange={(event) => {
						const file = event.currentTarget.files?.[0];
						event.currentTarget.value = '';
						if (file) void importGpx(file);
					}}
				/>
			</label>
			{#if importFailed}
				<p class="text-center text-xs text-danger">{$t('running.importFailed')}</p>
			{/if}
			{/if}
		{/if}

		{#if !tracked || status === 'done'}
			<section class="rounded-2xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.effort')}</h2>
				<p class="mb-3 text-xs text-muted">{$t('running.effortHint')}</p>
				<div class="flex gap-1">
					{#each EFFORTS as level (level)}
						<button
							class="press flex-1 rounded-lg border py-2 text-xs font-medium {record.effort === level
								? 'border-brand bg-brand/10 font-semibold'
								: 'border-line'}"
							onclick={() => setEffort(level)}
						>
							{$t(`running.efforts.${level}`)}
						</button>
					{/each}
				</div>
			</section>

			<section class="rounded-2xl border border-line bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold text-muted">{$t('running.whatItWorks')}</h2>
				<div class="grid gap-3 sm:grid-cols-2">
					{#if running}
						<MovementFigure movement={running.movement} class="w-full max-h-[26vh]" />
					{/if}
					<div class="mx-auto max-w-[13rem]">
						<MuscleBoard {load} class="max-h-[28vh] w-full" />
					</div>
				</div>
			</section>
		{/if}
	</div>
{/if}
