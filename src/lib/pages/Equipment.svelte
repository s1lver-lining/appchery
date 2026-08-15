<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { BOW_TYPES, type BowType } from '$lib/domain/tuning/templates';
	import { listBows, createBow, type BowRow } from '$lib/db/repository';
	import { defaultBowId } from '$lib/prefs';
	import { withOrigin } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Bow from './Bow.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';

	/**
	 * With a default bow set, the equipment slot of the pager is that bow rather than a list of one
	 * thing to tap through. The list is a detour, asked for by a long press on the tab or by a menu,
	 * and it lasts as long as the archer stays on it: leaving the tab and coming back shows the bow
	 * again, because the tab means the bow.
	 */
	// Asking to add a bow is asking for the list: the form lives on it, not on a bow.
	const listed = $derived(
		$page.url.searchParams.has('list') || $page.url.searchParams.has('add')
	);

	let bows = $state<BowRow[]>([]);
	let loaded = $state(false);
	// Opened straight into the form when the archer came here to add a bow rather than to read one.
	let adding = $state(false);
	// Watched rather than read once: the page is already mounted in the pager when the link is used.
	// Answered once per asking, or closing the form would only bring it back while the link stands.
	let addAsked = false;
	$effect(() => {
		if (!$page.url.searchParams.has('add')) {
			addAsked = false;
			return;
		}
		if (addAsked) return;
		addAsked = true;
		openAdd();
	});
	let name = $state('');
	let type = $state<BowType>('recurve');
	// The type is the name most bows would be given, so it is written in until somebody writes better.
	let nameEdited = $state(false);
	let nameMissing = $state(false);

	/**
	 * Closing the form spends the link that asked for it, so a reload or a copied URL lands on the
	 * list rather than opening the form again.
	 */
	function closeAdd() {
		adding = false;
		if ($page.url.searchParams.has('add')) replaceState('/equipment?list=1', {});
	}

	function openAdd() {
		name = $t('bowName.recurve');
		type = 'recurve';
		nameEdited = false;
		nameMissing = false;
		adding = true;
	}

	function pickType(next: BowType) {
		type = next;
		if (!nameEdited) name = $t(`bowName.${next}`);
	}

	/**
	 * Nothing is drawn until the bows are read: with a default bow set the page is on its way to it,
	 * and the list appearing for a frame first reads as the app changing its mind.
	 */
	const settling = $derived(!loaded && !listed && $defaultBowId !== null);

	const openBow = $derived(
		!listed && $defaultBowId && bows.some((row) => row.id === $defaultBowId) ? $defaultBowId : null
	);

	async function refresh() {
		bows = await listBows();
		loaded = true;
	}
	$effect(() => {
		refresh();
	});

	async function add() {
		if (!name.trim()) {
			nameMissing = true;
			return;
		}
		const first = bows.length === 0;
		const id = await createBow(name.trim(), type);
		// With a single bow there is nothing to choose between, so preselecting it saves a step.
		if (first) defaultBowId.set(id);
		name = '';
		adding = false;
		goto(`/equipment/${id}`);
	}
</script>

{#if settling}
	<div class="min-h-full"></div>
{:else if openBow}
	<Bow bowId={openBow} />
{:else}
<div class="flex min-h-full flex-col">
<PageHeader motif="equipment" title={$t('equipment.title')}>
	{#snippet actions()}
		<MoreMenu
			label={$t('common.more')}
			icon="dots"
			placement="down"
			wrapperClass=""
			triggerClass="flex items-center justify-center rounded-lg p-1.5 text-muted"
			items={[{ label: $t('help.title'), icon: 'help', onselect: () => goto(withOrigin('/help/equipment', '/equipment?list=1')) }]}
		/>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
	{#if bows.length === 0}
		<EmptyState
			title={$t('empty.equipment.title')}
			body={$t('empty.equipment.body')}
			action={{ label: $t('equipment.addBow'), onclick: openAdd }}
		>
			{#snippet sample()}
				<!-- A bow as the list draws it: its name, its type, and what it has shot. -->
				<div class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
					<span class="flex h-10 w-10 items-center justify-center rounded-lg bg-sunk text-muted">
						<Icon name="bow" size={22} />
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate font-semibold">{$t('bowName.recurve')}</p>
						<p class="text-xs text-muted">1 240 {$t('sessions.arrows')}</p>
					</div>
				</div>
			{/snippet}
		</EmptyState>
	{:else}
		<ul class="space-y-2">
			{#each bows as bow (bow.id)}
				<li>
					<a
						href={withOrigin(`/equipment/${bow.id}`, '/equipment?list=1')}
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
		onclick={openAdd}
	>
		<Icon name="plus" size={20} />
		{$t('equipment.addBow')}
	</button>
</div>
</div>

<Sheet open={adding} title={$t('equipment.addBow')} onclose={closeAdd}>
	<div class="space-y-3">
		<label class="block text-sm font-semibold">
			{$t('equipment.bowName')}
			<input
				class="mt-1 w-full rounded-lg border bg-bg p-2 text-ink
					{nameMissing ? 'border-danger' : 'border-line'}"
				aria-invalid={nameMissing}
				value={name}
				oninput={(e) => {
					name = e.currentTarget.value;
					nameEdited = true;
					nameMissing = false;
				}}
			/>
		</label>
		{#if nameMissing}
			<p class="text-sm text-danger">{$t('equipment.nameRequired')}</p>
		{/if}
		<label class="block text-sm font-semibold">
			{$t('equipment.bowType')}
			<select
				class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
				value={type}
				onchange={(e) => pickType(e.currentTarget.value as BowType)}
			>
				{#each BOW_TYPES as option (option)}
					<option value={option}>{$t(`bow.${option}`)}</option>
				{/each}
			</select>
		</label>
	</div>

	{#snippet footer()}
		<button
			class="flex-1 rounded-lg border border-line py-2 text-sm font-medium"
			onclick={closeAdd}
		>
			{$t('common.cancel')}
		</button>
		<button
			class="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
			onclick={add}
		>
			{$t('common.save')}
		</button>
	{/snippet}
</Sheet>
{/if}
