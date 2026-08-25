<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp, withOrigin } from '$lib/nav';
	import { formatSince } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import { loadCompetition, loadTournaments, TOURNAMENT_LIST } from '$lib/ianseo/client';
	import { IANSEO } from '$lib/ianseo/fetch';
	import { readCache } from '$lib/ianseo/store';
	import {
		addFavourite,
		favouriteId,
		favourites,
		markCompetitionSeen,
		removeCompetition,
		removeFavourite,
		type Favourite
	} from '$lib/ianseo/store';
	import type { Competition, Tournament } from '$lib/ianseo/types';

	/**
	 * One competition: what ianseo has published for it, in the panels ianseo publishes it under.
	 * Nothing here interprets a document's name, which is the organiser's own words in their own
	 * language, so a federation the app has never heard of reads exactly as its archers expect.
	 */

	const toId = $derived($page.params.toId ?? '');
	const from = $derived(originOf($page.url, '/ianseo'));
	$effect(() => setPageUp(from));

	let competition = $state<Competition | null>(null);
	let tournament = $state<Tournament | null>(null);
	let cachedAt = $state<number | null>(null);
	let stale = $state(false);
	let loading = $state(true);
	let failed = $state(false);
	let pinned = $state<Favourite[]>([]);

	const id = $derived(favouriteId('competition', toId));
	const followed = $derived(pinned.some((one) => one.id === id));
	const people = $derived(pinned.filter((one) => one.toId === toId && one.kind !== 'competition'));

	$effect(() => {
		void open(toId);
	});

	async function open(id: string) {
		if (!id) return;
		competition = null;
		tournament = null;
		pinned = await favourites();
		// The list is only read from what is already on the device: this page must not wait on it.
		const list = await readCache<Tournament[]>(TOURNAMENT_LIST);
		tournament = list?.value.find((row) => row.toId === id) ?? null;
		await read(false);
	}

	async function read(refresh: boolean) {
		loading = true;
		failed = false;
		try {
			const loaded = await loadCompetition(toId, { refresh });
			competition = loaded.value;
			cachedAt = loaded.cachedAt;
			stale = loaded.stale;
			await seen();
		} catch {
			failed = true;
		}
		loading = false;
	}

	/** Opening the competition is reading it, so nothing already on screen is offered as new again. */
	async function seen() {
		if (!followed) return;
		await markCompetitionSeen(toId);
		pinned = await favourites();
	}

	async function toggle() {
		if (followed) await removeCompetition(toId);
		else {
			await addFavourite({
				id,
				kind: 'competition',
				toId,
				label: competition?.name || tournament?.name || toId,
				detail: tournament?.dates ?? null,
				// Followed now, so what ianseo has already published is not news: only the next thing is.
				publishedAt: tournament?.updatedAt ?? null
			});
		}
		pinned = await favourites();
	}

	/** The panels in the order ianseo publishes them, which is the order a competition is shot in. */
	const groups = $derived.by(() => {
		const found = new Map<string, Competition['documents']>();
		for (const document of competition?.documents ?? []) {
			found.set(document.group, [...(found.get(document.group) ?? []), document]);
		}
		return [...found].map(([group, documents]) => ({ group, documents }));
	});

	/** `/TourData/2026/26053/IQRM.php` is opened as `IQRM`: the rest of it is where, not what. */
	const nameOf = (path: string) => path.split('/').pop()?.replace(/\.php$/i, '') ?? path;
</script>

<PageHeader
	motif="ianseo"
	title={competition?.name || tournament?.name || $t('ianseo.title')}
	subtitle={[tournament?.dates, competition?.where || tournament?.city].filter(Boolean).join(' · ')}
>
	{#snippet lead()}
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
	{#snippet actions()}
		<button
			class="rounded-lg border p-2 {followed
				? 'border-brand/40 bg-brand/10 text-brand-text'
				: 'border-line bg-surface text-muted'}"
			aria-label={followed ? $t('ianseo.unfollowCompetition') : $t('ianseo.followCompetition')}
			aria-pressed={followed}
			onclick={toggle}
		>
			<Icon name="star" size={18} filled={followed} />
		</button>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<ReadNote {loading} {stale} {cachedAt} banner />

	{#if competition?.organiser}
		<p class="px-1 text-sm text-muted">{competition.organiser}</p>
	{/if}

	{#if people.length > 0}
		<section class="rounded-2xl border border-line bg-surface p-3">
			<h2 class="text-[11px] font-semibold tracking-wider text-muted uppercase">
				{$t('ianseo.peopleHere')}
			</h2>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each people as one (one.id)}
					<button
						class="flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-brand-text"
						aria-label={$t('ianseo.unfollowName', { name: one.label })}
						onclick={async () => {
							await removeFavourite(one.id);
							pinned = await favourites();
						}}
					>
						<span class="max-w-40 truncate">{one.label}</span>
						<Icon name="close" size={13} />
					</button>
				{/each}
			</div>
			<p class="mt-2 text-xs text-muted">{$t('ianseo.peopleHint')}</p>
		</section>
	{/if}

	{#if failed}
		<EmptyState
			title={$t('ianseo.errorTitle')}
			body={$t('ianseo.errorBody')}
			action={{ label: $t('ianseo.retry'), onclick: () => read(true) }}
		/>
	{:else if groups.length === 0 && !loading}
		<EmptyState title={$t('ianseo.noDocumentsTitle')} body={$t('ianseo.noDocumentsBody')} />
	{/if}

	{#each groups as { group, documents } (group)}
		<section>
			<h2 class="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
				{group || $t('ianseo.documents')}
			</h2>
			<ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
				{#each documents as document (document.path)}
					<li class="relative flex items-center gap-2">
						<a class="min-w-0 flex-1 p-3" href={withOrigin(`/ianseo/${toId}/${nameOf(document.path)}`, $page.url.pathname)}>
							<!-- The whole row opens the document; the PDF beside it is lifted over that link. -->
							<span class="absolute inset-0" aria-hidden="true"></span>
							<span class="block font-medium break-words">{document.title}</span>
							{#if document.updatedAt}
								<span class="mt-0.5 block text-xs text-muted">
									{$t('ianseo.updated', { when: $formatSince(document.updatedAt) })}
								</span>
							{/if}
						</a>
						{#if document.pdfPath}
							<a
								class="relative mr-2 shrink-0 rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-muted"
								href="{IANSEO}{document.pdfPath}"
								target="_blank"
								rel="noreferrer"
								aria-label={$t('ianseo.pdf')}
							>
								{$t('ianseo.pdf')}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<ReadNote {loading} {stale} {cachedAt}>
		<button
			class="rounded-lg border border-line px-2 py-1 font-medium disabled:opacity-50"
			disabled={loading}
			onclick={() => read(true)}
		>
			{$t('ianseo.refresh')}
		</button>
	</ReadNote>
</div>
