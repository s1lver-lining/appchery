<script lang="ts">
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';
	import { originOf, setPageUp, withOrigin } from '$lib/nav';
	import {
		ianseoCountries,
		ianseoCountryAsked,
		ianseoHere,
		ianseoMajor,
		ianseoRadiusKm,
		ianseoSearchEverywhere
	} from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TournamentCard from '$lib/ui/ianseo/TournamentCard.svelte';
	import PageTools from '$lib/ui/ianseo/PageTools.svelte';
	import ReadNote from '$lib/ui/ianseo/ReadNote.svelte';
	import { loadTournaments } from '$lib/ianseo/client';
	import { IanseoError } from '$lib/ianseo/fetch';
	import { countriesOf, filterTournaments, guessedCountry, whenOf, type When } from '$lib/ianseo/select';
	import { distanceKm } from '$lib/competitions/distance';
	import { favourites, isNew, notePublished, type Favourite } from '$lib/ianseo/store';
	import { RADII, roundKm, type Point } from '$lib/competitions/distance';
	import { keyOf, knownPlaces, locate, PlaceUnavailable } from '$lib/competitions/places';
	import { requestPosition, LocationDeniedError } from '$lib/conditions';
	import EntryCard from '$lib/ui/ianseo/EntryCard.svelte';
	import { loadEntries } from '$lib/inscriptarc/client';
	import { unmatched } from '$lib/inscriptarc/match';
	import type { Entry } from '$lib/inscriptarc/types';
	import type { Tournament } from '$lib/ianseo/types';

	/**
	 * Every competition ianseo hosts, narrowed to the ones an archer could plausibly care about: the
	 * countries they follow, the championships and games the ianseo team run, and whatever they type
	 * into the search, which is asked of the whole of ianseo rather than of what is on screen.
	 */

	const from = $derived(originOf($page.url, '/'));
	$effect(() => setPageUp(from));

	/**
	 * The one clock the page reads. Filtering by one reading of it and grouping by another put a
	 * competition in a section its own filter disagreed with, which is what a page left open across
	 * midnight did. Taken again whenever the list is read, which is the moment any of it can change.
	 */
	let now = $state(Date.now());
	let list = $state<Tournament[]>([]);
	let cachedAt = $state<number | null>(null);
	let problem = $state<'offline' | 'unreadable' | null>(null);
	let loading = $state(true);
	let failed = $state<'offline' | 'unreadable' | null>(null);
	let search = $state('');
	let pinned = $state<Favourite[]>([]);
	/** What is open for entry in France, which is worth showing even where ianseo has never heard of it. */
	let entries = $state<Entry[]>([]);
	let countrySheet = $state(false);
	let radiusSheet = $state(false);
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

	// Asked again when the countries change, so adding France does not need the page reopening.
	$effect(() => {
		void readEntries($ianseoCountries);
	});

	/**
	 * The entry forms, asked for only where they could mean anything: the platform is French, so an
	 * archer following Japan is not made to wait on a page about somebody else's country.
	 */
	async function readEntries(countries: string[]) {
		const french = countries.length === 0 || countries.includes('FRA');
		entries = french ? await loadEntries() : [];
	}

	async function read(refresh = false) {
		loading = true;
		failed = null;
		now = Date.now();
		try {
			const loaded = await loadTournaments({ refresh });
			// Before the list goes on screen, not after: a distance filter that arrives a moment late
			// shows every competition in the world and then takes most of them away again.
			await primePlaces(loaded.value);
			list = loaded.value;
			cachedAt = loaded.cachedAt;
			problem = loaded.problem;
			offer();
			await note();
		} catch (error) {
			// Nothing has ever been read on this device, so there is not even something old to show.
			failed = error instanceof IanseoError && error.kind === 'unreadable' ? 'unreadable' : 'offline';
		}
		loading = false;
	}

	/**
	 * The followed competitions, against what the list says ianseo last rebuilt them. This is the
	 * only place a result becomes new: opening a competition is what makes it read again.
	 */
	async function note() {
		const followed = pinned.filter((one) => one.kind === 'competition');
		if (followed.length === 0) return;
		for (const one of followed) {
			const tournament = list.find((row) => row.toId === one.toId);
			if (tournament) await notePublished(one.toId!, tournament.updatedAt);
		}
		pinned = await favourites();
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

	/** Where the archer said they were, kept as `latitude,longitude` so a reload does not ask again. */
	const here = $derived.by<Point | null>(() => {
		const [latitude, longitude] = ($ianseoHere ?? '').split(',').map(Number);
		return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
	});

	/** Towns already looked up, by the key they are remembered under. Filled in as answers arrive. */
	let places = $state(new Map<string, Point | null>());
	let locating = $state(0);

	const townOf = (tournament: Tournament) => ({
		name: tournament.city,
		country: tournament.country?.name ?? null
	});
	const placeOf = (tournament: Tournament) => places.get(keyOf(townOf(tournament))) ?? null;

	const distances = $derived.by(() => {
		const found = new Map<string, number | null>();
		if (!here) return found;
		for (const tournament of list) {
			const point = placeOf(tournament);
			found.set(tournament.toId, point ? distanceKm(here, point) : null);
		}
		return found;
	});

	const filter = $derived({
		countries: $ianseoCountries,
		major: $ianseoMajor,
		search,
		searchEverywhere: $ianseoSearchEverywhere,
		radiusKm: $ianseoRadiusKm > 0 ? $ianseoRadiusKm : null,
		here
	});
	const shown = $derived(filterTournaments(list, filter, now, distances));

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

	/**
	 * The towns of what is on screen, looked up a few at a time and kept for good. Only ever while a
	 * distance filter is on: a town name is sent to a third party to be located, and nothing asks for
	 * that unless the archer has asked to be told how far away things are.
	 */
	$effect(() => {
		if ($ianseoRadiusKm <= 0 || !here) return;
		void fillPlaces(shown.slice(0, 120).map(townOf));
	});

	/**
	 * The towns of the first page as this device already has them, read back in one go. Nothing is
	 * asked of the geocoder here: this is only what is known for free, so that the first thing drawn
	 * is already the filtered list rather than a list that jumps.
	 */
	async function primePlaces(loaded: Tournament[]) {
		if ($ianseoRadiusKm <= 0 || !here) return;
		const towns = filterTournaments(loaded, filter, now).slice(0, 120).map(townOf);
		await fillPlaces(towns, false);
	}

	/** A breath between lookups: this is somebody else's free service, asked for a hundred towns at once. */
	const GAP_MS = 120;

	let filling = false;
	async function fillPlaces(towns: { name: string; country: string | null }[], ask = true) {
		if (filling) return;
		filling = true;
		try {
			// By town rather than by competition: a Sunday with four shoots in one town is one lookup.
			const wanted = new Map<string, { name: string; country: string | null }>();
			for (const town of towns) {
				if (town.name && !places.has(keyOf(town))) wanted.set(keyOf(town), town);
			}
			if (wanted.size === 0) return;

			const known = await knownPlaces([...wanted.keys()]);
			if (known.size > 0) places = new Map([...places, ...known]);

			const missing = ask ? [...wanted].filter(([key]) => !known.has(key)) : [];
			locating = missing.length;
			const found = new Map(places);
			for (const [key, town] of missing) {
				try {
					found.set(key, (await locate(town)).point);
					places = new Map(found);
				} catch (error) {
					// No network: the towns left are asked about again next time rather than remembered wrong.
					if (error instanceof PlaceUnavailable) break;
				}
				locating--;
				await new Promise((wake) => setTimeout(wake, GAP_MS));
			}
		} finally {
			locating = 0;
			filling = false;
		}
	}

	let locationError = $state(false);
	async function useMyLocation() {
		locationError = false;
		try {
			const position = await requestPosition();
			ianseoHere.set(`${position.coords.latitude},${position.coords.longitude}`);
		} catch (error) {
			locationError = error instanceof LocationDeniedError;
			ianseoRadiusKm.set(0);
		}
	}

	function chooseRadius(km: number) {
		ianseoRadiusKm.set(km);
		radiusSheet = false;
		if (km > 0 && !here) void useMyLocation();
	}

	/** Everything open for entry that no competition on screen already carries a way in to. */
	const spare = $derived(
		unmatched(
			shown.map((row) => ({ name: row.name, town: row.city, from: row.from, to: row.to })),
			entries
		).filter((one) => (one.to ?? one.from ?? 0) >= now - 86400_000)
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
			class="press rounded-lg border border-line bg-surface p-2 text-muted disabled:opacity-50"
			aria-label={$t('ianseo.refresh')}
			disabled={loading}
			onclick={() => read(true)}
		>
			<span class="block {loading ? 'animate-spin' : ''}"><Icon name="refresh" size={18} /></span>
		</button>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<ReadNote {loading} {problem} {cachedAt} banner />

	<!-- The search sits above the filters because it overrides them: a name is asked of all of ianseo. -->
	<PageTools bind:value={search} placeholder={$t('ianseo.searchPlaceholder')} />

	{#if search.trim()}
		<!-- A search reaches past the filters by default, and says so rather than doing it silently. -->
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-xs text-muted">{$t('ianseo.searchScope')}</span>
			{#each [true, false] as everywhere (everywhere)}
				<button
					class="press rounded-full border px-2.5 py-1 text-xs font-medium {$ianseoSearchEverywhere ===
					everywhere
						? 'border-brand/40 bg-brand/10 text-brand-text'
						: 'border-line text-muted'}"
					aria-pressed={$ianseoSearchEverywhere === everywhere}
					onclick={() => ianseoSearchEverywhere.set(everywhere)}
				>
					{everywhere ? $t('ianseo.searchAll') : $t('ianseo.searchMine')}
				</button>
			{/each}
		</div>
	{/if}

	{#if offered}
		<!-- Offered rather than taken: a phone one country over would otherwise hide the archer's own list. -->
		<div class="rounded-2xl border border-brand/40 bg-gradient-to-r from-brand/10 to-surface p-3">
			<p class="font-semibold">{$t('ianseo.offerCountry', { country: offered.name })}</p>
			<p class="mt-1 text-xs text-muted">{$t('ianseo.offerCountryBody')}</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<button
					class="press rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink"
					onclick={() => takeOffer(offered!)}
				>
					{$t('ianseo.offerYes', { country: offered.name })}
				</button>
				<button
					class="press rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted"
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
				class="press flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-brand-text"
				onclick={() => drop(code)}
			>
				{named.get(code) ?? code}
				<Icon name="close" size={13} />
			</button>
		{/each}
		<button
			class="press flex items-center gap-1 rounded-full border border-line py-1 pr-2.5 pl-1.5 text-xs font-medium text-muted"
			onclick={() => (countrySheet = true)}
		>
			<Icon name="plus" size={13} />
			{$t('ianseo.addCountry')}
		</button>
		<button
			class="press flex items-center gap-1 rounded-full border py-1 pr-2.5 pl-2 text-xs font-medium {$ianseoRadiusKm >
			0
				? 'border-brand/40 bg-brand/10 text-brand-text'
				: 'border-line text-muted'}"
			aria-pressed={$ianseoRadiusKm > 0}
			onclick={() => (radiusSheet = true)}
		>
			{$ianseoRadiusKm > 0 ? $t('ianseo.within', { km: $ianseoRadiusKm }) : $t('ianseo.nearMe')}
		</button>
		<button
			class="press flex items-center gap-1 rounded-full border py-1 pr-2.5 pl-1.5 text-xs font-medium {$ianseoMajor
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

	{#if $ianseoRadiusKm > 0}
		<p class="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted">
			{#if locationError}
				<span class="text-danger">{$t('ianseo.locationDenied')}</span>
			{:else if !here}
				<span>{$t('ianseo.locating')}</span>
			{:else if locating > 0}
				<!-- Towns are looked up a few at a time, so the list narrows as the answers come back. -->
				<span>{$t('ianseo.locatingTowns', { n: locating })}</span>
			{:else}
				<span>{$t('ianseo.nearYou', { km: $ianseoRadiusKm })}</span>
			{/if}
			<button class="underline" onclick={useMyLocation}>{$t('ianseo.updateLocation')}</button>
		</p>
	{/if}

	{#if failed}
		<EmptyState
			title={$t(failed === 'unreadable' ? 'ianseo.unreadableTitle' : 'ianseo.errorTitle')}
			body={$t(failed === 'unreadable' ? 'ianseo.unreadableBody' : 'ianseo.errorBody')}
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
								km={distances.get(one.tournament.toId) ?? null}
							/>
						{:else}
							<!-- Followed before the list held it, or held under a competition ianseo has retired. -->
							<a
								href={link(one.favourite.toId ?? '')}
								class="press flex items-center gap-2 rounded-2xl border border-line bg-surface p-3"
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
							km={distances.get(tournament.toId) ?? null}
						/>
					{/each}
				</div>
			</section>
		{/each}

		{#if spare.length > 0 && !search.trim()}
			<section>
				<h2 class="mb-1 px-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
					{$t('ianseo.entrySection')}
				</h2>
				<!-- Said once for the section rather than on every card, which is where it was noise. -->
				<p class="mb-2 px-1 text-xs text-muted">
					{$t('ianseo.entrySectionHint')}
					{$t('ianseo.entryBy')}
				</p>
				<div class="space-y-2">
					{#each spare as one (one.site)}
						<EntryCard entry={one} compact />
					{/each}
				</div>
			</section>
		{/if}

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
	<ReadNote {loading} {problem} {cachedAt}>
		<span>· {$t('ianseo.byline')}</span>
	</ReadNote>
</div>

<Sheet open={radiusSheet} title={$t('ianseo.nearMe')} onclose={() => (radiusSheet = false)}>
	<p class="mb-2 text-xs text-muted">{$t('ianseo.nearMeHint')}</p>
	<ul class="space-y-1">
		{#each [0, ...RADII] as km (km)}
			<li>
				<button
					class="press flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm {$ianseoRadiusKm ===
					km
						? 'bg-brand/10 font-semibold text-brand-text'
						: 'hover:bg-line/30'}"
					aria-pressed={$ianseoRadiusKm === km}
					onclick={() => chooseRadius(km)}
				>
					{km === 0 ? $t('ianseo.anyDistance') : $t('ianseo.within', { km })}
					{#if $ianseoRadiusKm === km}<Icon name="check" size={16} />{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

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
