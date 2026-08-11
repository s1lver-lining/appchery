<script lang="ts" module>
	let rippled = false;
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		listSessions,
		listAllActivities,
		listPlanSlots,
		listBows,
		listRevisions,
		createSession,
		updateSession
	} from '$lib/db/repository';
	import { upcoming, nextUp, weekArrowGoal, type Occurrence } from '$lib/domain/plans';
	import {
		overview,
		inRange,
		isComplete,
		summariseByRound,
		type ScoredActivity
	} from '$lib/domain/stats';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import { defaultBowId, dismissedBest, formatTime, dateFormats } from '$lib/prefs';
	import { startOfDay, startOfWeek } from '$lib/domain/dates';
	import { defaultNameKey } from '$lib/domain/sessions';
	import Icon from '$lib/ui/Icon.svelte';
	import HeaderEdge from '$lib/ui/HeaderEdge.svelte';
	import { SNAP_EASE } from '$lib/ui/swipe';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import DateTimeDialog from '$lib/ui/DateTimeDialog.svelte';

	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let scored = $state<ScoredActivity[]>([]);
	let counts = $state<Record<string, number>>({});
	let slots = $state<Awaited<ReturnType<typeof listPlanSlots>>>([]);
	let bows = $state<Awaited<ReturnType<typeof listBows>>>([]);
	let revisions = $state<Awaited<ReturnType<typeof listRevisions>>>([]);
	let planningAt = $state<number | null>(null);

	/**
	 * The target takes a stone once, when the app opens. Held in the module rather than in the
	 * component, because the pager mounts this page again every time it is swiped back to, and
	 * dropped again the moment it has run so nothing can restart an animation that is over.
	 */
	let ripple = $state(!rippled);
	rippled = true;

	async function refresh() {
		sessions = await listSessions();
		slots = await listPlanSlots();
		bows = await listBows();
		const activities = await listAllActivities();
		unfinished = activities.find(
			(a) =>
				a.kind === 'scoring' &&
				a.arrowsShot > 0 &&
				Date.now() - a.startedAt < RESUME_WINDOW &&
				!isComplete({
					id: a.id,
					sessionId: a.sessionId,
					startedAt: a.startedAt,
					totalScore: a.totalScore,
					arrowsShot: a.arrowsShot,
					count10s: a.count10s,
					countX: a.countX,
					roundDefinitionId: a.roundDefinitionId,
					round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
				})
		);
		counts = activities.reduce<Record<string, number>>((acc, a) => {
			acc[a.sessionId] = (acc[a.sessionId] ?? 0) + a.arrowsShot;
			return acc;
		}, {});
		scored = activities
			.filter((a) => a.kind === 'scoring')
			.map((a) => ({
				id: a.id,
				sessionId: a.sessionId,
				startedAt: a.startedAt,
				totalScore: a.totalScore,
				arrowsShot: a.arrowsShot,
				count10s: a.count10s,
				countX: a.countX,
				roundDefinitionId: a.roundDefinitionId,
				round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
			}));
	}
	$effect(() => {
		refresh();
	});

	async function start(kind: 'practice' | 'competition' = 'practice') {
		goto(`/sessions/${await createSession({ kind, bowId: $defaultBowId })}`);
	}

	/**
	 * What is coming: the soonest session still ahead, or the soonest slot a plan calls for. One that
	 * began within the hour still counts, because that is the one being walked into.
	 */
	const next = $derived(
		nextUp<{ at: number; session?: (typeof sessions)[number]; occurrence?: Occurrence }>([
			...sessions.map((session) => ({ at: session.startedAt, session })),
			...upcoming(slots, sessions.map((s) => s.startedAt)).map((occurrence) => ({
				at: occurrence.at,
				occurrence
			}))
		])
	);

	/** Today and tomorrow are said by name; anything further out is read off the weekday. */
	const whenLabel = $derived((at: number) => {
		const days = Math.round((startOfDay(at) - startOfDay(Date.now())) / 86_400_000);
		const day =
			days === 0
				? $t('common.today')
				: days === 1
					? $t('common.tomorrow')
					: days < 7
						? $dateFormats.weekdayShort(at)
						: $dateFormats.shortDate(at);
		return `${day}, ${$formatTime(at)}`;
	});

	/** A planned session is one you are choosing a date for, so the date comes before the session. */
	async function plan(at: number) {
		planningAt = null;
		const id = await createSession({ kind: 'planned', bowId: $defaultBowId });
		await updateSession(id, { startedAt: at });
		goto(`/sessions/${id}`);
	}

	/** A slot is opened, not created: the session page writes it once something is entered in it. */
	function openNext() {
		if (!next) return;
		goto(
			next.session
				? `/sessions/${next.session.id}`
				: `/sessions/plan-${next.occurrence!.slotId}-${next.occurrence!.at}`
		);
	}

	/** A round left mid way is worth one tap, but only while it is still the same outing. */
	const RESUME_WINDOW = 4 * 60 * 60 * 1000;
	let unfinished = $state<Awaited<ReturnType<typeof listAllActivities>>[number] | undefined>();

	/**
	 * The week against what the plans ask of it. Both halves already exist: this is the one figure
	 * that says, on a Wednesday evening, whether to go out.
	 */
	const weekStart = $derived(startOfWeek(Date.now()));
	const weekArrows = $derived(
		sessions
			.filter((s) => s.startedAt >= weekStart)
			.reduce((sum, s) => sum + (counts[s.id] ?? 0), 0)
	);
	const weekGoal = $derived(weekArrowGoal(slots));

	/** A record is worth saying out loud for a few days, and then it is just the number to beat. */
	const PB_WINDOW = 5 * 24 * 60 * 60 * 1000;
	const freshBest = $derived(
		summariseByRound(scored)
			.filter((summary) => summary.history.length > 1)
			.map((summary) => ({ name: summary.name, best: summary.best }))
			.find(({ best }) => Date.now() - best.startedAt < PB_WINDOW && best.id !== $dismissedBest)
	);

	/** The bow the app reaches for, and which revision of it is current. */
	const bow = $derived(bows.find((b) => b.id === $defaultBowId) ?? (bows.length === 1 ? bows[0] : undefined));
	$effect(() => {
		if (bow) listRevisions(bow.id).then((rows) => (revisions = rows));
		else revisions = [];
	});

	const month = $derived(overview(inRange(scored, 'month')));
	const allTime = $derived(overview(scored));
	/** The three latest, oldest first, so the page reads in the same direction as the sessions list. */
	const recent = $derived([...sessions].slice(0, 3).reverse());

	const today = startOfDay(Date.now());

	const sessionName = $derived(
		(s: (typeof sessions)[number]) => s.label ?? $t(defaultNameKey(s.kind, s.startedAt))
	);
	const shortDay = $derived((at: number) => $dateFormats.weekdayShort(at).replace(/\.$/, '') + '.');

	const roundName = (a: Awaited<ReturnType<typeof listAllActivities>>[number]) => {
		const round: RoundDefinition | null = a.roundDefinition ? JSON.parse(a.roundDefinition) : null;
		return round?.name ?? $t('round.custom');
	};
</script>

<div class="flex min-h-full flex-col">
<!--
	The header carries the app's own geometry: concentric arcs struck from off screen, so the curves
	read as part of a target face rather than as decoration borrowed from somewhere else.
-->
<!-- The rise is set by the pager mid swipe: the header alone climbs, so nothing below it moves. -->
<header
	data-page-header
	class="safe-top relative overflow-hidden bg-brand/10 pt-6 pb-9"
	style="transform: var(--header-shift, none); transition: transform var(--header-ease, 0ms) {SNAP_EASE}"
>
	<!-- Drawn overflowing its own box: the outermost ring swells past r=50 as the front passes it. -->
	<svg
		class="pointer-events-none absolute -top-16 -right-24 h-72 w-72 overflow-visible text-brand"
		viewBox="0 0 100 100"
		fill="none"
		aria-hidden="true"
	>
		{#each [46, 36, 26, 16] as r, i (r)}
			<!-- The ripple runs outward: the innermost ring is struck first, the rest follow it. -->
			<circle
				cx="50"
				cy="50"
				{r}
				stroke="currentColor"
				stroke-width="6"
				opacity={0.08 + i * 0.05}
				class={ripple ? 'ripple' : ''}
				style="--ring-delay: {(3 - i) * 70}ms"
			/>
		{/each}
		<circle
			cx="50"
			cy="50"
			r="7"
			fill="currentColor"
			opacity="0.35"
			class={ripple ? 'ripple-core' : ''}
			onanimationend={() => (ripple = false)}
		/>
	</svg>

	<div class="relative mx-auto w-full max-w-2xl px-4">
		<p class="text-sm font-medium text-brand-text">{$t('home.greeting')}</p>
		<h1 class="text-3xl font-bold tracking-tight">{$t('home.title')}</h1>

		<!-- The figures sit in the header rather than under it, so the curves frame real data. -->
		<dl class="mt-5 grid grid-cols-3 gap-2">
			{#each [{ value: month.arrows, label: $t('home.thisMonth'), lead: true }, { value: month.days, label: $t('home.daysOut'), lead: false }, { value: allTime.arrows, label: $t('stats.totalArrows'), lead: false }] as tile (tile.label)}
				<div class="rounded-xl border border-brand/15 bg-surface/60 px-3 py-2.5 backdrop-blur">
					<dd
						class="tabular text-2xl leading-none font-bold {tile.lead
							? 'text-brand-text'
							: 'text-ink'}"
					>
						{tile.value}
					</dd>
					<dt class="mt-1 truncate text-[11px] text-muted">{tile.label}</dt>
				</div>
			{/each}
		</dl>
	</div>

	<HeaderEdge />
</header>

<div class="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
	{#if next}
		<!-- The next outing leads the page: what is coming matters more than what is done. -->
		<button
			class="flex w-full items-center gap-3 rounded-2xl border border-brand/40 bg-gradient-to-r from-brand/10 to-surface p-3 text-left shadow-sm"
			onclick={openNext}
		>
			<span
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-text"
			>
				<Icon name="target" size={22} />
			</span>
			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold tracking-wide text-muted uppercase">{$t('home.next')}</p>
				<p class="truncate font-semibold">
					{whenLabel(next.at)}
					{#if next.occurrence?.label ?? next.session?.label}
						<span class="font-normal text-muted">
							· {next.occurrence?.label ?? next.session?.label}
						</span>
					{/if}
				</p>
			</div>
			<span class="shrink-0 rotate-180 text-brand-text"><Icon name="back" size={20} /></span>
		</button>
	{/if}

	{#if unfinished}
		<!-- Only while the outing is still warm: after that it is history, not something to resume. -->
		<a
			href="/activities/{unfinished.id}"
			class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
		>
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunk text-muted">
				<Icon name="sight" size={22} />
			</span>
			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold tracking-wide text-muted uppercase">
					{$t('home.resume')}
				</p>
				<p class="truncate font-semibold">{roundName(unfinished)}</p>
			</div>
			<p class="tabular shrink-0 text-sm text-muted">
				{$t('round.arrows', { n: unfinished.arrowsShot })}
			</p>
		</a>
	{/if}

	{#if weekGoal > 0}
		{@const done = Math.min(1, weekArrows / weekGoal)}
		<section class="rounded-2xl border border-line bg-surface p-3.5">
			<div class="flex items-end justify-between gap-2">
				<p class="tabular text-[2rem] leading-none font-bold text-brand-text">{weekArrows}</p>
				<p class="tabular text-sm font-semibold text-muted">/ {weekGoal}</p>
			</div>
			<p class="mt-0.5 text-xs text-muted">
				{$t('home.thisWeek')}{done >= 1 ? ` · ${$t('session.goalReached')}` : `, ${$t('session.goalLeft', { n: weekGoal - weekArrows })}`}
			</p>
			<div class="mt-2 h-2 overflow-hidden rounded-full bg-sunk">
				<div
					class="h-full rounded-full transition-[width] duration-500 {done >= 1
						? 'bg-accent'
						: 'bg-brand'}"
					style="width: {Math.max(done * 100, weekArrows > 0 ? 4 : 0)}%"
				></div>
			</div>
		</section>
	{/if}

	{#if freshBest}
		<!-- Said once, for a few days: a record that stays on the page stops being one. -->
		<div
			class="relative flex items-center gap-3 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/12 to-surface p-3 shadow-sm"
		>
			<a href="/activities/{freshBest.best.id}" class="flex min-w-0 flex-1 items-center gap-3">
				<span
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"
				>
					<Icon name="medal" size={24} filled />
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-[11px] font-semibold tracking-wide text-accent uppercase">
						{$t('home.newBest')}
					</p>
					<p class="truncate font-semibold">{freshBest.name}</p>
				</div>
				<p class="tabular shrink-0 text-xl font-bold">{freshBest.best.totalScore}</p>
			</a>
			<!-- Acknowledged rather than hidden: the next record is a different round and says so again. -->
			<button
				class="-mr-1 shrink-0 self-start rounded-lg p-1 text-muted"
				aria-label={$t('common.close')}
				onclick={() => dismissedBest.set(freshBest!.best.id)}
			>
				<Icon name="close" size={16} />
			</button>
		</div>
	{/if}

	<section>
		<div class="mb-2 flex items-baseline justify-between">
			<h2 class="text-sm font-semibold">{$t('home.recent')}</h2>
			{#if sessions.length > recent.length}
				<a class="text-xs text-brand-text" href="/sessions">{$t('home.seeAll')}</a>
			{/if}
		</div>

		{#if recent.length === 0}
			<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
				{$t('home.neverShot')}
			</p>
		{:else}
			<ul class="space-y-2">
				{#each recent as s (s.id)}
					<!-- The same shape as the sessions list: day in the margin, the session in the card. -->
					<li class="flex items-center gap-3">
						<div class="w-9 shrink-0 text-center">
							<p class="text-[11px] leading-none text-muted">{shortDay(s.startedAt)}</p>
							<p
								class="tabular mt-0.5 text-lg leading-none font-bold
									{startOfDay(s.startedAt) === today
									? 'mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-ink'
									: ''}"
							>
								{new Date(s.startedAt).getDate()}
							</p>
						</div>
						<a
							href="/sessions/{s.id}"
							class="flex flex-1 items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3"
						>
							<div class="min-w-0">
								<p class="truncate font-semibold">{sessionName(s)}</p>
								<p class="text-xs text-muted">{$formatTime(s.startedAt)}</p>
							</div>
							<div class="text-right">
								<p class="tabular text-lg leading-none font-bold">{counts[s.id] ?? 0}</p>
								<p class="text-[11px] text-muted">{$t('sessions.arrows')}</p>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if bow}
		<!-- A line, not a card: which bow the app will reach for is worth knowing, not worth a block. -->
		<a href="/equipment/{bow.id}" class="flex items-center gap-2 px-1 text-xs text-muted">
			<Icon name="bow" size={14} />
			<span class="truncate">{bow.name}</span>
			{#if revisions.length > 0}
				<span class="text-line">·</span>
				<span class="tabular">{$t('home.revision', { n: revisions[0].revisionNo })}</span>
			{/if}
			<span class="ml-auto shrink-0 rotate-180"><Icon name="back" size={14} /></span>
		</a>
	{/if}
</div>

<!-- The one action this page exists for, kept where the thumb lands, with the rest behind the arrow. -->
<div class="sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<div class="mx-auto flex w-full max-w-2xl gap-2">
		<MoreMenu
			label={$t('home.moreActions')}
			items={[
				{ label: $t('sessions.new'), onselect: () => start('practice') },
				{ label: $t('sessions.newCompetition'), onselect: () => start('competition') },
				{ label: $t('sessions.newPlanned'), onselect: () => (planningAt = Date.now()) },
				{ label: $t('equipment.addBow'), onselect: () => goto('/equipment?add=1') }
			]}
		/>
		<button
			class="flex w-4/5 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink"
			onclick={() => start()}
		>
			<Icon name="plus" size={20} />
			{$t('sessions.new')}
		</button>
	</div>
</div>
</div>

{#if planningAt !== null}
	<DateTimeDialog
		title={$t('sessions.newPlanned')}
		value={planningAt}
		confirmLabel={$t('common.add')}
		onconfirm={plan}
		oncancel={() => (planningAt = null)}
	/>
{/if}

<style>
	/*
	 * A stone dropped in the pond: each ring swells and brightens as the front passes through it,
	 * then settles back to the still image the header normally is.
	 */
	.ripple {
		animation: ring 520ms var(--ring-delay, 0ms) cubic-bezier(0.22, 0.61, 0.36, 1) both;
		transform-origin: 50px 50px;
	}

	.ripple-core {
		animation: core 520ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
		transform-origin: 50px 50px;
	}

	@keyframes ring {
		0% {
			stroke-width: 6;
			transform: scale(1);
		}
		45% {
			stroke-width: 9.5;
			opacity: 0.45;
			transform: scale(1.035);
		}
		100% {
			stroke-width: 6;
			transform: scale(1);
		}
	}

	@keyframes core {
		0% {
			transform: scale(0.6);
			opacity: 0.6;
		}
		45% {
			transform: scale(1.15);
			opacity: 0.55;
		}
		100% {
			transform: scale(1);
			opacity: 0.35;
		}
	}

	/* Nothing moves for someone who asked for nothing to move. */
	@media (prefers-reduced-motion: reduce) {
		.ripple,
		.ripple-core {
			animation: none;
		}
	}
</style>
