<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { BOW_TYPES, type BowType } from '$lib/domain/tuning/templates';
	import { listBows, createBow, type BowRow } from '$lib/db/repository';
	import { defaultBowId } from '$lib/prefs';
	import { withOrigin } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';

	let bows = $state<BowRow[]>([]);
	// Opened straight into the form when the archer came here to add a bow rather than to read one.
	let adding = $state($page.url.searchParams.has('add'));
	let name = $state('');
	let type = $state<BowType>('recurve');

	async function refresh() {
		bows = await listBows();
	}
	$effect(() => {
		refresh();
	});

	async function add() {
		if (!name.trim()) return;
		const first = bows.length === 0;
		const id = await createBow(name.trim(), type);
		// With a single bow there is nothing to choose between, so preselecting it saves a step.
		if (first) defaultBowId.set(id);
		name = '';
		adding = false;
		goto(`/equipment/${id}`);
	}
</script>

<div class="flex min-h-full flex-col">
<PageHeader motif="equipment" title={$t('equipment.title')}>
	{#snippet actions()}
		<MoreMenu
			label={$t('common.more')}
			icon="dots"
			placement="down"
			wrapperClass=""
			triggerClass="flex items-center justify-center rounded-lg p-1.5 text-muted"
			items={[{ label: $t('help.title'), icon: 'help', onselect: () => goto('/help/equipment') }]}
		/>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
	{#if adding}
		<section class="space-y-3 rounded-xl border border-line bg-surface p-4">
			<label class="block text-sm font-semibold">
				{$t('equipment.bowName')}
				<input
					class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
					bind:value={name}
				/>
			</label>
			<label class="block text-sm font-semibold">
				{$t('equipment.bowType')}
				<select
					class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
					bind:value={type}
				>
					{#each BOW_TYPES as option (option)}
						<option value={option}>{$t(`bow.${option}`)}</option>
					{/each}
				</select>
			</label>
			<button class="w-full rounded-lg bg-brand py-2 font-semibold text-brand-ink" onclick={add}>
				{$t('common.save')}
			</button>
		</section>
	{/if}

	{#if bows.length === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('equipment.empty')}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each bows as bow (bow.id)}
				<li>
					<a
						href={withOrigin(`/equipment/${bow.id}`, '/equipment')}
						class="flex items-center gap-3 rounded-xl border bg-surface p-3
							{$defaultBowId === bow.id ? 'border-brand ring-1 ring-brand' : 'border-line'}"
					>
						<span class="flex h-14 w-14 items-center justify-center rounded-lg bg-sunk text-muted">
							<Icon name="bow" size={26} />
						</span>
						<div class="flex-1">
							<p class="font-semibold">{bow.name}</p>
							<p class="text-sm text-muted">
								{$t(`bow.${bow.type}`)}
								{#if $defaultBowId === bow.id}· <span class="text-brand-text">{$t('equipment.default')}</span>{/if}
							</p>
						</div>
						<span class="text-muted">›</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- Sticky rather than fixed, so it sits under the list yet never scrolls out of reach. -->
<div class="sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<button
		class="mx-auto flex w-full max-w-2xl items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink"
		onclick={() => (adding = !adding)}
	>
		<Icon name="plus" size={20} />
		{adding ? $t('common.cancel') : $t('equipment.addBow')}
	</button>
</div>
</div>
