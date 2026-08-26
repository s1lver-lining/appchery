<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import ResultTable from '$lib/ui/ianseo/ResultTable.svelte';
	import PageTools from '$lib/ui/ianseo/PageTools.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';
	import { ianseoHiddenColumns, ianseoShownColumns } from '$lib/prefs';
	import { afterToggle, defaultColumns, visibleColumns } from '$lib/ianseo/columns';
	import { countRows, findInRounds, findInSections } from '$lib/ianseo/find';
	import BracketBoard from '$lib/ui/ianseo/BracketBoard.svelte';
	import { loadCompetition, loadResultDocument } from '$lib/ianseo/client';
	import { IANSEO, IanseoError } from '$lib/ianseo/fetch';
	import {
		addFavourite,
		favouriteId,
		favourites,
		markCompetitionSeen,
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
	let problem = $state<'offline' | 'unreadable' | null>(null);
	let loading = $state(true);
	let error = $state<'missing' | 'offline' | 'unreadable' | null>(null);
	let pinned = $state<Favourite[]>([]);

	const followedLabels = $derived(
		new Set(
			pinned
				.filter((one) => one.kind === 'archer' || one.kind === 'club')
				.map((one) => one.label.trim().toLowerCase())
		)
	);

	/**
	 * Which document the screen is asking about. A slow read of one document finishing after the
	 * archer has opened another would otherwise put the first one's rows under the second one's name.
	 */
	let request = 0;

	$effect(() => {
		void open(toId, name);
	});

	async function open(toId: string, name: string) {
		if (!toId || !name) return;
		const mine = ++request;
		document = null;
		entry = null;

		const known = await favourites();
		if (mine !== request) return;
		pinned = known;

		let found: Competition | null = null;
		try {
			found = (await loadCompetition(toId)).value;
		} catch {
			found = null;
		}
		if (mine !== request) return;

		competition = found;
		entry = found?.documents.find((one) => one.path.split('/').pop() === `${name}.php`) ?? null;
		await read(false, mine);
	}

	async function read(refresh: boolean, mine = ++request) {
		if (!entry) {
			loading = false;
			error = 'missing';
			return;
		}
		loading = true;
		error = null;
		try {
			const loaded = await loadResultDocument(entry.path, { refresh });
			if (mine !== request) return;
			document = loaded.value;
			cachedAt = loaded.cachedAt;
			problem = loaded.problem;
		} catch (thrown) {
			if (mine !== request) return;
			error =
				thrown instanceof IanseoError && (thrown.kind === 'missing' || thrown.kind === 'unreadable')
					? thrown.kind
					: 'offline';
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
				await markCompetitionSeen(toId);
			}
		}
		pinned = await favourites();
	}

	let search = $state('');
	let columnSheet = $state(false);

	/** What the archer has asked for and sent away, matched on the heading each column carries. */
	const choice = $derived({
		chosen: new Set($ianseoShownColumns),
		refused: new Set($ianseoHiddenColumns)
	});

	const sections = $derived(
		findInSections(document?.kind === 'table' ? document.sections : [], search)
	);
	const rounds = $derived(findInRounds(document?.kind === 'bracket' ? document.rounds : [], search));

	/**
	 * Every heading this document offers, with what it is doing now and what it would do left alone,
	 * read off the first section that has it: the sheet lists what is here rather than what once was.
	 */
	const columns = $derived.by(() => {
		const found = new Map<string, { label: string; visible: boolean; byDefault: boolean }>();
		for (const section of document?.kind === 'table' ? document.sections : []) {
			const shown = visibleColumns(section, choice);
			const fallback = defaultColumns(section);
			section.columns.forEach((column, at) => {
				if (!column.label || found.has(column.label)) return;
				found.set(column.label, {
					label: column.label,
					visible: shown[at],
					byDefault: fallback[at]
				});
			});
		}
		return [...found.values()];
	});

	/** Never the last one standing: a table with every column switched off is a table of nothing. */
	const showing = $derived(columns.filter((column) => column.visible).length);

	function toggleColumn(column: { label: string; visible: boolean; byDefault: boolean }) {
		if (column.visible && showing <= 1) return;
		const after = afterToggle(column.label, column.visible, column.byDefault, choice);
		ianseoShownColumns.set([...after.chosen]);
		ianseoHiddenColumns.set([...after.refused]);
	}

	const found = $derived(
		search.trim()
			? document?.kind === 'bracket'
				? $t('ianseo.foundMatches', { n: rounds.reduce((all, one) => all + one.matches.length, 0) })
				: $t('ianseo.foundRows', { n: countRows(sections) })
			: ''
	);

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

<!-- Wider than the app's usual column: a result list is a table of ten things, not a paragraph, and
	the room is the difference between an archer a line and an archer a paragraph. -->
<div class="mx-auto w-full max-w-4xl space-y-4 p-4">
	<ReadNote {loading} {problem} {cachedAt} banner />

	{#if error === 'missing'}
		<EmptyState
			title={$t('ianseo.missingDocumentTitle')}
			body={$t('ianseo.missingDocumentBody')}
			action={{ label: $t('ianseo.documents'), href: from }}
		/>
	{:else if error}
		<EmptyState
			title={$t(error === 'unreadable' ? 'ianseo.unreadableTitle' : 'ianseo.errorTitle')}
			body={$t(error === 'unreadable' ? 'ianseo.unreadableBody' : 'ianseo.errorBody')}
			action={{ label: $t('ianseo.retry'), onclick: () => read(true) }}
		/>
	{/if}

	{#if document && !error}
		<PageTools
			bind:value={search}
			placeholder={$t('ianseo.findInDocument')}
			settings={document.kind === 'table' && columns.length > 0 ? () => (columnSheet = true) : undefined}
			settingsLabel={$t('ianseo.columns')}
			count={found}
		/>
	{/if}

	{#if document && document.skipped > 0}
		<!-- Said rather than hidden: a result list quietly missing a line is worse than one that admits it. -->
		<p class="flex items-center gap-2 rounded-xl border border-line bg-line/25 px-3 py-2 text-xs text-muted">
			<span class="shrink-0"><Icon name="bulb" size={16} /></span>
			{$t('ianseo.partial')}
		</p>
	{/if}

	{#if !error}
		{#if document?.kind === 'bracket'}
			<BracketBoard document={{ ...document, rounds }} {followedLabels} onfollow={follow} />
		{:else if sections.length > 0}
			{#each sections as section, index (index)}
				<ResultTable {section} {choice} {followedLabels} onfollow={follow} />
			{/each}
		{:else if search.trim()}
			<EmptyState title={$t('ianseo.noOneFound')} body={$t('ianseo.noOneFoundBody')} />
		{:else if !loading}
			<EmptyState title={$t('ianseo.emptyDocumentTitle')} body={$t('ianseo.emptyDocumentBody')} />
		{/if}
	{/if}

	<ReadNote {loading} {problem} {cachedAt}>
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

<Sheet open={columnSheet} title={$t('ianseo.columns')} onclose={() => (columnSheet = false)}>
	<p class="mb-2 text-xs text-muted">{$t('ianseo.columnsHint')}</p>
	<ul class="space-y-1">
		{#each columns as column (column.label)}
			<li class="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
				<span class="min-w-0 flex-1 truncate text-sm">{column.label}</span>
				<Toggle
					checked={column.visible}
					disabled={column.visible && showing <= 1}
					onchange={() => toggleColumn(column)}
					label={column.label}
				/>
			</li>
		{/each}
	</ul>
</Sheet>
