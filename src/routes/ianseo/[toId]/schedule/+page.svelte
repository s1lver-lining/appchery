<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { externalTarget, originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import PageSkeleton from '$lib/ui/PageSkeleton.svelte';
	import PullToRefresh from '$lib/ui/PullToRefresh.svelte';
	import { fileLink } from '$lib/competitions/links';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import PageTools from '$lib/ui/ianseo/PageTools.svelte';
	import ScheduleBoard from '$lib/ui/ianseo/ScheduleBoard.svelte';
	import { findInSchedule } from '$lib/ianseo/find';
	import { loadCompetition, loadSchedule } from '$lib/ianseo/client';
	import { scheduleDocument, type Schedule } from '$lib/ianseo/schedule';
	import { IANSEO, IanseoError } from '$lib/ianseo/fetch';
	import type { Competition, CompetitionDocument } from '$lib/ianseo/types';

	/**
	 * The competition's timetable, redrawn from the PDF ianseo prints it as.
	 *
	 * This is the one page of the feature reading something that was never meant to be read by
	 * anything but a printer, so it is the one that is likeliest to be handed a report it cannot make
	 * sense of. Every answer to that is the same: the PDF, which has everything, is on this page from
	 * the moment it opens and stays there whether the reading worked or not.
	 */

	const toId = $derived($page.params.toId ?? '');
	const from = $derived(originOf($page.url, `/ianseo/${toId}`));
	$effect(() => setPageUp(from));

	let competition = $state<Competition | null>(null);
	let entry = $state<CompetitionDocument | null>(null);
	let schedule = $state<Schedule | null>(null);
	let cachedAt = $state<number | null>(null);
	let problem = $state<'offline' | 'unreadable' | null>(null);
	let loading = $state(true);
	let error = $state<'missing' | 'offline' | 'unreadable' | null>(null);

	/** Which competition the screen is asking about, so a slow read of one never lands on another. */
	let request = 0;

	$effect(() => {
		void open(toId);
	});

	async function open(id: string) {
		if (!id) return;
		const mine = ++request;
		schedule = null;
		entry = null;

		let found: Competition | null = null;
		try {
			found = (await loadCompetition(id)).value;
		} catch {
			found = null;
		}
		if (mine !== request) return;

		competition = found;
		entry = scheduleDocument(found);
		await read(false, mine);
	}

	async function read(refresh: boolean, mine = ++request) {
		const path = entry?.pdfPath;
		if (!path) {
			loading = false;
			error = 'missing';
			return;
		}
		loading = true;
		error = null;
		try {
			const loaded = await loadSchedule(path, { refresh, since: entry?.updatedAt });
			if (mine !== request) return;
			schedule = loaded.value;
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

	let search = $state('');
	const days = $derived(findInSchedule(schedule?.days ?? [], search));
	const pdf = $derived(fileLink(entry?.pdfPath, IANSEO));
	const found = $derived(
		search.trim()
			? $t('ianseo.foundRows', { n: days.reduce((all, day) => all + day.lines.length, 0) })
			: ''
	);
</script>

<PageHeader
	motif="ianseo"
	title={entry?.title || $t('ianseo.schedule')}
	subtitle={competition?.name}
>
	{#snippet lead()}
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
	{#snippet actions()}
		<button
			class="press rounded-lg border border-line bg-surface p-2 text-muted disabled:opacity-50"
			aria-label={$t('ianseo.refresh')}
			disabled={loading || !entry}
			onclick={() => read(true)}
		>
			<span class="block {loading ? 'animate-spin' : ''}"><Icon name="refresh" size={18} /></span>
		</button>
	{/snippet}
</PageHeader>

{#if loading && !schedule && !error}
	<PageSkeleton title={false} cards={3} />
{:else}
<PullToRefresh onrefresh={() => read(true)}>
<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<ReadNote {loading} {problem} {cachedAt} banner />

	<!-- Beside the search box from the moment the page opens: it is the answer to everything below. -->
	<PageTools bind:value={search} placeholder={$t('ianseo.findInSchedule')} count={found}>
		{#if pdf}
			<a
				class="press shrink-0 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-bold text-muted"
				href={pdf}
				target={externalTarget()}
				rel="noreferrer"
			>
				{$t('ianseo.pdf')}
			</a>
		{/if}
	</PageTools>

	{#if error === 'missing'}
		<EmptyState
			title={$t('ianseo.noScheduleTitle')}
			body={$t('ianseo.noScheduleBody')}
			action={{ label: $t('ianseo.documents'), href: from }}
		/>
	{:else if error}
		<EmptyState
			title={$t(error === 'unreadable' ? 'ianseo.scheduleUnreadableTitle' : 'ianseo.errorTitle')}
			body={$t(error === 'unreadable' ? 'ianseo.scheduleUnreadableBody' : 'ianseo.errorBody')}
			action={pdf
				? { label: $t('ianseo.openPdf'), href: pdf }
				: { label: $t('ianseo.retry'), onclick: () => read(true) }}
		/>
	{:else if days.length > 0}
		<ScheduleBoard {days} />
	{:else if search.trim()}
		<EmptyState title={$t('ianseo.noLineFound')} body={$t('ianseo.noLineFoundBody')} />
	{/if}

	<ReadNote {loading} {problem} {cachedAt} />
</div>
</PullToRefresh>
{/if}
