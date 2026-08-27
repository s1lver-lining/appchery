<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp, withOrigin } from '$lib/nav';
	import { formatSince } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import PageSkeleton from '$lib/ui/PageSkeleton.svelte';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import { loadCompetition, loadTournaments, TOURNAMENT_LIST } from '$lib/ianseo/client';
	import { IANSEO, IanseoError } from '$lib/ianseo/fetch';
	import { fileLink } from '$lib/competitions/links';
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
	import EntryCard from '$lib/ui/ianseo/EntryCard.svelte';
	import PageTools from '$lib/ui/ianseo/PageTools.svelte';
	import ShareSheet from '$lib/ui/ianseo/ShareSheet.svelte';
	import { terms } from '$lib/ianseo/find';
	import { loadEntries } from '$lib/inscriptarc/client';
	import { entryFor } from '$lib/inscriptarc/match';
	import type { Entry } from '$lib/inscriptarc/types';

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
	let problem = $state<'offline' | 'unreadable' | null>(null);
	let loading = $state(true);
	let failed = $state<'offline' | 'unreadable' | null>(null);
	let pinned = $state<Favourite[]>([]);
	/** The entry form, where one can be matched to this competition beyond doubt. */
	let entry = $state<Entry | null>(null);

	const id = $derived(favouriteId('competition', toId));
	const followed = $derived(pinned.some((one) => one.id === id));
	const people = $derived(pinned.filter((one) => one.toId === toId && one.kind !== 'competition'));

	/** Which competition the screen is asking about, so a slow read of one never lands on another. */
	let request = 0;

	$effect(() => {
		void open(toId);
	});

	async function open(id: string) {
		if (!id) return;
		const mine = ++request;
		competition = null;
		tournament = null;

		const known = await favourites();
		// The list is only read from what is already on the device: this page must not wait on it.
		const list = await readCache<Tournament[]>(TOURNAMENT_LIST);
		if (mine !== request) return;

		pinned = known;
		tournament = list?.value.find((row) => row.toId === id) ?? null;
		await read(false, mine);
		await findEntry(mine);
	}

	async function read(refresh: boolean, mine = ++request) {
		loading = true;
		failed = null;
		try {
			const loaded = await loadCompetition(toId, { refresh });
			if (mine !== request) return;
			competition = loaded.value;
			cachedAt = loaded.cachedAt;
			problem = loaded.problem;
			await seen();
		} catch (error) {
			if (mine !== request) return;
			failed = error instanceof IanseoError && error.kind === 'unreadable' ? 'unreadable' : 'offline';
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

	/**
	 * Whether this competition can be entered online. Only ever asked about a French one, because the
	 * platform that takes the entries is French, and only for one that has not been shot yet.
	 */
	async function findEntry(mine: number) {
		entry = null;
		const here = tournament;
		if (!here || here.country?.code !== 'FRA') return;
		if ((here.to ?? here.from ?? 0) < Date.now() - 86400_000) return;

		const entries = await loadEntries();
		if (mine !== request) return;
		entry = entryFor({ name: here.name, town: here.city, from: here.from, to: here.to }, entries);
	}

	let search = $state('');
	let shareSheet = $state(false);

	/**
	 * Where this competition lives for everybody else. The app's own address rather than ianseo's, so
	 * whoever scans it lands on this page: in Appchery if they have it, in the web app if they do not.
	 */
	const SITE = 'https://app.appchery.com';
	const shareUrl = $derived(`${SITE}/ianseo/${toId}`);

	/**
	 * A big competition publishes a document per class per round, which runs to ninety of them. The
	 * search is over what they are called, which is the class and the bow the archer came looking for.
	 */
	const documents = $derived.by(() => {
		const wanted = terms(search);
		if (wanted.length === 0) return competition?.documents ?? [];
		return (competition?.documents ?? []).filter((document) => {
			const text = `${document.title} ${document.group}`
				.toLowerCase()
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '');
			return wanted.every((term) => text.includes(term));
		});
	});

	/** The panels in the order ianseo publishes them, which is the order a competition is shot in. */
	const groups = $derived.by(() => {
		const found = new Map<string, Competition['documents']>();
		for (const document of documents) {
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
		<div class="flex items-center gap-1.5">
		<button
			class="rounded-lg border border-line bg-surface p-2 text-muted"
			aria-label={$t('ianseo.share')}
			onclick={() => (shareSheet = true)}
		>
			<Icon name="qr" size={18} />
		</button>
		<button
			class="press rounded-lg border p-2 {followed
				? 'border-brand/40 bg-brand/10 text-brand-text'
				: 'border-line bg-surface text-muted'}"
			aria-label={followed ? $t('ianseo.unfollowCompetition') : $t('ianseo.followCompetition')}
			aria-pressed={followed}
			onclick={toggle}
		>
			<Icon name="star" size={18} filled={followed} />
		</button>
		</div>
	{/snippet}
</PageHeader>

<!--
	Nothing has been read yet, so the page is drawn in outline rather than as an empty one that fills
	itself in a moment later. This is the wait the rest of the app already shows.
-->
{#if loading && !competition && !failed}
	<PageSkeleton title={false} cards={4} />
{:else}
<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<ReadNote {loading} {problem} {cachedAt} banner />

	{#if competition?.organiser}
		<p class="px-1 text-sm text-muted">{competition.organiser}</p>
	{/if}

	{#if entry}
		<EntryCard {entry} />
	{/if}

	<!-- Only where there is enough to search: three documents are read rather than looked through. -->
	{#if (competition?.documents.length ?? 0) > 6}
		<PageTools
			bind:value={search}
			placeholder={$t('ianseo.findDocument')}
			count={search.trim() ? $t('ianseo.foundDocuments', { n: documents.length }) : ''}
		/>
	{/if}

	{#if people.length > 0}
		<section class="rounded-2xl border border-line bg-surface p-3">
			<h2 class="text-[11px] font-semibold tracking-wider text-muted uppercase">
				{$t('ianseo.peopleHere')}
			</h2>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each people as one (one.id)}
					<button
						class="press flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-brand-text"
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
			title={$t(failed === 'unreadable' ? 'ianseo.unreadableTitle' : 'ianseo.errorTitle')}
			body={$t(failed === 'unreadable' ? 'ianseo.unreadableBody' : 'ianseo.errorBody')}
			action={{ label: $t('ianseo.retry'), onclick: () => read(true) }}
		/>
	{:else if groups.length === 0 && search.trim()}
		<EmptyState title={$t('ianseo.noDocumentFound')} body={$t('ianseo.noDocumentFoundBody')} />
	{:else if groups.length === 0 && !loading}
		<EmptyState title={$t('ianseo.noDocumentsTitle')} body={$t('ianseo.noDocumentsBody')} />
	{/if}

	{#each groups as { group, documents } (group)}
		<section>
			<h2 class="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
				{group || $t('ianseo.documents')}
			</h2>
			<ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
				<!--
					A document published as a PDF and nothing else opens the PDF: the mandate is the one an
					archer wants before the competition rather than after it, so it is not left off the page.
				-->
				{#each documents as document (document.path ?? document.pdfPath)}
					{@const inApp = document.path
						? withOrigin(`/ianseo/${toId}/${nameOf(document.path)}`, $page.url.pathname)
						: null}
					<li class="relative flex items-center gap-2">
						<a
							class="min-w-0 flex-1 p-3"
							href={inApp ?? fileLink(document.pdfPath, IANSEO)}
							target={inApp ? null : '_blank'}
							rel={inApp ? null : 'noreferrer'}
						>
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
								class="press relative mr-2 shrink-0 rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-muted"
								href={fileLink(document.pdfPath, IANSEO)}
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

	<ReadNote {loading} {problem} {cachedAt}>
		<button
			class="press rounded-lg border border-line px-2 py-1 font-medium disabled:opacity-50"
			disabled={loading}
			onclick={() => read(true)}
		>
			{$t('ianseo.refresh')}
		</button>
	</ReadNote>
</div>
{/if}

<ShareSheet
	open={shareSheet}
	title={competition?.name || tournament?.name || $t('ianseo.title')}
	url={shareUrl}
	onclose={() => (shareSheet = false)}
/>
