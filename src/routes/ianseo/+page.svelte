<script lang="ts">
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';
	import { originOf, setPageUp, withOrigin } from '$lib/nav';
	import { ianseoCountries, ianseoCountryAsked, ianseoMajor } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TournamentCard from '$lib/ui/ianseo/TournamentCard.svelte';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import { loadTournaments } from '$lib/ianseo/client';
	import { countriesOf, filterTournaments, guessedCountry, whenOf, type When } from '$lib/ianseo/select';
	import { favourites, isNew, type Favourite } from '$lib/ianseo/store';
	import type { Tournament } from '$lib/ianseo/types';

	/**
	 * Every competition ianseo hosts, narrowed to the ones an archer could plausibly care about: the
	 * countries they follow, the championships and games the ianseo team run, and whatever they type
	 * into the search, which is asked of the whole of ianseo rather than of what is on screen.
	 */

	const from = $derived(originOf($page.url, '/'));
	$effect(() => setPageUp(from));

	let list = $state<Tournament[]>([]);
	let cachedAt = $state<number | null>(null);
	let stale = $state(false);
	let loading = $state(true);
	let failed = $state(false);
	let search = $state('');
	let pinned = $state<Favourite[]>([]);
	let countrySheet = $state(false);
	let countryTerm = $state('');
	/** The country the device suggests, offered once and only while nothing has been chosen. */
	let offered = $state<{ code: string; name: string } | null>(null);

	$effect(() => {
		void open();
	});

	async function open() {
		pinned = await favourites();
		await read();
	}

	async function read(refresh = false) {
		loading = true;
		failed = false;
		try {
			const loaded = await loadTournaments({ refresh });
			list = loaded.value;
			cachedAt = loaded.cachedAt;
			stale = loaded.stale;
			offer();
		} catch {
			// Nothing has ever been read on this device, so there is not even something old to show.
			failed = true;
		}
		loading = false;
	}

	function offer() {
		if ($ianseoCountryAsked || $ianseoCountries.length > 0 || list.length === 0) return;
		const code = guessedCountry(list, navigator.languages ?? [$locale]);
		const country = list.find((row) => row.country?.code === code)?.country;
		offered = country ?? null;
		// Nothing to offer is still an answer: the archer is asked once, not on every visit.
		if (!country) ianseoCountryAsked.set(true);
	}

	function takeOffer(country: { code: string }) {
		ianseoCountries.set([country.code]);
		ianseoCountryAsked.set(true);
		offered = null;
	}

	const filter = $derived({ countries: $ianseoCountries, major: $ianseoMajor, search });
	const shown = $derived(filterTournaments(list, filter));
	const now = Date.now();

	/** The competitions followed, in the order the list already puts them: what is on now, first. */
	const followed = $derived(
		shown.length === 0 && pinned.length === 0
			? []
			: pinned
					.filter((one) => one.kind === 'competition')
					.map((one) => ({
						favourite: one,
						tournament: list.find((row) => row.toId === one.toId)
					}))
	);

	const groups = $derived(
		(['running', 'upcoming', 'finished'] as When[])
			.map((when) => ({ when, rows: shown.filter((row) => whenOf(row, now) === when) }))
			.filter((group) => group.rows.length > 0)
	);

	const following = $derived(new Set(pinned.filter((one) => one.kind === 'competition').map((one) => one.toId)));
	const fresh = $derived(
		new Set(pinned.filter((one) => one.kind === 'competition' && isNew(one)).map((one) => one.toId))
	);

	const countries = $derived(countriesOf(list));
	const offerable = $derived(
		countries.filter(
			(country) =>
				!$ianseoCountries.includes(country.code) &&
				(countryTerm.trim() === '' ||
					`${country.name} ${country.code}`.toLowerCase().includes(countryTerm.trim().toLowerCase()))
		)
	);

	const named = $derived(new Map(countries.map((country) => [country.code, country.name])));

	function drop(code: string) {
		ianseoCountries.set($ianseoCountries.filter((one) => one !== code));
	}

	function add(code: string) {
		ianseoCountries.set([...$ianseoCountries, code]);
		countrySheet = false;
		countryTerm = '';
	}

	const link = (toId: string) => withOrigin(`/ianseo/${toId}`, '/ianseo');
</script>

<PageHeader motif="ianseo" title={$t('ianseo.title')} subtitle={$t('ianseo.subtitle')}>
	{#snippet lead()}
		<a href={from} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
	{#snippet actions()}
		<button
			class="rounded-lg border border-line bg-surface p-2 text-muted disabled:opacity-50"
			aria-label={$t('ianseo.refresh')}
			disabled={loading}
			onclick={() => read(true)}
		>
			<span class="block {loading ? 'animate-spin' : ''}"><Icon name="refresh" size={18} /></span>
		</button>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
	<!-- The search sits above the filters because it overrides them: a name is asked of all of ianseo. -->
	<div class="relative">
		<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
			<Icon name="search" size={16} />
		</span>
		<input
			class="w-full rounded-xl border border-line bg-surface py-2.5 pr-9 pl-9 text-sm"
			bind:value={search}
			autocomplete="off"
			type="search"
			placeholder={$t('ianseo.searchPlaceholder')}
			aria-label={$t('ianseo.searchPlaceholder')}
		/>
		{#if search}
			<button
				class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1 text-muted"
				aria-label={$t('common.close')}
				onclick={() => (search = '')}
			>
				<Icon name="close" size={16} />
			</button>
		{/if}
	</div>

	{#if offered}
		<!-- Offered rather than taken: a phone one country over would otherwise hide the archer's own list. -->
		<div class="rounded-2xl border border-brand/40 bg-gradient-to-r from-brand/10 to-surface p-3">
			<p class="font-semibold">{$t('ianseo.offerCountry', { country: offered.name })}</p>
			<p class="mt-1 text-xs text-muted">{$t('ianseo.offerCountryBody')}</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<button
					class="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink"
					onclick={() => takeOffer(offered!)}
				>
					{$t('ianseo.offerYes', { country: offered.name })}
				</button>
				<button
					class="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted"
					onclick={() => {
						ianseoCountryAsked.set(true);
						offered = null;
					}}
				>
					{$t('ianseo.offerNo')}
				</button>
			</div>
		</div>
	{/if}

	<!-- One line of chips, each of them the whole of what it says: tap a country to stop following it. -->
	<div class="flex flex-wrap items-center gap-1.5">
		{#each $ianseoCountries as code (code)}
			<button
				class="flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-brand-text"
				onclick={() => drop(code)}
			>
				{named.get(code) ?? code}
				<Icon name="close" size={13} />
			</button>
		{/each}
		<button
			class="flex items-center gap-1 rounded-full border border-line py-1 pr-2.5 pl-1.5 text-xs font-medium text-muted"
			onclick={() => (countrySheet = true)}
		>
			<Icon name="plus" size={13} />
			{$t('ianseo.addCountry')}
		</button>
		<button
			class="flex items-center gap-1 rounded-full border py-1 pr-2.5 pl-1.5 text-xs font-medium {$ianseoMajor
				? 'border-brand/40 bg-brand/10 text-brand-text'
				: 'border-line text-muted'}"
			aria-pressed={$ianseoMajor}
			title={$t('ianseo.majorHint')}
			onclick={() => ianseoMajor.set(!$ianseoMajor)}
		>
			<Icon name="podium" size={13} />
			{$t('ianseo.majorEvents')}
		</button>
	</div>

	{#if failed}
		<EmptyState
			title={$t('ianseo.errorTitle')}
			body={$t('ianseo.errorBody')}
			action={{ label: $t('ianseo.retry'), onclick: () => read(true) }}
		/>
	{:else}
		{#if followed.length > 0}
			<section>
				<h2 class="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
					{$t('ianseo.following')}
				</h2>
				<div class="space-y-2">
					{#each followed as one (one.favourite.id)}
						{#if one.tournament}
							<TournamentCard
								tournament={one.tournament}
								when={whenOf(one.tournament, now)}
								href={link(one.tournament.toId)}
								following
								fresh={isNew(one.favourite)}
							/>
						{:else}
							<!-- Followed before the list held it, or held under a competition ianseo has retired. -->
							<a
								href={link(one.favourite.toId ?? '')}
								class="flex items-center gap-2 rounded-2xl border border-line bg-surface p-3"
							>
								<span class="text-brand-text"><Icon name="star" size={16} filled /></span>
								<span class="min-w-0 flex-1 truncate font-semibold">{one.favourite.label}</span>
								{#if isNew(one.favourite)}
									<span class="rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-ink">
										{$t('ianseo.newResults')}
									</span>
								{/if}
							</a>
						{/if}
					{/each}
				</div>
			</section>
		{/if}

		{#each groups as group (group.when)}
			<section>
				<h2 class="mb-2 flex items-baseline justify-between gap-2 px-1">
					<span class="text-[11px] font-semibold tracking-wider text-muted uppercase">
						{$t(`ianseo.${group.when}`)}
					</span>
					<span class="tabular text-[11px] text-muted">{group.rows.length}</span>
				</h2>
				<div class="space-y-2">
					{#each group.rows.slice(0, group.when === 'finished' ? 40 : 200) as tournament (tournament.toId)}
						<TournamentCard
							{tournament}
							when={group.when}
							href={link(tournament.toId)}
							following={following.has(tournament.toId)}
							fresh={fresh.has(tournament.toId)}
						/>
					{/each}
				</div>
			</section>
		{/each}

		{#if groups.length === 0 && !loading}
			{#if search.trim()}
				<EmptyState title={$t('ianseo.noMatchTitle')} body={$t('ianseo.noMatchBody')} />
			{:else}
				<EmptyState
					title={$t('ianseo.emptyTitle')}
					body={$t('ianseo.emptyBody')}
					action={{ label: $t('ianseo.addCountry'), onclick: () => (countrySheet = true) }}
				/>
			{/if}
		{/if}
	{/if}

	<!-- Dated rather than dressed as live: everything above was read at a moment, and says which. -->
	<ReadNote {loading} {stale} {cachedAt}>
		<span>· {$t('ianseo.byline')}</span>
	</ReadNote>
</div>

<Sheet open={countrySheet} title={$t('ianseo.chooseCountry')} onclose={() => (countrySheet = false)}>
	<input
		class="mb-2 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
		bind:value={countryTerm}
		autocomplete="off"
		placeholder={$t('ianseo.countrySearch')}
		aria-label={$t('ianseo.countrySearch')}
	/>
	<ul class="space-y-1">
		{#each offerable as country (country.code)}
			<li>
				<button
					class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-line/30"
					onclick={() => add(country.code)}
				>
					<span class="tabular w-9 shrink-0 text-xs font-bold text-muted">{country.code}</span>
					<span class="min-w-0 flex-1 truncate">{country.name}</span>
					<span class="tabular shrink-0 text-xs text-muted">{country.count}</span>
				</button>
			</li>
		{/each}
	</ul>
</Sheet>
