<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { BOW_TYPES, type BowType } from '$lib/domain/tuning/templates';
	import { listBows, createBow, type BowRow } from '$lib/db/repository';
	import { defaultBowId } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';

	let bows = $state<BowRow[]>([]);
	let adding = $state(false);
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
		const id = await createBow(name.trim(), type);
		name = '';
		adding = false;
		goto(`/equipment/${id}`);
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4 pt-6">
	<header class="mt-2 flex items-center justify-between">
		<h1 class="text-2xl font-bold tracking-tight">{$t('equipment.title')}</h1>
		<button
			class="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
			onclick={() => (adding = !adding)}
		>
			<Icon name="plus" size={18} />
			{adding ? $t('common.cancel') : $t('equipment.addBow')}
		</button>
	</header>

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
						href="/equipment/{bow.id}"
						class="flex items-center gap-3 rounded-xl border bg-surface p-3
							{$defaultBowId === bow.id ? 'border-brand ring-1 ring-brand' : 'border-line'}"
					>
						{#if bow.photo}
							<img src={bow.photo} alt="" class="h-14 w-14 rounded-lg object-cover" />
						{:else}
							<span
								class="flex h-14 w-14 items-center justify-center rounded-lg bg-sunk text-muted"
							>
								<Icon name="bow" size={26} />
							</span>
						{/if}
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
