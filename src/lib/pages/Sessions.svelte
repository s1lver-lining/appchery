<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		listSessions,
		listAllActivities,
		listPlanSlots,
		listPlans,
		createSession,
		updateSession
	} from '$lib/db/repository';
	import { upcoming, weekdayOf, type Occurrence } from '$lib/domain/plans';
	import { groupByWeek, monthGrid, startOfDay } from '$lib/domain/dates';
	import { defaultNameKey } from '$lib/domain/sessions';
	import { defaultBowId, formatTime, dateFormats } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';
	import DateTimeDialog from '$lib/ui/DateTimeDialog.svelte';

	type Session = Awaited<ReturnType<typeof listSessions>>[number];

	let sessions = $state<Session[]>([]);
	let counts = $state<Record<string, { activities: number; arrows: number }>>({});
	let tab = $state<'list' | 'calendar'>('list');
	/** The month on show, held outright rather than as an offset, so any month can be jumped to. */
	let viewed = $state({ year: new Date().getFullYear(), month: new Date().getMonth() });
	let pickingMonth = $state(false);
	let selectedDay = $state<number | null>(null);
	let slots = $state<Awaited<ReturnType<typeof listPlanSlots>>>([]);
	let plans = $state<Awaited<ReturnType<typeof listPlans>>>([]);
	let planningAt = $state<number | null>(null);
	let loaded = $state(false);

	async function refresh() {
		sessions = await listSessions();
		slots = await listPlanSlots();
		plans = await listPlans();
		const activities = await listAllActivities();
		loaded = true;
		counts = activities.reduce<Record<string, { activities: number; arrows: number }>>((acc, a) => {
			const entry = (acc[a.sessionId] ??= { activities: 0, arrows: 0 });
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

	/** A planned session is one you are choosing a date for, so the date comes before the session. */
	async function plan(at: number) {
		planningAt = null;
		const id = await createSession({ kind: 'planned', bowId: $defaultBowId });
		await updateSession(id, { startedAt: at });
		goto(`/sessions/${id}`);
	}

	/**
	 * A plan's slots are not sessions until something is entered in one. Until then they only show,
	 * which is why a week nobody shot leaves nothing to clean up.
	 */
	const occurrences = $derived(
		upcoming(
			slots,
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

	type Row = { at: number; session?: Session; occurrence?: Occurrence };
	const rows = $derived<Row[]>([
		...sessions.map((session) => ({ at: session.startedAt, session })),
		...occurrences.map((occurrence) => ({ at: occurrence.at, occurrence }))
	]);
	const weeks = $derived(groupByWeek(rows, (row) => row.at));
	const weekArrows = $derived((group: (typeof weeks)[number]) =>
		group.items.reduce(
			(sum, row) => sum + (row.session ? (counts[row.session.id]?.arrows ?? 0) : 0),
			0
		)
	);

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

	let scrolled = false;
	$effect(() => {
		if (scrolled || !loaded || !anchor || tab !== 'list') return;
		scrolled = true;
		// After the frame that lays the weeks out, otherwise it aims at a list still growing above it.
		requestAnimationFrame(() => anchor && scrollToTop(anchor));
	});

	/**
	 * The pane is scrolled by hand rather than through scrollIntoView, which also scrolls every
	 * ancestor: on this page that dragged the page pager sideways and left the app between two pages.
	 */
	function scrollToTop(node: HTMLElement) {
		let pane = node.parentElement;
		while (pane && !/auto|scroll/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
		if (!pane) return;
		pane.scrollTop += node.getBoundingClientRect().top - pane.getBoundingClientRect().top;
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
				? 'bg-accent border-accent'
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

	const TABS = $derived([
		{ key: 'list' as const, label: $t('sessions.listTab') },
		{ key: 'calendar' as const, label: $t('sessions.calendarTab') }
	]);
</script>

<!--
	One card for both views. A competition carries its medal and wears the accent on its name; the
	face and rail are spent on today, which is the row the eye should land on first.
-->
{#snippet card(s: Session, withDate: boolean)}
	<a
		href="/sessions/{s.id}"
		class="relative flex flex-1 items-center gap-3 overflow-hidden rounded-xl border p-3 pl-4 transition-colors active:bg-sunk/40
			{isToday(s)
			? 'border-brand/40 bg-gradient-to-r from-brand/12 to-surface'
			: isEmpty(s)
				? 'border-dashed border-line bg-transparent'
				: 'border-line bg-surface'}"
	>
		{#if isToday(s)}
			<span class="absolute inset-y-0 left-0 w-1 bg-brand"></span>
		{/if}

		{#if isCompetition(s)}
			<span
				class="flex aspect-square shrink-0 items-center justify-center self-stretch rounded-lg bg-accent/10 text-accent"
			>
				<Icon name="medal" size={26} />
			</span>
		{/if}

		<div class="min-w-0 flex-1">
			<p
				class="truncate {isCompetition(s)
					? 'font-semibold text-accent'
					: isEmpty(s)
						? 'font-medium text-muted'
						: 'font-semibold'}"
			>
				{sessionName(s)}
			</p>

			<p class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
				{#if s.kind === 'planned'}
					<!-- Said out loud, because an empty session that was meant to be empty reads as a mistake. -->
					<span
						class="inline-flex shrink-0 items-center rounded-full border border-line px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
					>
						{$t('sessions.planned')}
					</span>
				{/if}
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
			</p>

			{#if s.location}
				<!-- On its own line: squeezed onto the one above it, a place name clips to a letter. -->
				<p class="mt-0.5 truncate text-xs text-muted">{s.location}</p>
			{/if}
		</div>

		<div class="shrink-0 text-right">
			<p
				class="tabular text-lg leading-none font-bold {isCompetition(s)
					? 'text-accent'
					: isEmpty(s)
						? 'text-muted'
						: ''}"
			>
				{counts[s.id]?.arrows ?? 0}
			</p>
			<p class="text-[10px] tracking-wide text-muted uppercase">{$t('sessions.arrows')}</p>
		</div>
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

		{#if occurrence.arrowGoal}
			<div class="shrink-0 text-right">
				<p class="tabular text-lg leading-none font-bold text-muted">{occurrence.arrowGoal}</p>
				<p class="text-[10px] tracking-wide text-muted uppercase">{$t('sessions.arrows')}</p>
			</div>
		{/if}
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
					{ label: $t('plans.view'), icon: 'chart', onselect: () => goto('/plans') },
					{ label: $t('help.title'), icon: 'help', onselect: () => goto('/help') }
				]}
			/>
		{/snippet}
	</PageHeader>

	<!-- The tabs stay put and the list under them scrolls, the way a calendar app holds its header. -->
	<div class="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 pt-4">
		<nav class="mb-4 flex shrink-0 gap-1 rounded-lg bg-sunk p-1">
			{#each TABS as item (item.key)}
				<button
					class="flex-1 rounded-md py-1.5 text-sm font-medium
						{tab === item.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
					onclick={() => (tab = item.key)}
				>
					{item.label}
				</button>
			{/each}
		</nav>

		<div
			bind:this={scrollPane}
			class="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4"
		>
			<!-- A plan's slots count as something to show: a first week can be planned before it is shot. -->
			{#if rows.length === 0}
				<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
					{$t('sessions.empty')}
				</p>
			{:else if tab === 'list'}
				<!-- Read like a planning: weeks as headers, days in the margin, the session in the card. -->
				<div class="space-y-5">
					{#each weeks as group (group.start)}
						<!-- The week the list opens on, held so the effect above can bring it into view. -->
						<section use:markAnchor={group.start}>
							<header class="mb-2 flex items-baseline gap-2 border-b border-line pb-1">
								<h2 class="text-sm font-semibold">{$t('sessions.week', { n: group.week })}</h2>
								<!-- The week's volume, quiet enough that the dates still read as the header. -->
								<span
									class="tabular rounded-full bg-sunk px-2 py-0.5 text-[11px] leading-none text-muted"
								>
									{weekArrows(group)}
									{$t('sessions.arrows')}
								</span>
								<span class="ml-auto text-xs text-muted">
									{shortDate(group.start)} – {shortDate(group.end)}
								</span>
							</header>

							<ul class="space-y-2">
								{#each group.items as row (row.session?.id ?? `${row.occurrence?.slotId}-${row.at}`)}
									<li class="flex items-center gap-3">
										<div class="w-9 shrink-0 text-center">
											<p class="text-[11px] leading-none text-muted">{shortDay(row.at)}</p>
											<!-- Today wears a filled pill, so the current day is findable without reading dates. -->
											<p
												class="tabular mt-0.5 text-lg leading-none font-bold
													{startOfDay(row.at) === today
													? 'mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-ink'
													: ''}"
											>
												{dayNumber(row.at)}
											</p>
										</div>
										{#if row.session}
											{@render card(row.session, false)}
										{:else if row.occurrence}
											{@render slotCard(row.occurrence)}
										{/if}
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
	<div class="sticky bottom-0 shrink-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
		<div class="mx-auto flex w-full max-w-2xl gap-2">
			<MoreMenu
				label={$t('sessions.moreKinds')}
				items={[
					{ label: $t('sessions.new'), onselect: () => start('practice') },
					{ label: $t('sessions.newCompetition'), onselect: () => start('competition') },
					{ label: $t('sessions.newPlanned'), onselect: () => (planningAt = Date.now()) }
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

{#if pickingMonth}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
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
