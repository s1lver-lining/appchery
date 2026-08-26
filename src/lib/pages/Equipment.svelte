<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { listMs } from '$lib/ui/motion';
	import { dataVersion } from '$lib/db/changed';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { BOW_TYPES, type BowType } from '$lib/domain/tuning/templates';
	import { listBows, createBow, updateSession, type BowRow } from '$lib/db/repository';
	import { defaultBowId } from '$lib/prefs';
	import { withOrigin } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import { BOW_ICONS } from '$lib/ui/bowIcon';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Bow from './Bow.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';

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
	 * Whether this bow becomes the one every new session starts on, and the one the tab opens. Off
	 * unless it is the first bow, and the answer follows the list until the archer says otherwise:
	 * the form can be opened by a link before the bows have been read.
	 */
	let defaultChosen = $state(false);
	let defaultAsked = $state(false);
	const makeDefault = $derived(defaultAsked ? defaultChosen : bows.length === 0);

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
		defaultAsked = false;
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
		void $dataVersion;
		refresh();
	});

	/** The outing that sent the archer here to make a bow, and is waiting to be shot with it. */
	const forSession = $derived($page.url.searchParams.get('session'));

	async function add() {
		if (!name.trim()) {
			nameMissing = true;
			return;
		}
		const id = await createBow(name.trim(), type);
		if (makeDefault) defaultBowId.set(id);
		name = '';
		adding = false;
		// A bow made for one outing is that outing's bow, whether or not it is the default one.
		if (forSession) {
			await updateSession(forSession, { bowId: id, bowType: null });
			goto(`/sessions/${forSession}`);
			return;
		}
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
				<li animate:flip={{ duration: listMs() }} transition:fade={{ duration: listMs() }}>
					<a
						href={withOrigin(`/equipment/${bow.id}`, '/equipment?list=1')}
						class="press flex items-center gap-3 rounded-xl border bg-surface p-3
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
<div class="overbar sticky bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
	<button
		class="press mx-auto flex w-full max-w-2xl items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 font-semibold text-brand-ink"
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
		<!-- Shown rather than listed: a bow is recognised by its shape long before its name is read. -->
		<div>
			<span class="block text-sm font-semibold">{$t('equipment.bowType')}</span>
			<div class="mt-1 grid grid-cols-4 gap-2">
				{#each BOW_TYPES as option (option)}
					<button
						class="press flex flex-col items-center gap-1 rounded-lg border p-1.5
							{type === option ? 'border-brand bg-brand/10 text-brand-text' : 'border-line text-muted'}"
						aria-pressed={type === option}
						onclick={() => pickType(option)}
					>
						<Icon name={BOW_ICONS[option]} size={30} />
						<span class="block w-full truncate text-[10px] text-muted">{$t(`bow.${option}`)}</span>
					</button>
				{/each}
			</div>
		</div>
		<div class="flex items-start justify-between gap-4 pt-1">
			<div class="flex-1">
				<p class="text-sm font-semibold">{$t('equipment.makeDefault')}</p>
				<p class="mt-0.5 text-xs text-muted">{$t('equipment.makeDefaultHint')}</p>
			</div>
			<Toggle
				checked={makeDefault}
				label={$t('equipment.makeDefault')}
				onchange={(v) => {
					defaultChosen = v;
					defaultAsked = true;
				}}
			/>
		</div>
	</div>

	{#snippet footer()}
		<button
			class="press flex-1 rounded-lg border border-line py-2 text-sm font-medium"
			onclick={closeAdd}
		>
			{$t('common.cancel')}
		</button>
		<button
			class="press flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
			onclick={add}
		>
			{$t('common.save')}
		</button>
	{/snippet}
</Sheet>
{/if}
