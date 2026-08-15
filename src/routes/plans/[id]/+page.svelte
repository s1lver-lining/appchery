<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		getPlan,
		listPlanSlots,
		createPlanSlot,
		updatePlanSlot,
		deletePlanSlot,
		renamePlan,
		updatePlan,
		deletePlan,
		type PlanRow,
		type PlanSlotRow
	} from '$lib/db/repository';
	import { weekArrowGoal } from '$lib/domain/plans';
	import { monthGrid, startOfDay } from '$lib/domain/dates';
	import { dateFormats } from '$lib/prefs';
	import { setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';
	import DateTimeDialog from '$lib/ui/DateTimeDialog.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';
	import { closeOnBack } from '$lib/ui/dismiss.svelte';
	import { scrim } from '$lib/ui/statusBar';
	import { lockScroll } from '$lib/ui/scrollLock';

	const planId = $derived($page.params.id as string);
	$effect(() => setPageUp('/plans'));

	let plan = $state<PlanRow | null>(null);
	let slots = $state<PlanSlotRow[]>([]);
	let confirmingDelete = $state(false);

	async function refresh() {
		plan = await getPlan(planId);
		slots = await listPlanSlots(planId);
	}
	$effect(() => {
		refresh();
	});

	/** Weekday names in the app's language, Monday first, taken from a week the grid already knows. */
	const weekdays = $derived(
		monthGrid(2024, 0)
			.slice(0, 7)
			.map((day) => $dateFormats.weekdayShort(day.at).replace(/\.$/, ''))
	);

	const byDay = $derived((weekday: number) => slots.filter((slot) => slot.weekday === weekday));
	const weekTotal = $derived(weekArrowGoal(slots, plan ? [plan] : []));

	/** Put aside rather than deleted: the week stops being asked for, and nothing already shot moves. */
	async function setActive(on: boolean) {
		await updatePlan(planId, { isActive: on ? 1 : 0 });
		await refresh();
	}

	/* The season the plan runs for. Either end can be left out, and either can be given back. */
	let picking = $state<'startDate' | 'endDate' | null>(null);

	/** The end date opens on the start rather than on today, since a season is picked in order. */
	const pickingFrom = $derived(
		picking === 'endDate'
			? (plan?.endDate ?? plan?.startDate ?? Date.now())
			: (plan?.startDate ?? Date.now())
	);

	async function setDate(field: 'startDate' | 'endDate', at: number | null) {
		picking = null;
		await updatePlan(planId, { [field]: at === null ? null : startOfDay(at) });
		await refresh();
	}

	async function setFreeArrows(raw: string) {
		const value = Number(raw);
		// An empty field is no free arrows at all, which is not the same as a goal of zero.
		await updatePlan(planId, { freeArrows: raw.trim() && value > 0 ? Math.round(value) : null });
		await refresh();
	}

	/* The slot sheet, used for both a new slot and an existing one. */
	let editing = $state<PlanSlotRow | null>(null);
	let creatingOn = $state<number | null>(null);
	let draftDay = $state(0);
	let draftMinute = $state(18 * 60);
	let draftGoal = $state<number | null>(null);
	let draftLabel = $state('');

	const MINUTES = Array.from({ length: 48 }, (_, i) => i * 30);
	const clock = (minuteOfDay: number) =>
		$dateFormats.time(new Date(2024, 0, 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60).getTime());

	function openNew(weekday: number) {
		creatingOn = weekday;
		editing = null;
		draftDay = weekday;
		draftMinute = 18 * 60;
		draftGoal = null;
		draftLabel = '';
	}

	function openSlot(slot: PlanSlotRow) {
		editing = slot;
		creatingOn = null;
		draftDay = slot.weekday;
		draftMinute = slot.minuteOfDay;
		draftGoal = slot.arrowGoal;
		draftLabel = slot.label ?? '';
	}

	function closeSheet() {
		editing = null;
		creatingOn = null;
	}

	closeOnBack(() => editing !== null || creatingOn !== null, closeSheet);

	async function saveSlot() {
		const goal = Number(draftGoal);
		const patch = {
			weekday: draftDay,
			minuteOfDay: draftMinute,
			// An empty field is no goal at all, which is not the same as a goal of zero arrows.
			arrowGoal: Number.isFinite(goal) && goal > 0 ? goal : null,
			label: draftLabel.trim() || null
		};
		if (editing) await updatePlanSlot(editing.id, patch);
		else await createPlanSlot({ planId, ...patch });
		closeSheet();
		await refresh();
	}

	async function removeSlot() {
		if (!editing) return;
		await deletePlanSlot(editing.id);
		closeSheet();
		await refresh();
	}

	async function remove() {
		await deletePlan(planId);
		goto('/plans');
	}
</script>

{#if plan}
	<PageHeader motif="sessions">
		{#snippet lead()}
			<!-- Narrowed again: the check outside does not reach inside a snippet. -->
			{@const name = plan?.name ?? ''}
			<div class="flex items-center gap-2">
				<a href="/plans" class="-ml-1 text-muted" aria-label={$t('common.back')}>
					<Icon name="back" size={22} />
				</a>
				<input
					class="min-w-0 flex-1 rounded-lg bg-transparent text-2xl font-bold tracking-tight text-ink"
					aria-label={$t('plans.name')}
					value={name}
					onchange={(e) => renamePlan(planId, e.currentTarget.value.trim() || $t('plans.newPlan'))}
				/>
			</div>
		{/snippet}
	</PageHeader>

	<div class="mx-auto w-full max-w-2xl space-y-3 p-4">
		<!-- First, because a plan that is off asks nothing of the week and every figure below it is
			then a description of a plan rather than of what is expected. -->
		<section class="rounded-xl border border-line bg-surface p-3.5">
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0">
					<p class="font-medium">{$t('plans.activeTitle')}</p>
					<p class="text-xs text-muted">{$t('plans.activeHint')}</p>
				</div>
				<Toggle
					checked={plan.isActive !== 0}
					label={$t('plans.activeTitle')}
					onchange={setActive}
				/>
			</div>

			<!-- The season it runs for. Outside it the plan is silent, which is a pause it keeps itself. -->
			<div class="mt-3 border-t border-line pt-3">
				<p class="text-xs text-muted">{$t('plans.datesHint')}</p>
				<div class="mt-2 grid grid-cols-2 gap-2">
					{#each [{ field: 'startDate', label: $t('plans.startDate'), at: plan.startDate }, { field: 'endDate', label: $t('plans.endDate'), at: plan.endDate }] as entry (entry.field)}
						<div>
							<span class="block text-xs text-muted">{entry.label}</span>
							<div class="mt-1 flex items-center gap-1">
								<button
									class="flex-1 rounded-lg border border-line bg-bg p-2 text-left text-sm
										{entry.at === null ? 'text-muted' : 'text-ink'}"
									onclick={() => (picking = entry.field as 'startDate' | 'endDate')}
								>
									{entry.at === null ? $t('plans.anyDate') : $dateFormats.date(entry.at)}
								</button>
								{#if entry.at !== null}
									<button
										class="rounded-lg p-1.5 text-muted"
										aria-label={$t('plans.clearDate')}
										onclick={() => setDate(entry.field as 'startDate' | 'endDate', null)}
									>
										<Icon name="close" size={16} />
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- What the week asks for, which is the number that says whether the plan is realistic. -->
		<section class="rounded-xl border border-line bg-surface p-3.5">
			<div class="flex items-baseline justify-between">
				<div>
					<p class="tabular text-3xl leading-none font-bold text-brand-text">{weekTotal}</p>
					<p class="mt-1 text-xs text-muted">{$t('plans.weekTotal')}</p>
				</div>
				<p class="text-xs text-muted">{$t('plans.sessionsCount', { n: slots.length })}</p>
			</div>

			<!-- Arrows owed by the week rather than by an outing: warm ups, form work, a bale session. -->
			<label class="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
				<span class="min-w-0">
					<span class="block font-medium">{$t('plans.freeArrows')}</span>
					<span class="block text-xs text-muted">{$t('plans.freeArrowsHint')}</span>
				</span>
				<input
					type="number"
					inputmode="numeric"
					min="0"
					class="tabular w-24 shrink-0 rounded-lg border border-line bg-bg p-2 text-right text-ink"
					value={plan.freeArrows ?? ''}
					onchange={(e) => setFreeArrows(e.currentTarget.value)}
				/>
			</label>
		</section>

		<!-- The week as it repeats: one column a day, so a heavy Thursday is visible without reading. -->
		<div class="grid grid-cols-7 gap-1">
			{#each weekdays as name, day (day)}
				<div class="flex flex-col gap-1">
					<span class="text-center text-[11px] font-semibold text-muted">{name}</span>

					{#each byDay(day) as slot (slot.id)}
						<button
							class="rounded-lg border border-line bg-surface px-1 py-1.5 text-center"
							onclick={() => openSlot(slot)}
						>
							<span class="tabular block text-[11px] leading-tight font-semibold">
								{clock(slot.minuteOfDay)}
							</span>
							{#if slot.arrowGoal}
								<span class="tabular block text-[11px] leading-tight text-muted">
									{slot.arrowGoal}
								</span>
							{/if}
							{#if slot.label}
								<span class="block truncate text-[10px] leading-tight text-muted">{slot.label}</span>
							{/if}
						</button>
					{/each}

					<button
						class="rounded-lg border border-dashed border-line py-1.5 text-muted"
						aria-label={$t('plans.addSlot')}
						onclick={() => openNew(day)}
					>
						<span class="flex justify-center"><Icon name="plus" size={14} /></span>
					</button>
				</div>
			{/each}
		</div>

		<button class="flex items-center gap-1.5 text-sm text-danger" onclick={() => (confirmingDelete = true)}>
			<Icon name="trash" size={16} />
			{$t('plans.deletePlan')}
		</button>
	</div>

	{#if editing || creatingOn !== null}
		<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" use:lockScroll>
			<button class="absolute inset-0 bg-black/40" use:scrim={0.4} aria-label={$t('common.close')} onclick={closeSheet}
			></button>

			<div class="relative m-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl">
				<h2 class="mb-3 text-lg font-bold">{$t('plans.slotTitle')}</h2>

				<!-- The day lives here rather than in a drag: moving a session is picking another day. -->
				<div class="mb-3 flex gap-1">
					{#each weekdays as name, day (day)}
						<button
							class="flex-1 rounded-lg border py-1.5 text-xs font-medium
								{draftDay === day ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
							onclick={() => (draftDay = day)}
						>
							{name}
						</button>
					{/each}
				</div>

				<div class="grid grid-cols-2 gap-3">
					<WheelPicker
						values={MINUTES}
						value={draftMinute}
						label={$t('session.time')}
						item={36}
						format={(v) => clock(v)}
						onchange={(v) => (draftMinute = v)}
					/>
					<label class="text-sm">
						<span class="text-muted">{$t('session.goalTitle')}</span>
						<span class="text-xs text-muted">({$t('common.optional')})</span>
						<input
							type="number"
							inputmode="numeric"
							min="0"
							class="tabular mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
							bind:value={draftGoal}
						/>
					</label>
				</div>

				<label class="mt-3 block text-sm">
					{$t('plans.slotName')} <span class="text-muted">({$t('common.optional')})</span>
					<input
						class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
						bind:value={draftLabel}
					/>
				</label>

				<div class="mt-4 flex gap-2">
					{#if editing}
						<button
							class="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium text-danger"
							onclick={removeSlot}
						>
							{$t('common.delete')}
						</button>
					{/if}
					<button
						class="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
						onclick={saveSlot}
					>
						{$t('common.save')}
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if picking}
		<DateTimeDialog
			title={$t(picking === 'startDate' ? 'plans.startDate' : 'plans.endDate')}
			value={pickingFrom}
			dateOnly
			onconfirm={(at) => setDate(picking!, at)}
			oncancel={() => (picking = null)}
		/>
	{/if}

	{#if confirmingDelete}
		<ConfirmDialog
			title={$t('plans.confirmTitle')}
			message={$t('plans.confirmBody')}
			onconfirm={remove}
			oncancel={() => (confirmingDelete = false)}
		/>
	{/if}
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}
