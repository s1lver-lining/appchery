<script lang="ts" module>
	let rippled = false;
</script>

<script lang="ts">
	import { dataVersion } from '$lib/db/changed';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		listSessions,
		listAllActivities,
		loadExperienceInput,
		listPlanSlots,
		listPlans,
		createSession,
		updateSession
	} from '$lib/db/repository';
	import {
		upcoming,
		nextUp,
		weekArrowGoalOn,
		onlyActive,
		type Occurrence
	} from '$lib/domain/plans';
	import {
		overview,
		inRange,
		isComplete,
		summariseByRound,
		toVolume,
		type ActivityLike,
		type ScoredActivity
	} from '$lib/domain/stats';
	import { experience, type Experience } from '$lib/domain/experience';
	import { noteLevel } from '$lib/levelUp';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import {
		defaultBowId,
		dismissedBest,
		homeStatPrimary,
		homeStatSecondary,
		formatTime,
		dateFormats
	} from '$lib/prefs';
	import { startOfDay, startOfWeek } from '$lib/domain/dates';
	import { defaultNameKey, hasHappened } from '$lib/domain/sessions';
	import Icon from '$lib/ui/Icon.svelte';
	import AppGrid from '$lib/ui/AppGrid.svelte';
	import FriendFeed from '$lib/ui/FriendFeed.svelte';
	import { sharedFeed, following, followers, type Profile, type SharedActivity } from '$lib/sync/social';
	import { withOrigin } from '$lib/nav';
	import HeaderEdge from '$lib/ui/HeaderEdge.svelte';
	import { SNAP_EASE } from '$lib/ui/swipe';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import DateTimeDialog from '$lib/ui/DateTimeDialog.svelte';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';
	import { scrim } from '$lib/ui/statusBar';
	import { lockScroll } from '$lib/ui/scrollLock';

	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let scored = $state<ScoredActivity[]>([]);
	/** Every arrow shot, whatever produced it, which is what the header figures count. */
	let volume = $state<ScoredActivity[]>([]);
	let counts = $state<Record<string, number>>({});
	/** Worked out from the history rather than stored, so it is never out of step with what is below. */
	let earned = $state<Experience | null>(null);
	let slots = $state<Awaited<ReturnType<typeof listPlanSlots>>>([]);
	let plans = $state<Awaited<ReturnType<typeof listPlans>>>([]);
	let planningAt = $state<number | null>(null);
	let planningKind = $state<'planned' | 'competition'>('planned');
	let feed = $state<SharedActivity[]>([]);
	let friends = $state<Profile[]>([]);

	/** Whoever the device knows of, so a shared activity can name the archer who shared it. */
	const knownFriends = $derived(new Map(friends.map((profile) => [profile.userId, profile])));

	function schedule(kind: 'planned' | 'competition') {
		planningKind = kind;
		planningAt = Date.now();
	}

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
		plans = await listPlans();
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
		/** Mapped once for every kind, so the header and the week's total read the same arrows. */
		const all: ActivityLike[] = activities.map((a) => ({
			id: a.id,
			sessionId: a.sessionId,
			kind: a.kind,
			startedAt: a.startedAt,
			totalScore: a.totalScore,
			arrowsShot: a.arrowsShot,
			count10s: a.count10s,
			countX: a.countX,
			roundDefinitionId: a.roundDefinitionId,
			round: a.roundDefinition ? (JSON.parse(a.roundDefinition) as RoundDefinition) : null
		}));
		earned = experience(await loadExperienceInput());
		noteLevel(earned.level);
		volume = toVolume(all);
		scored = all.filter((a) => a.kind === 'scoring').map(({ kind, ...activity }) => activity);
		/* Read from the cache only: the home page never waits on the network to paint. */
		feed = await sharedFeed();
		friends = [...(await following()), ...(await followers())];
	}
	$effect(() => {
		void $dataVersion;
		refresh();
	});

	async function start(kind: 'practice' | 'competition' = 'practice') {
		goto(`/sessions/${await createSession({ kind, bowId: $defaultBowId })}`);
	}

	/**
	 * What is coming: the soonest session still ahead, or the soonest slot a plan calls for. One that
	 * began within the hour still counts, because that is the one being walked into.
	 */
	/** Plans put aside are dropped here rather than at each use, so nothing they ask for gets through. */
	const live = $derived(onlyActive(plans, slots));

	const next = $derived(
		nextUp<{ at: number; session?: (typeof sessions)[number]; occurrence?: Occurrence }>([
			...sessions.map((session) => ({ at: session.startedAt, session })),
			...upcoming(
				live.slots,
				sessions.map((s) => s.startedAt),
				undefined,
				undefined,
				live.plans
			).map((occurrence) => ({
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

	/**
	 * A session you are choosing a date for, so the date comes before the session. A competition is
	 * one too: it is on the calendar weeks ahead, and starting it on today's date is almost always
	 * the wrong day.
	 */
	async function plan(at: number) {
		const kind = planningKind;
		planningAt = null;
		const id = await createSession({ kind, bowId: $defaultBowId });
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
	// This week's bar, so a plan whose season is over no longer asks anything of the week on screen.
	const weekGoal = $derived(weekArrowGoalOn(weekStart, live.slots, live.plans));
	// What the week holds, not what it is booked for: a competition still to come is not an outing yet.
	const weekSessions = $derived(
		sessions.filter((s) => s.startedAt >= weekStart && hasHappened(s)).length
	);
	const weekDone = $derived(weekGoal > 0 ? Math.min(1, weekArrows / weekGoal) : 0);

	/** A record is worth saying out loud for a few days, and then it is just the number to beat. */
	const PB_WINDOW = 5 * 24 * 60 * 60 * 1000;
	const freshBest = $derived(
		summariseByRound(scored)
			.filter((summary) => summary.history.length > 1)
			.map((summary) => ({ name: summary.name, best: summary.best }))
			.find(({ best }) => Date.now() - best.startedAt < PB_WINDOW && best.id !== $dismissedBest)
	);

	// Every arrow, not only the scored ones: a header that leaves out a tuning session undercounts
	// the month against the week's own total, which counts them.
	const month = $derived(overview(inRange(volume, 'month')));
	const year = $derived(overview(inRange(volume, 'year')));
	const allTime = $derived(overview(volume));
	/**
	 * The three latest, oldest first, so the page reads in the same direction as the sessions list.
	 * Only outings that have happened: what is still ahead is announced above, not recalled here.
	 */
	const shot = $derived(sessions.filter((s) => hasHappened(s)));
	const recent = $derived(shot.slice(0, 3).reverse());

	const today = startOfDay(Date.now());

	const sessionName = $derived(
		(s: (typeof sessions)[number]) => s.label ?? $t(defaultNameKey(s.kind, s.startedAt))
	);
	const shortDay = $derived((at: number) => $dateFormats.weekdayShort(at).replace(/\.$/, '') + '.');

	/**
	 * Either header figure can be swapped for another, so an archer training to a weekly plan is not
	 * stuck reading a monthly total. Held per device: it is how this phone is read, not archer data.
	 */
	const STAT_KEYS = [
		'monthArrows',
		'weekArrows',
		'yearArrows',
		'totalArrows',
		'weekGoal',
		'level',
		'experience',
		'none'
	] as const;
	type StatKey = (typeof STAT_KEYS)[number];

	const stats = $derived<Record<StatKey, { label: string; value: number }>>({
		monthArrows: { label: $t('home.thisMonth'), value: month.arrows },
		weekArrows: { label: $t('home.thisWeek'), value: weekArrows },
		yearArrows: { label: $t('home.thisYear'), value: year.arrows },
		totalArrows: { label: $t('stats.totalArrows'), value: allTime.arrows },
		weekGoal: { label: $t('home.weekGoalStat'), value: weekGoal },
		level: { label: $t('experience.levelStat'), value: earned?.level ?? 1 },
		experience: { label: $t('experience.title'), value: earned?.total ?? 0 },
		none: { label: $t('home.statNone'), value: 0 }
	});

	const asStat = (value: string | null, fallback: StatKey): StatKey =>
		STAT_KEYS.includes(value as StatKey) ? (value as StatKey) : fallback;
	const primary = $derived(asStat($homeStatPrimary, 'monthArrows'));
	const secondary = $derived(asStat($homeStatSecondary, 'totalArrows'));

	/** Which figure is being chosen for, and the press that has to be held to get here. */
	let picking = $state<'primary' | 'secondary' | null>(null);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function hold(slot: 'primary' | 'secondary') {
		cancelHold();
		holdTimer = setTimeout(() => (picking = slot), 450);
	}

	function cancelHold() {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}

	function chooseStat(key: StatKey) {
		(picking === 'primary' ? homeStatPrimary : homeStatSecondary).set(key);
		picking = null;
	}

	closeOnBack(() => picking !== null, () => (picking = null));
	closeOnBack(() => planningAt !== null, () => (planningAt = null));

	/** Replaying the ripple means restarting it: the class has to leave the elements to come back. */
	async function strike() {
		ripple = false;
		await tick();
		ripple = true;
	}

	const roundName = (a: Awaited<ReturnType<typeof listAllActivities>>[number]) => {
		const round: RoundDefinition | null = a.roundDefinition ? JSON.parse(a.roundDefinition) : null;
		return round?.name ?? $t('round.custom');
	};
</script>

<!--
	A figure and its caption, held down or right clicked to change what it counts. The gesture is
	quiet on purpose: the header is not a settings page, it just refuses to be the wrong two numbers.
-->
{#snippet figure(slot: 'primary' | 'secondary', key: StatKey, lead: boolean)}
	<button
		class="text-left"
		aria-label={key === 'none' ? $t('home.pickStat') : undefined}
		oncontextmenu={(e) => {
			e.preventDefault();
			picking = slot;
		}}
		onpointerdown={() => hold(slot)}
		onpointerup={cancelHold}
		onpointerleave={cancelHold}
		onpointercancel={cancelHold}
		onclick={() => (picking = slot)}
	>
		<!-- Showing nothing still holds its place: the header must not resize as figures come and go,
			and the space is the only way back to a figure that was switched off. -->
		<dd
			class="tabular leading-none {lead
				? 'text-4xl font-bold text-brand-text'
				: 'text-2xl font-semibold'} {key === 'none' ? 'invisible' : ''}"
		>
			{key === 'none' ? '0' : stats[key].value}
		</dd>
		<dt class="mt-1 text-xs text-muted {key === 'none' ? 'invisible' : ''}">
			{key === 'none' ? stats.monthArrows.label : stats[key].label}
		</dt>
	</button>
{/snippet}

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

		<!-- The two figures sit in the header rather than under it, so the curves frame real data. -->
		<dl class="mt-5 flex items-end gap-6">
			{@render figure('primary', primary, true)}
			<!-- The rule separates two figures; with one of them off there is nothing to separate. -->
			{#if primary !== 'none' && secondary !== 'none'}
				<div class="h-8 w-px bg-line"></div>
			{/if}
			{@render figure('secondary', secondary, false)}
		</dl>
	</div>

	<!-- Last, so it sits over the rings and under nothing: the corner is the one place they show. -->
	<button
		class="absolute top-0 right-0 h-24 w-32"
		aria-label={$t('home.replayRings')}
		onclick={strike}
	></button>

	<HeaderEdge />
</header>

<!-- One rule for the whole page: every block sits under a heading that says what it is. -->
{#snippet heading(text: string, link?: { href: string; label: string })}
	<div class="mb-2 flex items-baseline justify-between px-1">
		<h2 class="text-[11px] font-semibold tracking-wider text-muted uppercase">{text}</h2>
		{#if link}<a class="text-xs font-medium text-brand-text" href={link.href}>{link.label}</a>{/if}
	</div>
{/snippet}

<div class="mx-auto w-full max-w-2xl flex-1 space-y-5 p-4">
	{#if freshBest}
		<!-- Said once, for a few days: a record that stays on the page stops being one. It leads the
			page while it lasts, because it is the only thing here that just happened. -->
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

	<!-- What is coming and what the week has come to, side by side: the two things worth a tap before
		anything else, and neither of them fills a line on its own. -->
	<!-- The level shares the line rather than taking one of its own: it is a standing, not an event. -->
	<section>
		<div class="mb-2 flex items-baseline justify-between px-1">
			<h2 class="text-[11px] font-semibold tracking-wider text-muted uppercase">
				{next ? $t('home.upNext') : $t('home.thisWeek')}
			</h2>
			{#if earned}
				<a
					class="flex items-center gap-1 text-xs font-medium text-brand-text"
					href={withOrigin('/experience', '/')}
				>
					{$t('experience.levelShort', { level: earned.level })}
					<span class="rotate-180"><Icon name="back" size={14} /></span>
				</a>
			{/if}
		</div>

		<!-- Under three hundred pixels two columns stop being readable, so they become one. -->
		<div class="grid grid-cols-1 gap-2 min-[300px]:grid-cols-2">
			{#if next}
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
						<p class="truncate font-semibold">{whenLabel(next.at)}</p>
						<p class="truncate text-xs text-muted">
							{next.occurrence?.label ?? next.session?.label ?? $t('home.next')}
						</p>
					</div>
				</button>
			{/if}

			<!-- The week's own heading is gone when it shares the line, so the card carries the link. -->
			<a
				href="/stats"
				class="block rounded-2xl border border-line bg-surface p-3.5 {next
					? ''
					: 'min-[300px]:col-span-2'}"
			>
				<!-- Stacked rather than set side by side: half a line is not enough for both, and the
					total breaking away from its goal read as two different figures. -->
				<p class="tabular text-[2rem] leading-none font-bold whitespace-nowrap text-brand-text">
					{weekArrows}{#if weekGoal > 0}<span class="text-sm font-semibold text-muted">
							/ {weekGoal}</span
						>{/if}
				</p>
				<!-- Without a plan there is no target to fall short of, so the week says what it holds. -->
				<p class="mt-1 truncate text-xs text-muted">
					{#if weekGoal > 0}
						{#if weekDone >= 1}
							<!-- The one week in the log that deserves an emoji is the one that was finished. -->
							🎉 {$t('session.goalReached')}
						{:else}
							{$t('session.goalLeft', { n: weekGoal - weekArrows })}
						{/if}
					{:else}
						{$t('home.weekSessions', { n: weekSessions })}
					{/if}
				</p>

				{#if weekGoal > 0}
					<div class="mt-2 h-2 overflow-hidden rounded-full bg-sunk">
						<div
							class="h-full rounded-full transition-[width] duration-500 {weekDone >= 1
								? 'bg-accent'
								: 'bg-brand'}"
							style="width: {Math.max(weekDone * 100, weekArrows > 0 ? 4 : 0)}%"
						></div>
					</div>
				{/if}
			</a>
		</div>

		{#if unfinished}
			<!-- Its own line, whatever else is up there: a half shot round is the one thing here that is
				waiting on the archer. Only while the outing is still warm: after that it is history. -->
			<a
				href="/activities/{unfinished.id}"
				class="mt-2 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
			>
				<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunk text-muted">
					<Icon name="sight" size={22} />
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate font-semibold">{roundName(unfinished)}</p>
					<p class="truncate text-xs text-muted">{$t('home.resume')}</p>
				</div>
				<p class="tabular shrink-0 text-sm text-muted">
					{$t('round.arrows', { n: unfinished.arrowsShot })}
				</p>
			</a>
		{/if}
	</section>

	<section>
		{@render heading(
			$t('home.recent'),
			shot.length > recent.length ? { href: '/sessions', label: $t('home.seeAll') } : undefined
		)}

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

	<!-- Where a page that has been read out ends: everywhere else to go. -->
	<section>
		{@render heading($t('home.elsewhere'))}
		<AppGrid from="/" />
	</section>

	{#if feed.length > 0}
		<!-- Last, because it is other people's shooting: it is worth seeing, never worth leading with. -->
		<section>
			{@render heading($t('friends.feedTab'), { href: '/friends', label: $t('home.seeAll') })}
			<div class="space-y-2">
				<FriendFeed {feed} known={knownFriends} empty={false} />
			</div>
		</section>
	{/if}
</div>

<!-- The one action this page exists for, kept where the thumb lands, with the rest behind the arrow. -->
<div class="sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<!-- One button across the bar: starting an outing is what this page is for, and the rarer ways
		to start one are held behind a long press rather than given a permanent fifth of the width. -->
	<div class="mx-auto w-full max-w-2xl">
		<MoreMenu
			label={$t('home.moreActions')}
			wrapperClass="w-full"
			triggerClass="relative flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink select-none"
			onpress={() => start()}
			items={[
				{ label: $t('sessions.new'), icon: 'target', onselect: () => start('practice'), accent: true },
				{ label: $t('sessions.newCompetition'), icon: 'medal', onselect: () => schedule('competition') },
				{ label: $t('sessions.newPlanned'), icon: 'calendar', onselect: () => schedule('planned') },
				{ label: $t('equipment.addBow'), icon: 'bow', onselect: () => goto('/equipment?add=1') }
			]}
		>
			{#snippet children()}
				<Icon name="plus" size={20} />
				{$t('sessions.new')}
				<!-- The only sign that the button holds more: a long press has to be findable once. -->
				<span class="absolute right-3 opacity-60"><Icon name="chevronUp" size={14} /></span>
			{/snippet}
		</MoreMenu>
	</div>
</div>
</div>

{#if picking}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" use:lockScroll>
		<button
			class="absolute inset-0 bg-black/40"
			use:scrim={0.4}
			aria-label={$t('common.close')}
			onclick={() => (picking = null)}
		></button>

		<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
			<h2 class="mb-3 text-lg font-bold">{$t('home.pickStat')}</h2>
			<div class="space-y-1">
				{#each STAT_KEYS as key (key)}
					{@const chosen = (picking === 'primary' ? primary : secondary) === key}
					<button
						class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm
							{chosen ? 'border-brand bg-brand/10 font-semibold' : 'border-line'}"
						onclick={() => chooseStat(key)}
					>
						{stats[key].label}
						{#if key !== 'none'}<span class="tabular text-muted">{stats[key].value}</span>{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

{#if planningAt !== null}
	<DateTimeDialog
		title={$t(planningKind === 'competition' ? 'sessions.newCompetition' : 'sessions.newPlanned')}
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
