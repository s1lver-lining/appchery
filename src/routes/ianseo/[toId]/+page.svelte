<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { externalTarget, originOf, setPageUp, withOrigin } from '$lib/nav';
	import { formatSince } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import PageSkeleton from '$lib/ui/PageSkeleton.svelte';
	import PullToRefresh from '$lib/ui/PullToRefresh.svelte';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import {
		loadCompetition,
		loadResultDocument,
		loadTournaments,
		TOURNAMENT_LIST
	} from '$lib/ianseo/client';
	import { IANSEO, IanseoError } from '$lib/ianseo/fetch';
	import { fileLink, webLink } from '$lib/competitions/links';
	import { readCache } from '$lib/ianseo/store';
	import { competitionPath } from '$lib/ianseo/client';
	import { noteWhatIsFollowed } from '$lib/ianseo/notify';
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
	import { namesFound, terms } from '$lib/ianseo/find';
	import { groupKey } from '$lib/ianseo/groups';
	import { scheduleDocument } from '$lib/ianseo/schedule';
	import { newDocuments, notePublished, seenInCache, seenPublished } from '$lib/ianseo/published';
	import { lastPublished } from '$lib/ianseo/parse/details';
	import { loadEntries } from '$lib/inscriptarc/client';
	import { entryFor } from '$lib/inscriptarc/match';
	import type { Entry } from '$lib/inscriptarc/types';

	/**
	 * One competition: what ianseo has published for it, in the panels ianseo publishes it under.
	 * Nothing here interprets a document's name, which is the organiser's own words in their own
	 * language, so a federation the app has never heard of reads exactly as its archers expect. The
	 * panels they sit under are ianseo's own vocabulary rather than the organiser's, and those are
	 * translated: see `groups.ts`.
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
	/**
	 * What ianseo had published here when this device last opened the competition, read once on the
	 * way in and never again: the marks have to survive the visit that earned them, so noting what is
	 * here now must not clear what the archer is being shown while they are still looking at it.
	 */
	let seen = $state<number | null>(null);

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
		// Read before the page is, or refreshing it would overwrite the copy being asked about.
		const kept = await readCache<Competition>(competitionPath(id));
		if (mine !== request) return;

		pinned = known;
		tournament = list?.value.find((row) => row.toId === id) ?? null;
		// A competition with no record of its own falls back to whatever this device already holds.
		seen = seenPublished(id) ?? seenInCache(kept?.value);
		await read(false, mine);
		await findEntry(mine);
	}

	async function read(refresh: boolean, mine = ++request) {
		loading = true;
		failed = null;
		try {
			// The list says when ianseo last rebuilt this competition, so a cached index read before
			// that is stale however new it is: a competition marked new opened on yesterday's papers.
			const loaded = await loadCompetition(toId, { refresh, since: tournament?.updatedAt });
			if (mine !== request) return;
			competition = loaded.value;
			cachedAt = loaded.cachedAt;
			problem = loaded.problem;
			// Noted now, so the next visit marks what arrives after this one and nothing that is on screen.
			notePublished(toId, lastPublished(loaded.value.documents));
			await markSeen();
		} catch (error) {
			if (mine !== request) return;
			failed = error instanceof IanseoError && error.kind === 'unreadable' ? 'unreadable' : 'offline';
		}
		loading = false;
	}

	/** Opening the competition is reading it, so nothing already on screen is offered as new again. */
	async function markSeen() {
		if (!followed) return;
		await markCompetitionSeen(toId);
		pinned = await favourites();
		await noteWhatIsFollowed();
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
		await noteWhatIsFollowed();
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
			// A document the archer was found in is kept whatever it is called, which is the whole point
			// of having read it: a name is never in the title ianseo published the document under.
			if (document.path && scanCurrent && scanned.has(document.path)) return true;
			// The panel's translated name too, so a French archer finds the brackets by typing "tableaux".
			const text = `${document.title} ${document.group} ${named(document.group)}`
				.toLowerCase()
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '');
			return wanted.every((term) => text.includes(term));
		});
	});

	/**
	 * Looking for a person rather than for a document.
	 *
	 * The competition page knows what was published, never who is in it: ianseo puts the names inside
	 * each document and nowhere else, so answering "am I in this" means reading them. That is a few
	 * hundred kilobytes on a club shoot and several megabytes on a championship, which is somebody's
	 * data at a shooting line, so it is never done on a keystroke: the archer asks for it, watches it
	 * happen, and can stop it. What has already been read is free, because the documents are cached.
	 */
	let scanned = $state(new Map<string, string[]>());
	/** The search the map above answers, so a name typed over another one does not inherit its results. */
	let scannedFor = $state('');
	let scanning = $state(false);
	let scanDone = $state(0);
	let scan = 0;

	const searchable = $derived((competition?.documents ?? []).filter((one) => one.path));
	const scanTerm = $derived(search.trim());
	/** Whether what is on screen answers the search that is in the box, rather than an older one. */
	const scanCurrent = $derived(scannedFor === scanTerm && scanTerm !== '');

	// A search that changes is a scan that no longer means anything, so it stops rather than finishing.
	$effect(() => {
		if (scanTerm !== scannedFor) stopScan();
	});

	function stopScan() {
		scan++;
		scanning = false;
	}

	/** Read a few at a time: ianseo is somebody else's server, and this asks it for a whole competition. */
	const AT_ONCE = 4;

	async function scanForPerson() {
		const wanted = scanTerm;
		if (!wanted) return;
		const mine = ++scan;

		scanned = new Map();
		scannedFor = wanted;
		scanDone = 0;
		scanning = true;

		const queue = [...searchable];
		const readers = Array.from({ length: AT_ONCE }, async () => {
			while (queue.length > 0 && mine === scan) {
				const document = queue.shift()!;
				try {
					const loaded = await loadResultDocument(document.path!, { since: document.updatedAt });
					if (mine !== scan) return;
					const names = namesFound(loaded.value, wanted);
					// Only the documents the archer is in: an empty answer is still an answer, and is kept
					// out of the map so the list below has nothing to draw for it.
					if (names.length > 0) scanned = new Map([...scanned, [document.path!, names]]);
				} catch {
					// A document ianseo will not give up is one this search cannot answer for, and no more.
				}
				if (mine === scan) scanDone++;
			}
		});

		await Promise.all(readers);
		if (mine === scan) scanning = false;
	}

	/** The documents ianseo has published here since the archer last looked, which is what is worth a mark. */
	const fresh = $derived(newDocuments(competition?.documents ?? [], seen));

	/** The panels in the order ianseo publishes them, which is the order a competition is shot in. */
	const groups = $derived.by(() => {
		const found = new Map<string, Competition['documents']>();
		for (const document of documents) {
			found.set(document.group, [...(found.get(document.group) ?? []), document]);
		}
		return [...found].map(([group, documents]) => ({ group, documents }));
	});

	/**
	 * A panel's heading in the archer's language. ianseo writes these in English whatever the country,
	 * and unlike the documents inside them they are ianseo's own small vocabulary rather than the
	 * organiser's words, so they are the one thing on this page worth translating.
	 */
	const named = $derived((group: string) => {
		const key = groupKey(group);
		return key ? $t(`ianseo.group.${key}`) : group;
	});

	/** `/TourData/2026/26053/IQRM.php` is opened as `IQRM`: the rest of it is where, not what. */
	const nameOf = (path: string) => path.split('/').pop()?.replace(/\.php$/i, '') ?? path;

	/** The timetable, which ianseo publishes as a PDF and the app reads out of it: see `schedule.ts`. */
	const timetable = $derived(scheduleDocument(competition));
</script>

<!--
	ianseo prints the venue and the date on one line, so the list's own undated copy of the date is
	not added to it: the two together said the day twice, once without its year. The list's version
	is not shown while the competition is read either, because it reads differently enough that the
	line was rewritten under the archer: the wait is drawn in outline, as the rest of the page is.
-->
<PageHeader
	motif="ianseo"
	title={competition?.name || tournament?.name || $t('ianseo.title')}
	subtitle={competition?.where}
	subtitleLoading={!competition && !failed}
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
<PullToRefresh onrefresh={() => read(true)}>
<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<ReadNote {loading} {problem} {cachedAt} banner />

	{#if competition?.organiser}
		<p class="px-1 text-sm text-muted">{competition.organiser}</p>
	{/if}

	{#if entry}
		<EntryCard {entry} />
	{/if}

	<!--
		On every competition that published anything, however little. The box is no longer only a way
		past a long list: it is how an archer is looked for, and a club shoot with four documents is
		one somebody wants to know they are in just as much as a championship with ninety.
	-->
	{#if (competition?.documents.length ?? 0) > 0}
		<PageTools
			bind:value={search}
			placeholder={$t('ianseo.findDocument')}
			count={search.trim() ? $t('ianseo.foundDocuments', { n: documents.length }) : ''}
		/>

		<!--
			Offered rather than done: the names are inside the documents, so answering this reads the
			whole competition off ianseo. The archer asks for it, sees how far it has got, and can stop.
		-->
		{#if scanTerm}
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted">
				{#if scanning}
					<span>{$t('ianseo.searchingPeople', { done: scanDone, n: searchable.length })}</span>
					<button class="underline" onclick={stopScan}>{$t('ianseo.stopSearch')}</button>
				{:else if scanCurrent}
					<span>{$t('ianseo.searchedPeople', { done: scanDone, n: searchable.length })}</span>
					<button class="underline" onclick={scanForPerson}>{$t('ianseo.searchAgain')}</button>
				{:else if searchable.length > 0}
					<span>{$t('ianseo.peopleOffer')}</span>
					<button class="font-semibold text-brand-text underline" onclick={scanForPerson}>
						{$t('ianseo.searchPeople', { n: searchable.length })}
					</button>
				{/if}
			</div>
		{/if}
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
		await noteWhatIsFollowed();
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
		<EmptyState
			title={$t(scanCurrent ? 'ianseo.noPersonFound' : 'ianseo.noDocumentFound')}
			body={$t(scanCurrent ? 'ianseo.noPersonFoundBody' : 'ianseo.noDocumentFoundBody')}
		/>
	{:else if groups.length === 0 && !loading}
		<EmptyState title={$t('ianseo.noDocumentsTitle')} body={$t('ianseo.noDocumentsBody')} />
	{/if}

	{#each groups as { group, documents } (group)}
		<section>
			<h2 class="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
				{named(group) || $t('ianseo.documents')}
			</h2>
			<ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
				<!--
					A document published as a PDF and nothing else opens the PDF: the mandate is the one an
					archer wants before the competition rather than after it, so it is not left off the page.
				-->
				{#each documents as document (document.path ?? document.pdfPath ?? document.url)}
					{@const opens = document.path
						? `/ianseo/${toId}/${nameOf(document.path)}`
						: document === timetable
							? `/ianseo/${toId}/schedule`
							: null}
					{@const inApp = opens ? withOrigin(opens, $page.url.pathname) : null}
					<!-- A file on ianseo, or the competition's own website, which is where the hotels are. -->
					{@const away = fileLink(document.pdfPath, IANSEO) ?? webLink(document.url)}
					<li class="relative flex items-center gap-2">
						<a
							class="min-w-0 flex-1 p-3"
							href={inApp ?? away}
							target={inApp ? null : externalTarget()}
							rel={inApp ? null : 'noreferrer'}
						>
							<!-- The whole row opens the document; the PDF beside it is lifted over that link. -->
							<span class="absolute inset-0" aria-hidden="true"></span>
							<span class="block font-medium break-words">
								{document.title}
								<!-- Beside the name rather than under it: what is new is a property of the document. -->
								{#if fresh.has(document)}
									<span class="ml-1 align-middle rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-text">
										{$t('ianseo.newResults')}
									</span>
								{/if}
							</span>
							<!-- Who was found, because a surname in a big competition is three different people. -->
							{#if document.path && scanCurrent && scanned.has(document.path)}
								<span class="mt-0.5 block text-xs font-medium text-brand-text">
									{scanned.get(document.path)!.slice(0, 3).join(' · ')}
									{#if scanned.get(document.path)!.length > 3}
										{$t('ianseo.andMoreNames', { n: scanned.get(document.path)!.length - 3 })}
									{/if}
								</span>
							{/if}
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
								target={externalTarget()}
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

	<!-- Where all of this came from: whatever the app has not redrawn is still one tap away. -->
	<p class="pb-2 text-center">
		<a
			class="press inline-flex text-xs font-medium text-muted underline"
			href="{IANSEO}/Details.php?toId={toId}"
			target={externalTarget()}
			rel="noreferrer"
		>
			{$t('ianseo.onIanseo')}
		</a>
	</p>
</div>
</PullToRefresh>
{/if}

<ShareSheet
	open={shareSheet}
	title={competition?.name || tournament?.name || $t('ianseo.title')}
	url={shareUrl}
	onclose={() => (shareSheet = false)}
/>
