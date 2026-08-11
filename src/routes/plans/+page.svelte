<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { listPlans, listPlanSlots, createPlan, type PlanRow } from '$lib/db/repository';
	import { weekArrowGoal } from '$lib/domain/plans';
	import { setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	// Reached from the sessions list, which is where the back key belongs.
	$effect(() => setPageUp('/sessions'));

	let plans = $state<PlanRow[]>([]);
	let slots = $state<Awaited<ReturnType<typeof listPlanSlots>>>([]);

	async function refresh() {
		plans = await listPlans();
		slots = await listPlanSlots();
	}
	$effect(() => {
		refresh();
	});

	const slotsOf = (planId: string) => slots.filter((slot) => slot.planId === planId);

	async function add() {
		goto(`/plans/${await createPlan($t('plans.newPlan'))}`);
	}
</script>

<PageHeader motif="sessions" title={$t('plans.title')}>
	{#snippet lead()}
		<a href="/sessions" class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-2 p-4">
	{#if plans.length === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('plans.empty')}
		</p>
	{:else}
		{#each plans as plan (plan.id)}
			{@const list = slotsOf(plan.id)}
			<a
				href="/plans/{plan.id}"
				class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
			>
				<div class="min-w-0">
					<p class="truncate font-semibold">{plan.name}</p>
					<p class="text-xs text-muted">{$t('plans.sessionsCount', { n: list.length })}</p>
				</div>
				{#if weekArrowGoal(list) > 0}
					<div class="shrink-0 text-right">
						<p class="tabular text-lg leading-none font-bold">{weekArrowGoal(list)}</p>
						<p class="text-[10px] tracking-wide text-muted uppercase">{$t('sessions.arrows')}</p>
					</div>
				{/if}
			</a>
		{/each}
	{/if}
</div>

<div class="sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<button
		class="mx-auto flex w-full max-w-2xl items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink"
		onclick={add}
	>
		<Icon name="plus" size={20} />
		{$t('plans.newPlan')}
	</button>
</div>
