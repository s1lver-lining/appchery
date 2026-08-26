<script lang="ts">
	import { untrack } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import { monthGrid, startOfDay } from '$lib/domain/dates';
	import { dateFormats, use24Hour } from '$lib/prefs';
	import Icon from './Icon.svelte';
	import WheelPicker from './WheelPicker.svelte';
	import { closeOnBack } from './dismiss.svelte';
	import { scrim } from './statusBar';
	import { lockScroll } from './scrollLock';

	/**
	 * When something is meant to happen. The month is on show rather than behind a native field: a
	 * date is chosen by looking at the week it falls in, which a text field never shows.
	 */
	let {
		title,
		value,
		confirmLabel,
		dateOnly = false,
		onconfirm,
		oncancel
	}: {
		title: string;
		/** Milliseconds the dialog opens on. */
		value: number;
		confirmLabel?: string;
		/** For something that lasts a day rather than happens at an hour: the clock is left out. */
		dateOnly?: boolean;
		onconfirm: (at: number) => void;
		oncancel: () => void;
	} = $props();

	// A dialog is a place: the back key leaves it, not the page underneath it.
	closeOnBack(
		() => true,
		() => oncancel()
	);

	// Read once on purpose: the dialog opens on the value it was given and is then the archer's.
	const opened = new Date(untrack(() => value));

	let day = $state(startOfDay(opened.getTime()));
	let viewed = $state({ year: opened.getFullYear(), month: opened.getMonth() });
	let hour = $state(opened.getHours());
	/** Five minute steps: this is a time to turn up at, and no plan is made to the minute. */
	const STEP = 5;
	// Rounded down, so opening the dialog never moves the time it was given forward past the hour.
	let minute = $state(Math.floor(opened.getMinutes() / STEP) * STEP);

	const grid = $derived(monthGrid(viewed.year, viewed.month));
	const monthTitle = $derived(
		$dateFormats.monthYear(new Date(viewed.year, viewed.month, 1).getTime())
	);
	const today = startOfDay(Date.now());

	/** Weekday initials in the locale's order, Monday first to match the grid. */
	const weekdayHeads = $derived(
		monthGrid(2024, 0)
			.slice(0, 7)
			.map((d) => $dateFormats.weekdayNarrow(d.at))
	);

	function stepMonth(by: number) {
		const moved = new Date(viewed.year, viewed.month + by, 1);
		viewed = { year: moved.getFullYear(), month: moved.getMonth() };
	}

	// The day picked stays picked while the months are stepped through, so it is never lost.
	function pick(at: number) {
		day = at;
		const date = new Date(at);
		viewed = { year: date.getFullYear(), month: date.getMonth() };
	}

	const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
	const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
	const MINUTES = Array.from({ length: 60 / STEP }, (_, i) => i * STEP);

	const pad = (n: number) => String(n).padStart(2, '0');
	const hour12 = $derived(((hour + 11) % 12) + 1);
	const isPm = $derived(hour >= 12);

	/** Said the way the locale says it, so a French archer on a 12 hour clock does not read "PM". */
	const dayPeriod = (part: string) =>
		new Intl.DateTimeFormat($locale, { hour: 'numeric', hour12: true })
			.formatToParts(new Date(2024, 0, 1, part === 'pm' ? 21 : 9))
			.find((piece) => piece.type === 'dayPeriod')?.value ?? part.toUpperCase();

	function confirm() {
		const date = new Date(day);
		onconfirm(
			new Date(
				date.getFullYear(),
				date.getMonth(),
				date.getDate(),
				dateOnly ? 0 : hour,
				dateOnly ? 0 : minute
			).getTime()
		);
	}
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" use:lockScroll>
	<button class="absolute inset-0 bg-black/40" use:scrim={0.4} aria-label={$t('common.close')} onclick={oncancel}
	></button>

	<div
		class="safe-bottom-gap relative w-full max-w-sm rounded-t-2xl border border-line bg-surface p-4 shadow-xl sm:m-4 sm:rounded-2xl"
	>
		<h2 class="mb-3 text-lg font-bold">{title}</h2>

		<header class="mb-2 flex items-center justify-between">
			<button
				class="rounded-lg p-1 text-muted"
				aria-label={$t('sessions.prevMonth')}
				onclick={() => stepMonth(-1)}
			>
				<Icon name="back" size={20} />
			</button>
			<span class="text-sm font-semibold">{monthTitle}</span>
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

			{#each grid as cell (cell.at)}
				<button
					class="press flex aspect-square items-center justify-center rounded-lg text-sm
						{cell.inMonth ? '' : 'opacity-30'}
						{day === cell.at ? 'bg-brand font-bold text-brand-ink' : ''}
						{cell.at === today && day !== cell.at ? 'ring-1 ring-brand' : ''}"
					onclick={() => pick(cell.at)}
				>
					<span class="tabular leading-none">{new Date(cell.at).getDate()}</span>
				</button>
			{/each}
		</div>

		<!-- The clock follows the one chosen in the settings, so nobody reads 19:00 as seven in the morning. -->
		{#if !dateOnly}
			<div class="mt-3 flex items-end gap-2 border-t border-line pt-3">
				<div class="flex-1">
					<WheelPicker
						values={$use24Hour ? HOURS_24 : HOURS_12}
						value={$use24Hour ? hour : hour12}
						label={$t('common.hour')}
						item={36}
						format={(v) => ($use24Hour ? pad(v) : String(v))}
						onchange={(v) => (hour = $use24Hour ? v : (v % 12) + (isPm ? 12 : 0))}
					/>
				</div>
				<span class="pb-9 text-lg font-bold text-muted">:</span>
				<div class="flex-1">
					<WheelPicker
						values={MINUTES}
						value={minute}
						label={$t('common.minute')}
						item={36}
						format={pad}
						onchange={(v) => (minute = v)}
					/>
				</div>
				{#if !$use24Hour}
					<div class="flex-1">
						<WheelPicker
							values={['am', 'pm']}
							value={isPm ? 'pm' : 'am'}
							label={$t('common.dayPeriod')}
							item={36}
							format={dayPeriod}
							onchange={(part) => (hour = (hour % 12) + (part === 'pm' ? 12 : 0))}
						/>
					</div>
				{/if}
			</div>
		{/if}

		<div class="mt-4 flex gap-2">
			<button
				class="press flex-1 rounded-lg border border-line py-2.5 text-sm font-medium"
				onclick={oncancel}
			>
				{$t('common.cancel')}
			</button>
			<button
				class="press flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
				onclick={confirm}
			>
				{confirmLabel ?? $t('common.save')}
			</button>
		</div>
	</div>
</div>
