<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import ResultTable from '$lib/ui/ianseo/ResultTable.svelte';
	import BracketBoard from '$lib/ui/ianseo/BracketBoard.svelte';
	import { loadCompetition, loadResultDocument } from '$lib/ianseo/client';
	import { IANSEO, IanseoError } from '$lib/ianseo/fetch';
	import {
		addFavourite,
		favouriteId,
		favourites,
		removeFavourite,
		type Favourite
	} from '$lib/ianseo/store';
	import type { Competition, CompetitionDocument, ResultDocument } from '$lib/ianseo/types';

	/**
	 * One document, whatever it holds: a result list, an entry list, a bracket. The document is found
	 * through the competition rather than guessed at from the address, because only the competition
	 * knows which year ianseo files it under.
	 */

	const toId = $derived($page.params.toId ?? '');
	const name = $derived($page.params.doc ?? '');
	const from = $derived(originOf($page.url, `/ianseo/${toId}`));
	$effect(() => setPageUp(from));

	let competition = $state<Competition | null>(null);
	let entry = $state<CompetitionDocument | null>(null);
	let document = $state<ResultDocument | null>(null);
	let cachedAt = $state<number | null>(null);
	let stale = $state(false);
	let loading = $state(true);
	let error = $state<'missing' | 'offline' | null>(null);
	let pinned = $state<Favourite[]>([]);

	const followedLabels = $derived(
		new Set(
			pinned
				.filter((one) => one.kind === 'archer' || one.kind === 'club')
				.map((one) => one.label.trim().toLowerCase())
		)
	);

	$effect(() => {
		void open(toId, name);
	});

	async function open(toId: string, name: string) {
		if (!toId || !name) return;
		document = null;
		entry = null;
		pinned = await favourites();
		try {
			competition = (await loadCompetition(toId)).value;
		} catch {
			competition = null;
		}
		entry =
			competition?.documents.find((one) => one.path.split('/').pop() === `${name}.php`) ?? null;
		await read(false);
	}

	async function read(refresh: boolean) {
		if (!entry) {
			loading = false;
			error = 'missing';
			return;
		}
		loading = true;
		error = null;
		try {
			const loaded = await loadResultDocument(entry.path, { refresh });
			document = loaded.value;
			cachedAt = loaded.cachedAt;
			stale = loaded.stale;
		} catch (thrown) {
			error = thrown instanceof IanseoError && thrown.kind === 'missing' ? 'missing' : 'offline';
		}
		loading = false;
	}

	async function follow(kind: 'archer' | 'club', label: string) {
		const id = favouriteId(kind, label.trim().toLowerCase(), toId);
		if (pinned.some((one) => one.id === id)) await removeFavourite(id);
		else {
			await addFavourite({
				id,
				kind,
				toId,
				label: label.trim(),
				detail: competition?.name ?? null
			});
			// Following somebody inside a competition is following the competition: that is where they shoot.
			const owner = favouriteId('competition', toId);
			if (!pinned.some((one) => one.id === owner)) {
				await addFavourite({
					id: owner,
					kind: 'competition',
					toId,
					label: competition?.name ?? toId,
					detail: null
				});
			}
		}
		pinned = await favourites();
	}

	const sections = $derived(document?.kind === 'table' ? document.sections : []);

	/**
	 * ianseo qualifies a document's title in brackets: "Recurve Men [After 60 Arrows]". The class is
	 * the title and the qualifier is not, so the qualifier goes under it rather than being the half
	 * of the line a narrow header has room to cut off.
	 */
	const heading = $derived.by(() => {
		const whole = document?.title || entry?.title || name;
		const split = whole.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
		return split ? { title: split[1], note: split[2] } : { title: whole, note: '' };
	});
	const subtitle = $derived([heading.note, competition?.name].filter(Boolean).join(' · '));
</script>

<PageHeader motif="ianseo" title={heading.title} {subtitle}>
	{#snippet lead()}
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
	{#snippet actions()}
		<button
			class="rounded-lg border border-line bg-surface p-2 text-muted disabled:opacity-50"
			aria-label={$t('ianseo.refresh')}
			disabled={loading || !entry}
			onclick={() => read(true)}
		>
			<span class="block {loading ? 'animate-spin' : ''}"><Icon name="refresh" size={18} /></span>
		</button>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	{#if error === 'missing'}
		<EmptyState
			title={$t('ianseo.missingDocumentTitle')}
			body={$t('ianseo.missingDocumentBody')}
			action={{ label: $t('ianseo.documents'), href: from }}
		/>
	{:else if error === 'offline'}
		<EmptyState
			title={$t('ianseo.errorTitle')}
			body={$t('ianseo.errorBody')}
			action={{ label: $t('ianseo.retry'), onclick: () => read(true) }}
		/>
	{:else if document?.kind === 'bracket'}
		<BracketBoard {document} {followedLabels} onfollow={follow} />
	{:else if sections.length > 0}
		{#each sections as section, index (index)}
			<ResultTable {section} {followedLabels} onfollow={follow} />
		{/each}
	{:else if !loading}
		<EmptyState title={$t('ianseo.emptyDocumentTitle')} body={$t('ianseo.emptyDocumentBody')} />
	{/if}

	<ReadNote {loading} {stale} {cachedAt}>
		{#if entry?.pdfPath}
			<a
				class="rounded-lg border border-line px-2 py-1 font-medium"
				href="{IANSEO}{entry.pdfPath}"
				target="_blank"
				rel="noreferrer"
			>
				{$t('ianseo.pdf')}
			</a>
		{/if}
	</ReadNote>
</div>
