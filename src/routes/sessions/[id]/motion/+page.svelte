<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { formatTime } from '$lib/prefs';
	import { setPageUp } from '$lib/nav';
	import {
		getSession,
		listActivities,
		listEnds,
		listSessions,
		listShots,
		listWristMotion
	} from '$lib/db/repository';
	import { importWristMotion } from '$lib/watch/store';
	import { decode, findShots } from '$lib/watch/motion';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	/**
	 * Whether the watch's recordings of this session are sound: how many, how long, the rate the
	 * sensors really gave, and whether the shots show. A check on the recording, not an analysis of
	 * the shot. See doc/llm-memory/wrist-motion.md.
	 */

	const sessionId = $derived($page.params.id as string);
	$effect(() => setPageUp(`/sessions/${sessionId}`));

	interface Row {
		key: number;
		label: string;
		counter: string | null;
		arm: string | null;
		startedAt: number;
		durationMs: number;
		kb: number;
		hz: number;
		gapMs: number;
		gravity: number;
		found: number;
		labelled: number | null;
		/** Acceleration, thinned to what a phone width can show, and where the shots were. */
		line: string;
		marks: number[];
		error: string | null;
	}

	let rows = $state<Row[] | null>(null);
	let newestFirst = $state(true);
	const shown = $derived(
		rows && [...rows].sort((a, b) => (newestFirst ? b.startedAt - a.startedAt : a.startedAt - b.startedAt))
	);

	$effect(() => {
		void load(sessionId);
	});

	async function load(id: string) {
		rows = null;
		await importWristMotion().catch(() => undefined);
		const session = await getSession(id);
		if (!session) {
			rows = [];
			return;
		}
		const activities = await listActivities(id);
		const ids = new Set(activities.map((activity) => activity.id));
		// Training recordings carry no session, so they belong to this one until the next one began.
		const later = (await listSessions())
			.map((other) => other.startedAt)
			.filter((at) => at > session.startedAt);
		const until = later.length > 0 ? Math.min(...later) : Infinity;
		const recorded = (await listWristMotion()).filter((row) =>
			row.activityId === 'training'
				? row.startedAt >= session.startedAt && row.startedAt < until
				: ids.has(row.activityId)
		);

		const counted = new Map<string, number>();
		for (const activity of activities) {
			for (const end of await listEnds(activity.id)) {
				const shots = (await listShots(end.id)).filter((shot) => shot.side === 'us');
				counted.set(`${activity.id}:${end.stageIndex}:${end.endNo}`, shots.length);
			}
		}

		const built: Row[] = [];
		for (const row of recorded) {
			const training = row.activityId === 'training';
			const label = training
				? row.arrowsAfter === null
					? $t('wristMotion.trainingOpen', { from: row.arrowsBefore ?? 0 })
					: $t('wristMotion.training', { from: row.arrowsBefore ?? 0, to: row.arrowsAfter })
				: row.shotOrdinal === null
					? $t('wristMotion.end', { n: row.endNo })
					: row.endedOnShot
						? $t('wristMotion.endArrow', { n: row.endNo, o: row.shotOrdinal })
						: $t('wristMotion.endAfter', { n: row.endNo });
			const labelled = training
				? row.arrowsAfter === null
					? null
					: row.arrowsAfter - (row.arrowsBefore ?? 0)
				: row.shotOrdinal !== null
					? row.endedOnShot
						? 1
						: 0
					: (counted.get(`${row.activityId}:${row.stageIndex}:${row.endNo}`) ?? null);
			const base = {
				key: row.id,
				label,
				counter: training && row.countedBy ? row.countedBy : null,
				arm: row.arm,
				startedAt: row.startedAt,
				durationMs: row.durationMs,
				kb: Math.round((row.data.length * 3) / 4 / 1024),
				labelled
			};
			try {
				const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
				const samples = await decode(bytes);
				built.push({ ...base, ...measure(samples, row.durationMs), error: null });
			} catch (error) {
				built.push({
					...base,
					hz: 0,
					gapMs: 0,
					gravity: 0,
					found: 0,
					line: '',
					marks: [],
					error: String(error)
				});
			}
		}
		rows = built;
	}

	const WIDTH = 300;
	const HEIGHT = 48;
	/** m/s² at the top of the line: a release reaches about 47, so this keeps every one on the chart. */
	const TOP = 50;

	function measure(samples: Awaited<ReturnType<typeof decode>>, durationMs: number) {
		const { accel } = samples;
		const n = accel.t.length;
		let gapMs = 0;
		for (let i = 1; i < n; i++) gapMs = Math.max(gapMs, accel.t[i] - accel.t[i - 1]);
		const size = accel.t.map((_, i) => Math.hypot(accel.x[i], accel.y[i], accel.z[i]));
		const sorted = [...size].sort((a, b) => a - b);
		const span = Math.max(1, durationMs);
		// The loudest sample in each column, so a release is never thinned away.
		const columns = new Array(WIDTH).fill(0);
		for (let i = 0; i < n; i++) {
			const column = Math.min(WIDTH - 1, Math.floor((accel.t[i] / span) * WIDTH));
			columns[column] = Math.max(columns[column], size[i]);
		}
		const line = columns
			.map((value, x) => `${x},${(HEIGHT - (Math.min(value, TOP) / TOP) * HEIGHT).toFixed(1)}`)
			.join(' ');
		const shots = findShots(samples);
		return {
			hz: n / (span / 1000),
			gapMs,
			gravity: sorted[Math.floor(sorted.length / 2)] ?? 0,
			found: shots.length,
			line,
			marks: shots.map((at) => (at / span) * WIDTH)
		};
	}

	const totals = $derived(
		rows && {
			n: rows.length,
			minutes: Math.round(rows.reduce((sum, row) => sum + row.durationMs, 0) / 60_000),
			shots: rows.reduce((sum, row) => sum + row.found, 0)
		}
	);
</script>

<PageHeader motif="session">
	{#snippet lead()}
		<div class="flex items-center gap-2">
			<a href="/sessions/{sessionId}" class="-ml-1 text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
			<h1 class="truncate text-2xl font-bold tracking-tight">{$t('wristMotion.title')}</h1>
		</div>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-3 p-4">
	{#if rows === null}
		<p class="text-sm text-muted">{$t('wristMotion.loading')}</p>
	{:else if rows.length === 0}
		<p class="text-sm text-muted">{$t('wristMotion.none')}</p>
	{:else}
		<div class="flex items-center justify-between gap-3">
			{#if totals}
				<p class="text-sm text-muted">{$t('wristMotion.summary', totals)}</p>
			{/if}
			<button
				class="press shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium"
				onclick={() => (newestFirst = !newestFirst)}
			>
				{newestFirst ? $t('wristMotion.newestFirst') : $t('wristMotion.oldestFirst')}
			</button>
		</div>
		<p class="text-xs text-muted">{$t('wristMotion.legend')}</p>
		{#each shown ?? [] as row (row.key)}
			<section class="rounded-xl border border-line bg-surface p-3.5">
				<div class="flex items-baseline justify-between gap-3">
					<p class="font-medium">{row.label}</p>
					<p class="tabular shrink-0 text-sm text-muted">
						{$formatTime(row.startedAt)} · {Math.round(row.durationMs / 1000)} s
					</p>
				</div>
				{#if row.error}
					<p class="mt-2 text-sm text-danger">{$t('wristMotion.broken', { error: row.error })}</p>
				{:else}
					<p class="mt-1 text-sm">
						{row.labelled === null
							? $t('wristMotion.shotsNoLabel', { found: row.found })
							: $t('wristMotion.shots', { found: row.found, labelled: row.labelled })}
						{#if row.counter}
							<span class="text-muted">
								· {$t(row.counter === 'watch' ? 'wristMotion.byWatch' : 'wristMotion.byArcher')}
							</span>
						{/if}
					</p>
					<svg
						class="mt-2 h-12 w-full text-muted"
						viewBox="0 0 {WIDTH} {HEIGHT}"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						{#each row.marks as x, i (i)}
							<line x1={x} x2={x} y1="0" y2={HEIGHT} class="text-brand" stroke="currentColor" stroke-width="2" />
						{/each}
						<polyline
							points={row.line}
							fill="none"
							stroke="currentColor"
							stroke-width="1"
							vector-effect="non-scaling-stroke"
						/>
					</svg>
					<p class="tabular mt-1 text-xs text-muted">
						{$t('wristMotion.rate', { hz: row.hz.toFixed(0) })} ·
						{$t('wristMotion.gap', { ms: Math.round(row.gapMs) })} ·
						{$t('wristMotion.gravity', { g: row.gravity.toFixed(1) })} ·
						{$t('wristMotion.size', { kb: row.kb })} ·
						{row.arm === 'bow'
							? $t('wristMotion.armBow')
							: row.arm === 'string'
								? $t('wristMotion.armString')
								: $t('wristMotion.noArm')}
					</p>
				{/if}
			</section>
		{/each}
	{/if}
</div>
