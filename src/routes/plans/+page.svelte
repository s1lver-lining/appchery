<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { listPlans, listPlanSlots, createPlan, type PlanRow } from '$lib/db/repository';
	import { weekArrowGoal } from '$lib/domain/plans';
	import { originOf, setPageUp } from '$lib/nav';
	import { page } from '$app/stores';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	// Reached from the sessions list and from the settings page, so back goes where the link came from.
	const origin = $derived(originOf($page.url, '/sessions'));
	$effect(() => setPageUp(origin));

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
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-2 p-4">
	{#if plans.length === 0}
		<EmptyState
			title={$t('empty.plans.title')}
			body={$t('empty.plans.body')}
			action={{ label: $t('plans.newPlan'), onclick: add }}
		>
			{#snippet sample()}
				<!-- A plan as the list draws it: what it is called, and what its week asks for. -->
				<div class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
					<div class="min-w-0">
						<p class="truncate font-semibold">{$t('plans.newPlan')}</p>
						<p class="text-xs text-muted">{$t('plans.sessionsCount', { n: 3 })}</p>
					</div>
					<div class="shrink-0 text-right">
						<p class="tabular text-lg leading-none font-bold">230</p>
						<p class="text-[10px] tracking-wide text-muted uppercase">{$t('sessions.arrows')}</p>
					</div>
				</div>
			{/snippet}
		</EmptyState>
	{:else}
		{#each plans as plan (plan.id)}
			{@const list = slotsOf(plan.id)}
			{@const total = weekArrowGoal(list, [plan])}
			<!-- A plan put aside stays in the list, greyed: it is kept to be turned back on. -->
			<a
				href="/plans/{plan.id}"
				class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3
					{plan.isActive === 0 ? 'opacity-60' : ''}"
			>
				<div class="min-w-0">
					<p class="truncate font-semibold {plan.isActive === 0 ? 'text-muted' : ''}">{plan.name}</p>
					<p class="text-xs text-muted">
						{$t('plans.sessionsCount', { n: list.length })}
						{#if plan.isActive === 0}· {$t('plans.paused')}{/if}
					</p>
				</div>
				{#if total > 0}
					<div class="shrink-0 text-right">
						<p class="tabular text-lg leading-none font-bold">{total}</p>
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
