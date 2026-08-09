<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { listSessions, listAllActivities, createSession } from '$lib/db/repository';
	import { groupByWeek, monthGrid, startOfDay } from '$lib/domain/dates';
	import { defaultBowId, formatTime, dateFormats } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { registerTabs } from '$lib/nav';

	type Session = Awaited<ReturnType<typeof listSessions>>[number];

	let sessions = $state<Session[]>([]);
	let counts = $state<Record<string, { activities: number; arrows: number }>>({});
	let tab = $state<'list' | 'calendar'>('list');
	/** Month being browsed in the calendar, as an offset from this month so it survives a rerender. */
	let monthOffset = $state(0);
	let selectedDay = $state<number | null>(null);

	async function refresh() {
		sessions = await listSessions();
		const activities = await listAllActivities();
		counts = activities.reduce<Record<string, { activities: number; arrows: number }>>((acc, a) => {
			const entry = (acc[a.sessionId] ??= { activities: 0, arrows: 0 });
			entry.activities += 1;
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
	async function start() {
		goto(`/sessions/${await createSession({ bowId: $defaultBowId })}`);
	}

	function activityLabel(id: string) {
		const n = counts[id]?.activities ?? 0;
		return n === 1 ? $t('sessions.oneActivity') : $t('sessions.activityCount', { n });
	}

	const weeks = $derived(groupByWeek(sessions, (s) => s.startedAt));

	/** Sessions keyed by day, which is what both the calendar dots and the day list read from. */
	const byDay = $derived(
		sessions.reduce<Map<number, Session[]>>((acc, s) => {
			const key = startOfDay(s.startedAt);
			acc.set(key, [...(acc.get(key) ?? []), s]);
			return acc;
		}, new Map())
	);

	const viewedMonth = $derived(
		new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1)
	);
	const grid = $derived(monthGrid(viewedMonth.getFullYear(), viewedMonth.getMonth()));
	const monthSessions = $derived(
		sessions.filter((s) => {
			const date = new Date(s.startedAt);
			return (
				date.getFullYear() === viewedMonth.getFullYear() && date.getMonth() === viewedMonth.getMonth()
			);
		})
	);
	const daySessions = $derived(selectedDay !== null ? (byDay.get(selectedDay) ?? []) : []);

	const today = startOfDay(Date.now());

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

	$effect(() =>
		registerTabs({
			count: TABS.length,
			index: TABS.findIndex((item) => item.key === tab),
			select: (i) => (tab = TABS[i].key)
		})
	);
</script>

<div class="flex min-h-full flex-col">
<PageHeader motif="sessions" title={$t('sessions.title')} />

<div class="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4">
	<nav class="mb-4 flex gap-1 rounded-lg bg-sunk p-1">
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

	{#if sessions.length === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('sessions.empty')}
		</p>
	{:else if tab === 'list'}
		<!-- Read like a planning: weeks as headers, days in the margin, the session itself in the card. -->
		<div class="space-y-5">
			{#each weeks as group (group.start)}
				<section>
					<header class="mb-2 flex items-baseline justify-between border-b border-line pb-1">
						<h2 class="text-sm font-semibold">{$t('sessions.week', { n: group.week })}</h2>
						<span class="text-xs text-muted">
							{shortDate(group.start)} – {shortDate(group.end)}
						</span>
					</header>

					<ul class="space-y-2">
						{#each group.items as s (s.id)}
							<li class="flex items-center gap-3">
								<div class="w-9 shrink-0 text-center">
									<p class="text-[11px] leading-none text-muted">{shortDay(s.startedAt)}</p>
									<!-- Today wears a filled pill, so the current day is findable without reading dates. -->
									<p
										class="tabular mt-0.5 text-lg leading-none font-bold
											{startOfDay(s.startedAt) === today
											? 'mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-ink'
											: ''}"
									>
										{dayNumber(s.startedAt)}
									</p>
								</div>
								<a
									href="/sessions/{s.id}"
									class="flex flex-1 items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
								>
									<div class="min-w-0">
										<p class="truncate font-semibold">{s.label ?? $t('sessions.untitled')}</p>
										<p class="text-xs text-muted">
											{$formatTime(s.startedAt)} · {activityLabel(s.id)}
										</p>
									</div>
									<div class="text-right">
										<p class="tabular text-lg leading-none font-bold">
											{counts[s.id]?.arrows ?? 0}
										</p>
										<p class="text-[11px] text-muted">{$t('sessions.arrows')}</p>
									</div>
								</a>
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
					aria-label={$t('common.back')}
					onclick={() => {
						monthOffset -= 1;
						selectedDay = null;
					}}
				>
					<Icon name="back" size={20} />
				</button>
				<h2 class="text-sm font-semibold">{monthTitle(viewedMonth)}</h2>
				<button
					class="rotate-180 rounded-lg p-1 text-muted disabled:opacity-30"
					aria-label={$t('common.done')}
					disabled={monthOffset >= 0}
					onclick={() => {
						monthOffset += 1;
						selectedDay = null;
					}}
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
					<button
						class="flex aspect-square flex-col items-center justify-center rounded-lg text-sm
							{day.inMonth ? '' : 'opacity-30'}
							{selectedDay === day.at ? 'bg-brand text-brand-ink font-bold' : ''}
							{day.at === today && selectedDay !== day.at ? 'ring-1 ring-brand' : ''}"
						disabled={list.length === 0}
						onclick={() => (selectedDay = selectedDay === day.at ? null : day.at)}
					>
						<span class="tabular leading-none">{new Date(day.at).getDate()}</span>
						<!-- A dot per session, capped, so a busy day reads as busy without counting pixels. -->
						<span class="mt-1 flex h-1.5 gap-0.5">
							{#each list.slice(0, 3) as s (s.id)}
								<span
									class="h-1.5 w-1.5 rounded-full {selectedDay === day.at
										? 'bg-brand-ink'
										: 'bg-brand'}"
								></span>
							{/each}
						</span>
					</button>
				{/each}
			</div>
		</section>

		<div class="mt-3 space-y-2">
			{#each selectedDay !== null ? daySessions : monthSessions as s (s.id)}
				<a
					href="/sessions/{s.id}"
					class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
				>
					<div class="min-w-0">
						<p class="truncate font-semibold">{s.label ?? $t('sessions.untitled')}</p>
						<p class="text-xs text-muted">
							{shortDate(s.startedAt)} · {$formatTime(s.startedAt)} · {activityLabel(s.id)}
						</p>
					</div>
					<p class="tabular text-lg font-bold">{counts[s.id]?.arrows ?? 0}</p>
				</a>
			{:else}
				<p class="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
					{$t('sessions.noneThisMonth')}
				</p>
			{/each}
		</div>
	{/if}
</div>

<!-- Sticky rather than fixed, so it sits under the list yet never scrolls out of reach. -->
<div class="sticky bottom-0 border-t border-line bg-bg/95 p-4 backdrop-blur">
	<button
		class="mx-auto flex w-full max-w-2xl items-center justify-center gap-1.5 rounded-xl bg-brand py-3 font-semibold text-brand-ink"
		onclick={start}
	>
		<Icon name="plus" size={20} />
		{$t('sessions.new')}
	</button>
</div>
</div>
