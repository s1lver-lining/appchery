<script lang="ts" module>
	/**
	 * Which month was on show and which day was picked, held for the life of the app rather than of
	 * the component: opening a session unmounts this page, and coming back to a list when you left a
	 * calendar day open is the app forgetting what you were doing. Which tab was open outlives the
	 * app itself and is a stored preference, since an archer who reads the calendar reads it always.
	 */
	let lastViewed = { year: new Date().getFullYear(), month: new Date().getMonth() };
	let lastDay: number | null = null;
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import {
		listSessions,
		listAllActivities,
		listPlanSlots,
		listPlans,
		createSession,
		updateSession
	} from '$lib/db/repository';
	import { upcoming, weekdayOf, weekArrowGoal, onlyActive, type Occurrence } from '$lib/domain/plans';
	import { parseConfig } from '$lib/domain/matches';
	import { withOrigin } from '$lib/nav';
	import { groupByWeek, monthGrid, startOfDay, startOfWeek } from '$lib/domain/dates';
	import { defaultNameKey, matchesQuery } from '$lib/domain/sessions';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import {
		defaultBowId,
		formatTime,
		dateFormats,
		sessionsTab,
		showWeekGoal,
		fullNewSessionButton
	} from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';
	import DateTimeDialog from '$lib/ui/DateTimeDialog.svelte';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';
	import { scrim } from '$lib/ui/statusBar';

	type Session = Awaited<ReturnType<typeof listSessions>>[number];

	let sessions = $state<Session[]>([]);
	let counts = $state<Record<string, { activities: number; arrows: number; names: string[] }>>({});
	/** What is typed in the search box. Not stored: a search is about the minute it is made in. */
	let query = $state('');
	let pickingView = $state(false);
	let tab = $state<'list' | 'calendar'>($sessionsTab === 'calendar' ? 'calendar' : 'list');
	/** The month on show, held outright rather than as an offset, so any month can be jumped to. */
	let viewed = $state({ ...lastViewed });
	let pickingMonth = $state(false);
	let selectedDay = $state<number | null>(lastDay);

	// Written back as they change, so the page is found as it was left.
	$effect(() => {
		sessionsTab.set(tab);
		lastViewed = { ...viewed };
		lastDay = selectedDay;
	});
	let slots = $state<Awaited<ReturnType<typeof listPlanSlots>>>([]);
	let plans = $state<Awaited<ReturnType<typeof listPlans>>>([]);
	let planningAt = $state<number | null>(null);
	let planningKind = $state<'planned' | 'competition'>('planned');

	function schedule(kind: 'planned' | 'competition') {
		planningKind = kind;
		planningAt = Date.now();
	}
	let loaded = $state(false);

	async function refresh() {
		sessions = await listSessions();
		slots = await listPlanSlots();
		plans = await listPlans();
		const activities = await listAllActivities();
		loaded = true;
		counts = activities.reduce<
			Record<string, { activities: number; arrows: number; names: string[] }>
		>((acc, a) => {
			const entry = (acc[a.sessionId] ??= { activities: 0, arrows: 0, names: [] });
			// Kept per session so the search reads what was shot without parsing every round again.
			const round: RoundDefinition | null = a.roundDefinition ? JSON.parse(a.roundDefinition) : null;
			// A match is remembered by who it was against, so that is its name as far as searching goes.
			const name = round?.name ?? a.templateKey ?? parseConfig(a.matchConfig)?.opponent;
			if (name) entry.names.push(name);
			// Training arrows are counted, never listed, so counting them here claimed an activity
			// the session page had nothing to show for.
			if (a.kind !== 'training') entry.activities += 1;
			entry.arrows += a.arrowsShot;
			return acc;
		}, {});
	}
	$effect(() => {
		refresh();
	});

	/**
	 * The session is created and opened immediately. Conditions are fetched on the session page
	 * afterwards, because waiting on a geolocation prompt here left the button stuck on "fetching".
	 */
	async function start(kind: 'practice' | 'competition' = 'practice') {
		goto(`/sessions/${await createSession({ kind, bowId: $defaultBowId })}`);
	}

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

	closeOnBack(() => pickingMonth, () => (pickingMonth = false));
	closeOnBack(() => planningAt !== null, () => (planningAt = null));

	/**
	 * A plan's slots are not sessions until something is entered in one. Until then they only show,
	 * which is why a week nobody shot leaves nothing to clean up.
	 */
	/** Plans put aside are dropped once, so neither their slots nor their arrows reach the week. */
	const live = $derived(onlyActive(plans, slots));

	const occurrences = $derived(
		upcoming(
			live.slots,
			sessions.map((s) => s.startedAt)
		)
	);

	/** Opened, not created: the session page writes it only once something is entered in it. */
	const occurrenceHref = (occurrence: Occurrence) =>
		`/sessions/plan-${occurrence.slotId}-${occurrence.at}`;

	function activityLabel(id: string) {
		const n = counts[id]?.activities ?? 0;
		return n === 1 ? $t('sessions.oneActivity') : $t('sessions.activityCount', { n });
	}

	/**
	 * Everything the search reads: what the session is called, where it was, what was noted, and the
	 * name of every round and procedure done in it.
	 */
	const haystack = $derived((s: Session) => [
		s.label,
		$t(defaultNameKey(s.kind, s.startedAt)),
		s.location,
		s.notes,
		...(counts[s.id]?.names ?? [])
	]);
	const searching = $derived(query.trim().length > 0);
	const found = $derived(
		searching ? sessions.filter((s) => matchesQuery(query, haystack(s))) : sessions
	);

	type Row = { at: number; session?: Session; occurrence?: Occurrence };
	// A slot is not a session yet, so it holds nothing to search and stands aside while one is on.
	const rows = $derived<Row[]>([
		...found.map((session) => ({ at: session.startedAt, session })),
		...(searching ? [] : occurrences.map((occurrence) => ({ at: occurrence.at, occurrence })))
	]);
	const weeks = $derived(groupByWeek(rows, (row) => row.at));

	/** A week read a day at a time, so the date is written once however many outings hang off it. */
	const daysOf = (group: (typeof weeks)[number]) => {
		const byDate = new Map<number, Row[]>();
		for (const row of group.items) {
			const key = startOfDay(row.at);
			byDate.set(key, [...(byDate.get(key) ?? []), row]);
		}
		return [...byDate.entries()].sort(([a], [b]) => a - b).map(([at, rows]) => ({ at, rows }));
	};
	/** What every plan asks of a week together, which is what a week's total is measured against. */
	const weekGoal = $derived(weekArrowGoal(live.slots, live.plans));
	/**
	 * Counted off every session rather than off the rows on screen: a search narrows what is listed,
	 * and a week that reads 48 arrows because two of its outings match is a figure nobody asked for.
	 */
	const arrowsByWeek = $derived(
		sessions.reduce<Map<number, number>>((acc, s) => {
			const week = startOfWeek(s.startedAt);
			return acc.set(week, (acc.get(week) ?? 0) + (counts[s.id]?.arrows ?? 0));
		}, new Map())
	);
	const weekArrows = $derived((group: (typeof weeks)[number]) => arrowsByWeek.get(group.start) ?? 0);

	/**
	 * The list runs oldest to newest, so it opens on today the way a calendar does rather than on the
	 * oldest session anyone ever shot. Past only, and today lands at the top of the view.
	 */
	const anchorWeek = $derived(
		weeks.find((group) => group.end >= today)?.start ?? weeks[weeks.length - 1]?.start
	);
	let anchor = $state<HTMLElement | undefined>();
	function markAnchor(node: HTMLElement, week: number) {
		if (week === anchorWeek) anchor = node;
		return {
			update(next: number) {
				if (next === anchorWeek) anchor = node;
			}
		};
	}

	let scrollPane = $state<HTMLElement | undefined>();
	// The two tabs share one scroller, so switching lands at the top of the one being opened.
	$effect(() => {
		void tab;
		if (scrollPane) scrollPane.scrollTop = 0;
	});

	/** Today's block, so a week too tall to be read whole can still be opened on the day it is. */
	let todayRow = $state<HTMLElement | undefined>();
	function markToday(node: HTMLElement, isToday: boolean) {
		if (isToday) todayRow = node;
		return {
			update(next: boolean) {
				if (next) todayRow = node;
			}
		};
	}

	/** Rung once, on the row the list settled on, and never again for the life of the page. */
	let pulsing = $state(false);

	/**
	 * Once per visit rather than once per mount. The pager keeps this page alive behind the one on
	 * show, so a list anchored at mount was aimed while it was off screen: it arrived at its top, and
	 * the ring it rang was rung to nobody. Arriving is what the list reacts to, however it is reached.
	 */
	let anchored = false;
	$effect(() => {
		if ($page.url.pathname !== '/sessions') {
			anchored = false;
			return;
		}
		if (anchored || !loaded || !anchor || tab !== 'list') return;
		anchored = true;
		// After the frame that lays the weeks out, otherwise it aims at a list still growing above it.
		requestAnimationFrame(() => {
			if (!anchor || !scrollPane) return;
			// The whole week when it fits, since the days around today are what says how the week went.
			if (anchor.offsetHeight <= scrollPane.clientHeight || !todayRow) bring(anchor, 0);
			else bring(todayRow, (scrollPane.clientHeight - todayRow.offsetHeight) / 2);
			if (!todayRow) return;
			pulsing = true;
			setTimeout(() => (pulsing = false), 1400);
		});
	});

	/**
	 * The pane is scrolled by hand rather than through scrollIntoView, which also scrolls every
	 * ancestor: on this page that dragged the page pager sideways and left the app between two pages.
	 */
	function bring(node: HTMLElement, gapAbove: number) {
		let pane = node.parentElement;
		while (pane && !/auto|scroll/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
		if (!pane) return;
		pane.scrollTop += node.getBoundingClientRect().top - pane.getBoundingClientRect().top - gapAbove;
	}

	/** Sessions keyed by day, which is what both the calendar dots and the day list read from. */
	const byDay = $derived(
		sessions.reduce<Map<number, Session[]>>((acc, s) => {
			const key = startOfDay(s.startedAt);
			acc.set(key, [...(acc.get(key) ?? []), s]);
			return acc;
		}, new Map())
	);

	const viewedMonth = $derived(new Date(viewed.year, viewed.month, 1));

	function stepMonth(by: number) {
		const moved = new Date(viewed.year, viewed.month + by, 1);
		viewed = { year: moved.getFullYear(), month: moved.getMonth() };
		selectedDay = null;
	}

	/** Ten years back and one forward: a shooting log runs behind, never far ahead. */
	const YEARS = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 10 + i);
	const MONTHS = $derived(
		Array.from({ length: 12 }, (_, i) => ({
			value: i,
			label: $dateFormats.monthYear(new Date(2024, i, 1).getTime()).replace(/\s*2024/, '')
		}))
	);

	const grid = $derived(monthGrid(viewedMonth.getFullYear(), viewedMonth.getMonth()));
	// Oldest first here too, so both halves of the page read in the same direction.
	const monthSessions = $derived(
		[...sessions]
			.sort((a, b) => a.startedAt - b.startedAt)
			.filter((s) => {
				const date = new Date(s.startedAt);
				return (
					date.getFullYear() === viewedMonth.getFullYear() &&
					date.getMonth() === viewedMonth.getMonth()
				);
			})
	);
	const daySessions = $derived(
		selectedDay !== null
			? [...(byDay.get(selectedDay) ?? [])].sort((a, b) => a.startedAt - b.startedAt)
			: []
	);

	const today = startOfDay(Date.now());

	const isCompetition = (s: Session) => s.kind === 'competition';
	const isToday = (s: Session) => startOfDay(s.startedAt) === today;

	/**
	 * A session nothing was shot in yet, which is how a planned one looks too. Display only: the row
	 * steps back so the outings that hold arrows are the ones the eye lands on.
	 */
	const isEmpty = $derived(
		(s: Session) =>
			!isCompetition(s) &&
			(counts[s.id]?.arrows ?? 0) === 0 &&
			(counts[s.id]?.activities ?? 0) === 0
	);

	const sessionName = $derived((s: Session) => s.label ?? $t(defaultNameKey(s.kind, s.startedAt)));

	const SHOT_DOT = 'bg-muted/70 border-muted/70';
	const PLANNED_DOT = 'bg-surface border-line';

	/**
	 * What a day looks like at a glance: a competition in the accent colour, an outing that happened
	 * in grey, and anything still only intended pale, whether it was planned by hand or by a plan.
	 */
	function dayMarks(day: number): string[] {
		const marks: string[] = (byDay.get(day) ?? []).map((s) =>
			isCompetition(s)
				? 'bg-competition border-competition'
				: s.kind === 'planned' || (counts[s.id]?.arrows ?? 0) === 0
					? PLANNED_DOT
					: SHOT_DOT
		);

		// A plan marks its own weekday for as long as the plan runs, near week or far.
		if (day >= today) {
			const weekday = weekdayOf(day);
			for (const _slot of slots.filter((slot) => slot.weekday === weekday)) marks.push(PLANNED_DOT);
		}
		return marks;
	}

	const shortDay = $derived((at: number) => $dateFormats.weekdayShort(at).replace(/\.$/, '') + '.');
	const dayNumber = (at: number) => new Date(at).getDate();
	const shortDate = $derived((at: number) => $dateFormats.shortDate(at));
	const monthTitle = $derived((date: Date) => $dateFormats.monthYear(date.getTime()));

	/** Weekday initials in the locale's order, Monday first to match the grid. */
	const weekdayHeads = $derived(
		monthGrid(2024, 0)
			.slice(0, 7)
			.map((d) => $dateFormats.weekdayNarrow(d.at))
	);

	const VIEWS = $derived([
		{ key: 'list' as const, label: $t('sessions.listTab') },
		{ key: 'calendar' as const, label: $t('sessions.calendarTab') }
	]);
	const viewLabel = $derived(VIEWS.find((view) => view.key === tab)?.label ?? '');

	/** The same three ways to start an outing, whichever shape the bottom of the page is in. */
	const NEW_KINDS = $derived([
		{
			label: $t('sessions.new'),
			icon: 'target' as const,
			onselect: () => start('practice'),
			accent: true
		},
		{
			label: $t('sessions.newCompetition'),
			icon: 'medal' as const,
			onselect: () => schedule('competition')
		},
		{
			label: $t('sessions.newPlanned'),
			icon: 'calendar' as const,
			onselect: () => schedule('planned')
		}
	]);
</script>

<!--
	One card for both views. The face and the rail are spent on a competition, which is the row worth
	finding in a year of practice; today is said in the margin instead, where the date already is.
-->
{#snippet card(s: Session, withDate: boolean)}
	<a
		href="/sessions/{s.id}"
		class="relative flex flex-1 items-center gap-3 overflow-hidden rounded-xl border p-3 pl-4 transition-colors active:bg-sunk/40
			{isCompetition(s)
			? 'border-competition/40 bg-gradient-to-r from-competition/12 to-surface'
			: isToday(s)
				? 'border-brand/30 bg-surface'
				: isEmpty(s)
					? 'border-dashed border-line bg-transparent'
					: 'border-line bg-surface'}"
	>
		{#if isCompetition(s)}
			<span class="absolute inset-y-0 left-0 w-1 bg-competition"></span>
		{/if}

		{#if isCompetition(s)}
			<span
				class="flex aspect-square shrink-0 items-center justify-center self-stretch rounded-lg bg-competition/10 text-competition"
			>
				<Icon name="medal" size={26} />
			</span>
		{/if}

		<div class="min-w-0 flex-1">
			<p
				class="truncate {isCompetition(s)
					? 'font-semibold text-competition'
					: isEmpty(s)
						? 'font-medium text-muted'
						: 'font-semibold'}"
			>
				{sessionName(s)}
			</p>

			<!-- One line while it fits: flex-wrap drops the place name to its own line only when it must. -->
			<p class="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
				{#if withDate}
					<span class="shrink-0">{shortDate(s.startedAt)}</span>
					<span class="text-line">·</span>
				{/if}
				<span class="tabular shrink-0">{$formatTime(s.startedAt)}</span>
				<!-- Nothing entered yet says nothing: a row reading "0 act." looks like a failed count. -->
				{#if (counts[s.id]?.activities ?? 0) > 0}
					<span class="text-line">·</span>
					<span class="shrink-0">{activityLabel(s.id)}</span>
				{/if}
				{#if s.location}
					<!-- Dot and place travel together, so a wrapped place name still reads as one item. -->
					<span class="flex max-w-full min-w-0 items-center gap-1.5">
						<span class="text-line">·</span>
						<span class="truncate">{s.location}</span>
					</span>
				{/if}
			</p>
		</div>

		<!--
			An outing that has not happened has no arrows to count, and a zero there reads as a bad day
			rather than as a day still to come. It says what it is instead.
		-->
		{#if s.kind === 'planned'}
			<div class="shrink-0 text-center text-muted">
				<span class="flex justify-center"><Icon name="calendar" size={20} /></span>
				<p class="mt-1 text-[10px] tracking-wide uppercase">{$t('sessions.planned')}</p>
			</div>
		{:else}
			<div class="shrink-0 text-right">
				<p
					class="tabular text-lg leading-none font-bold {isCompetition(s)
						? 'text-competition'
						: isEmpty(s)
							? 'text-muted'
							: ''}"
				>
					{counts[s.id]?.arrows ?? 0}
				</p>
				<p class="text-[10px] tracking-wide text-muted uppercase">{$t('sessions.arrows')}</p>
			</div>
		{/if}
	</a>
{/snippet}

<!-- A slot from a plan: not a session yet, so it says what it would be and nothing more. -->
{#snippet slotCard(occurrence: Occurrence)}
	<a
		href={occurrenceHref(occurrence)}
		class="flex flex-1 items-center gap-3 rounded-xl border border-dashed border-brand/40 p-3 pl-4 text-left"
	>
		<div class="min-w-0 flex-1">
			<p class="truncate font-medium text-muted">
				{occurrence.label ?? $t(defaultNameKey('practice', occurrence.at))}
			</p>
			<p class="mt-1 flex items-center gap-1.5 text-xs text-muted">
				<span
					class="inline-flex shrink-0 items-center rounded-full border border-brand/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-text uppercase"
				>
					{plans.find((plan) => plan.id === occurrence.planId)?.name ?? $t('plans.slot')}
				</span>
				<span class="tabular shrink-0">{$formatTime(occurrence.at)}</span>
			</p>
		</div>

		<!-- What the plan asks for, said as a goal: the same figure under "arrows" read as a score. -->
		<div class="shrink-0 text-center text-muted">
			<span class="flex justify-center"><Icon name="calendar" size={20} /></span>
			{#if occurrence.arrowGoal}
				<p class="tabular mt-1 text-[10px] tracking-wide uppercase">
					{$t('sessions.arrowGoal', { n: occurrence.arrowGoal })}
				</p>
			{:else}
				<p class="mt-1 text-[10px] tracking-wide uppercase">{$t('sessions.planned')}</p>
			{/if}
		</div>
	</a>
{/snippet}

<div class="flex h-full flex-col">
	<PageHeader motif="sessions" title={$t('sessions.title')}>
		{#snippet actions()}
			<MoreMenu
				label={$t('common.more')}
				icon="dots"
				placement="down"
				wrapperClass=""
				triggerClass="flex items-center justify-center rounded-lg p-1.5 text-muted"
				items={[
					{
							label: $showWeekGoal ? $t('sessions.hideWeekGoal') : $t('sessions.showWeekGoal'),
							icon: 'target',
							onselect: () => showWeekGoal.set(!$showWeekGoal)
						},
						{ label: $t('plans.view'), icon: 'chart', onselect: () => goto('/plans') },
					{ label: $t('timer.title'), icon: 'clock', onselect: () => goto(withOrigin('/timer', '/sessions')) },
					{ label: $t('help.title'), icon: 'help', onselect: () => goto('/help') }
				]}
			/>
		{/snippet}
	</PageHeader>

	<!-- The search stays put and the list under it scrolls, the way a calendar app holds its header.
		One line for both: the view is a pill rather than a tab strip, which spends a row on nothing. -->
	<div class="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 pt-3">
		<div class="mb-3 flex shrink-0 items-center gap-2">
			<!-- Nothing to search in a month grid, so the box greys out rather than filtering nothing. -->
			<div class="relative min-w-0 flex-1 {tab === 'calendar' ? 'opacity-50' : ''}">
				<span class="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted">
					<Icon name="search" size={16} />
				</span>
				<input
					class="w-full rounded-full border border-line bg-surface py-1.5 pr-8 pl-8 text-sm text-ink outline-none placeholder:text-muted"
					type="text"
					placeholder={$t('sessions.search')}
					aria-label={$t('sessions.search')}
					bind:value={query}
					disabled={tab === 'calendar'}
				/>
				{#if searching && tab !== 'calendar'}
					<button
						class="absolute top-1/2 right-2 -translate-y-1/2 text-muted"
						aria-label={$t('common.close')}
						onclick={() => (query = '')}
					>
						<Icon name="close" size={14} />
					</button>
				{/if}
			</div>

			<!-- Plain whatever is chosen: it says which half of the page is open, not that anything is on. -->
			<button
				class="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pr-2 pl-3 text-sm font-medium whitespace-nowrap"
				aria-haspopup="dialog"
				onclick={() => (pickingView = true)}
			>
				{viewLabel}
				<span class="rotate-180 text-muted"><Icon name="chevronUp" size={13} /></span>
			</button>
		</div>

		<div
			bind:this={scrollPane}
			class="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4
				{$fullNewSessionButton ? 'pb-4' : 'pb-20'}"
		>
			<!-- A plan's slots count as something to show: a first week can be planned before it is shot. -->
			{#if rows.length === 0 && tab === 'list'}
				{#if searching}
					<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
						{$t('sessions.noMatch')}
					</p>
				{:else}
					<EmptyState
						title={$t('empty.sessions.title')}
						body={$t('empty.sessions.body')}
						action={{ label: $t('sessions.new'), onclick: () => start() }}
					>
						{#snippet sample()}
							<!-- The shape of a week in this list: a day in the margin, an outing beside it. -->
							<div class="flex items-start gap-3">
								<div class="w-9 shrink-0 text-center">
									<p class="text-[11px] leading-none text-muted">{shortDay(today)}</p>
									<p class="tabular mt-0.5 text-lg leading-none font-bold">
										{dayNumber(today)}
									</p>
								</div>
								<div class="flex flex-1 items-center gap-3 rounded-xl border border-line bg-surface p-3">
									<div class="min-w-0 flex-1">
										<p class="truncate font-semibold">{$t('sessions.name.practice.morning')}</p>
										<p class="mt-1 text-xs text-muted">
											{$t('sessions.oneActivity')} · 72 {$t('sessions.arrows')}
										</p>
									</div>
									<p class="tabular text-lg leading-none font-bold">72</p>
								</div>
							</div>
						{/snippet}
					</EmptyState>
				{/if}
			{:else if tab === 'list'}
				<!-- Read like a planning: weeks as headers, days in the margin, the session in the card. -->
				<div class="space-y-5">
					{#each weeks as group (group.start)}
						<!-- The week the list opens on, held so the effect above can bring it into view. -->
						{@const reached = weekGoal > 0 && weekArrows(group) >= weekGoal}
						<section use:markAnchor={group.start}>
							<header class="mb-2 flex items-baseline gap-2 border-b border-line pb-1">
								<h2 class="text-sm font-semibold">{$t('sessions.week', { n: group.week })}</h2>
								<!-- The week's volume, quiet enough that the dates still read as the header. Against
									the plan when asked for, and said out loud only once the week is done. -->
								<span
									class="tabular rounded-full px-2 py-0.5 text-[11px] leading-none
										{$showWeekGoal && reached
										? 'bg-brand/20 font-semibold text-brand-text'
										: 'bg-sunk text-muted'}"
								>
									{weekArrows(group)}{#if $showWeekGoal && weekGoal > 0}/{weekGoal}{/if}
									{$t('sessions.arrows')}
								</span>
								<span class="ml-auto text-xs text-muted">
									{shortDate(group.start)} – {shortDate(group.end)}
								</span>
							</header>

							<ul class="space-y-3">
								{#each daysOf(group) as day (day.at)}
									{@const onToday = day.at === today}
									<!-- One day, one block: the date is said once and the outings hang off its spine. -->
									<li
										class="relative flex items-start gap-3 rounded-xl
											{pulsing && onToday ? 'anchor-pulse' : ''}"
										use:markToday={onToday}
									>
										<div class="w-9 shrink-0 text-center">
											<!-- The weekday joins the pill on today, so the margin says it twice over. -->
											<p
												class="text-[11px] leading-none {onToday
													? 'font-semibold text-brand-text'
													: 'text-muted'}"
											>
												{shortDay(day.at)}
											</p>
											<!-- Today wears a filled pill, so the current day is findable without reading dates. -->
											<p
												class="tabular mt-0.5 text-lg leading-none font-bold
													{onToday
													? 'mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-ink'
													: ''}"
											>
												{dayNumber(day.at)}
											</p>
										</div>

										<!-- The spine runs from under the pill to the last outing of the day, which is
											what makes several cards read as one day rather than as three loose rows. -->
										<span
											class="pointer-events-none absolute top-11 bottom-0 left-[17px] w-0.5 rounded-full
												{onToday ? 'bg-brand/40' : 'bg-ink/15'}"
										></span>

										<ul class="min-w-0 flex-1 space-y-2">
											{#each day.rows as row (row.session?.id ?? `${row.occurrence?.slotId}-${row.at}`)}
												<li class="flex">
													{#if row.session}
														{@render card(row.session, false)}
													{:else if row.occurrence}
														{@render slotCard(row.occurrence)}
													{/if}
												</li>
											{/each}
										</ul>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{:else}
				<section class="rounded-xl border border-line bg-surface p-3">
					<header class="mb-3 flex items-center justify-between">
						<button
							class="rounded-lg p-1 text-muted"
							aria-label={$t('sessions.prevMonth')}
							onclick={() => stepMonth(-1)}
						>
							<Icon name="back" size={20} />
						</button>
						<!-- The title is the way to any other month: stepping to last winter would take twelve taps. -->
						<button
							class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold"
							aria-haspopup="dialog"
							onclick={() => (pickingMonth = true)}
						>
							{monthTitle(viewedMonth)}
							<span class="rotate-180 text-muted"><Icon name="chevronUp" size={16} /></span>
						</button>
						<button
							class="rotate-180 rounded-lg p-1 text-muted"
							aria-label={$t('sessions.nextMonth')}
							onclick={() => stepMonth(1)}
						>
							<Icon name="back" size={20} />
						</button>
					</header>

					<div class="grid grid-cols-7 gap-1 text-center">
						{#each weekdayHeads as head, i (i)}
							<span class="text-[11px] font-semibold text-muted">{head}</span>
						{/each}

						{#each grid as day (day.at)}
							{@const list = byDay.get(day.at) ?? []}
							{@const marks = dayMarks(day.at)}
							<button
								class="flex aspect-square flex-col items-center justify-center rounded-lg text-sm
									{day.inMonth ? '' : 'opacity-30'}
									{selectedDay === day.at ? 'bg-brand font-bold text-brand-ink' : ''}
									{day.at === today && selectedDay !== day.at ? 'ring-1 ring-brand' : ''}"
								disabled={list.length === 0}
								onclick={() => (selectedDay = selectedDay === day.at ? null : day.at)}
							>
								<span class="tabular leading-none">{new Date(day.at).getDate()}</span>
								<!-- A dot per outing, capped, so a busy day reads as busy without counting pixels. -->
								<span class="mt-1 flex h-1.5 gap-0.5">
									{#each marks.slice(0, 3) as mark, i (i)}
										<span
											class="h-1.5 w-1.5 rounded-full border {selectedDay === day.at
												? 'border-brand-ink bg-brand-ink'
												: mark}"
										></span>
									{/each}
								</span>
							</button>
						{/each}
					</div>
				</section>

				<div class="mt-3 space-y-2">
					{#each selectedDay !== null ? daySessions : monthSessions as s (s.id)}
						{@render card(s, true)}
					{:else}
						<p class="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
							{$t('sessions.noneThisMonth')}
						</p>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Sticky rather than fixed, so it sits under the list yet never scrolls out of reach. -->
	{#if $fullNewSessionButton}
		<div class="sticky bottom-0 shrink-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
			<div class="mx-auto flex w-full max-w-2xl gap-2">
				<MoreMenu label={$t('sessions.moreKinds')} items={NEW_KINDS} />
				<button
					class="flex w-4/5 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink"
					onclick={() => start()}
				>
					<Icon name="plus" size={20} />
					{$t('sessions.new')}
				</button>
			</div>
		</div>
	{:else}
		<!-- A button rather than a bar: the strip a bar takes is list, and the choices are the same
			ones. Zero height and end aligned, so it hangs over the last rows rather than pushing them
			up, and only the button itself catches taps. -->
		<div class="pointer-events-none sticky bottom-0 z-10 flex h-0 shrink-0 items-end justify-end">
			<MoreMenu
				label={$t('sessions.new')}
				icon="plus"
				align="right"
				wrapperClass="pointer-events-auto mr-4 mb-4"
				triggerClass="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg"
				items={NEW_KINDS}
			/>
		</div>
	{/if}
</div>

<Sheet open={pickingView} title={$t('sessions.view')} onclose={() => (pickingView = false)}>
	<ul class="space-y-1">
		{#each VIEWS as view (view.key)}
			<li>
				<button
					class="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm
						{tab === view.key ? 'bg-sunk font-semibold' : ''}"
					aria-pressed={tab === view.key}
					onclick={() => {
						tab = view.key;
						pickingView = false;
					}}
				>
					<span class="flex-1">{view.label}</span>
					{#if tab === view.key}
						<span class="text-brand-text"><Icon name="check" size={16} /></span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

{#if planningAt !== null}
	<DateTimeDialog
		title={$t(planningKind === 'competition' ? 'sessions.newCompetition' : 'sessions.newPlanned')}
		value={planningAt}
		confirmLabel={$t('common.add')}
		onconfirm={plan}
		oncancel={() => (planningAt = null)}
	/>
{/if}

{#if pickingMonth}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
			use:scrim={0.4}
			aria-label={$t('common.close')}
			onclick={() => (pickingMonth = false)}
		></button>

		<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
			<h2 class="mb-3 text-lg font-bold">{$t('sessions.jumpTo')}</h2>
			<div class="grid grid-cols-2 gap-3">
				<WheelPicker
					values={MONTHS.map((m) => m.value)}
					value={viewed.month}
					label={$t('sessions.month')}
					item={36}
					format={(v) => MONTHS[v].label}
					onchange={(v) => (viewed = { ...viewed, month: v })}
				/>
				<WheelPicker
					values={YEARS}
					value={viewed.year}
					label={$t('sessions.year')}
					item={36}
					onchange={(v) => (viewed = { ...viewed, year: v })}
				/>
			</div>

			<div class="mt-4 flex gap-2">
				<button
					class="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
					onclick={() => {
						viewed = { year: new Date().getFullYear(), month: new Date().getMonth() };
						selectedDay = null;
					}}
				>
					{$t('sessions.thisMonth')}
				</button>
				<button
					class="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
					onclick={() => {
						selectedDay = null;
						pickingMonth = false;
					}}
				>
					{$t('common.done')}
				</button>
			</div>
		</div>
	</div>
{/if}
