<script lang="ts" module>
	/**
	 * The last search, kept in the module rather than in the component. Opening a profile leaves this
	 * page and coming back mounts it again, and an archer who typed a handle by hand should not have
	 * to type it a second time to get back to the one result they were looking at.
	 */
	let lastSearch = $state<{ term: string; found: Profile | null; searched: boolean }>({
		term: '',
		found: null,
		searched: false
	});
</script>

<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { originOf, setPageUp } from '$lib/nav';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import TabDeck from '$lib/ui/TabDeck.svelte';
	import FriendFeed from '$lib/ui/FriendFeed.svelte';
	import { account } from '$lib/sync/auth';
	import {
		myHandle,
		claimHandle,
		isProfilePublic,
		setProfilePublic,
		lookup,
		follow,
		approve,
		removeFollower,
		following,
		followers,
		pendingRequests,
		sharedFeed,
		refreshSocial,
		SocialError,
		type Profile,
		type SharedActivity
	} from '$lib/sync/social';

	/**
	 * The social side, read from the local cache so it opens at a range with no signal. Only the
	 * actions need a connection, and they say so rather than queueing something that never leaves.
	 */

	const origin = $derived(originOf($page.url, '/settings'));
	$effect(() => setPageUp(origin));

	let handle = $state<string | null>(null);
	let isPublic = $state(false);
	let claiming = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	let search = $state(lastSearch.term);
	let found = $state<Profile | null>(lastSearch.found);
	let searched = $state(lastSearch.searched);

	$effect(() => {
		lastSearch = { term: search, found, searched };
	});

	let mine = $state<Profile[]>([]);
	let theirs = $state<Profile[]>([]);
	let waiting = $state<Profile[]>([]);
	let feed = $state<SharedActivity[]>([]);

	let tab = $state<'feed' | 'following' | 'followers'>('feed');
	const TABS = $derived([
		{ key: 'feed' as const, label: $t('friends.feedTab') },
		{ key: 'following' as const, label: $t('friends.followingTab') },
		{ key: 'followers' as const, label: $t('friends.followersTab') }
	]);

	$effect(() => {
		void open();
	});

	/**
	 * The cache paints the screen at once, and the server corrects it behind that. Without the second
	 * half, a follow request sent while this page was shut would only appear after the next exchange,
	 * which is a screen that looks wrong for no reason the archer can see.
	 */
	async function open() {
		await load();
		if (!$account) return;
		await refreshSocial().catch(() => {});
		await load();
	}

	/** Read together and put up together, so the page does not fill itself in section by section. */
	async function load() {
		const [followed, followingMe, requests, shared, name, published] = await Promise.all([
			following(),
			followers(),
			pendingRequests(),
			sharedFeed(),
			$account ? myHandle().catch(() => null) : Promise.resolve(handle),
			$account ? isProfilePublic().catch(() => false) : Promise.resolve(isPublic)
		]);
		mine = followed;
		theirs = followingMe;
		waiting = requests;
		feed = shared;
		handle = name;
		isPublic = published;
	}

	function explain(e: unknown): string {
		if (e instanceof SocialError) {
			if (e.message === 'handle unavailable') return $t('friends.handleTaken');
			if (e.message === 'too many lookups') return $t('friends.tooManyLookups');
			if (/fetch|network/i.test(e.message)) return $t('account.error.offline');
		}
		return $t('friends.actionFailed');
	}

	async function act(work: () => Promise<unknown>) {
		busy = true;
		error = null;
		try {
			await work();
			await refreshSocial().catch(() => {});
			await load();
		} catch (e) {
			error = explain(e);
		}
		busy = false;
	}

	async function claim() {
		await act(async () => {
			await claimHandle(claiming);
			claiming = '';
		});
	}

	async function find(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = null;
		searched = false;
		try {
			found = await lookup(search);
			searched = true;
		} catch (e) {
			error = explain(e);
		}
		busy = false;
	}

	// Everybody the device knows of, so a shared activity can name whoever shared it. A sharer missing
	// from here is one the cache has not caught up with, and a card that links nowhere is better than
	// a link to /friends/ that lands on this page again.
	const known = $derived(new Map([...mine, ...theirs].map((profile) => [profile.userId, profile])));

	function shownName(profile: Profile) {
		return profile.displayName || `@${profile.handle}`;
	}

</script>

<PageHeader motif="sessions" title={$t('friends.title')} />

<div class="mx-auto w-full max-w-2xl p-4">
	{#if !$account}
		<EmptyState title={$t('friends.signedOutTitle')} body={$t('friends.signedOutBody')} action={{ label: $t('account.title'), href: '/settings' }} />
	{:else if !handle}
		<!-- Asked for here and nowhere else: an archer who only wants their scores on two devices
			never becomes findable, see doc/sync.md section 6. -->
		<section>
			<h2 class="mb-2 text-sm font-semibold text-muted">{$t('friends.claimTitle')}</h2>
			<div class="rounded-xl border border-line bg-surface p-4">
				<p class="text-sm text-muted">{$t('friends.claimHint')}</p>
				<div class="mt-3 flex items-center gap-2">
					<span class="text-lg text-muted">@</span>
					<input
						class="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
						bind:value={claiming}
						autocomplete="off"
						placeholder={$t('friends.handlePlaceholder')}
					/>
				</div>
				<p class="mt-2 text-xs text-muted">{$t('friends.handleRules')}</p>
				<button
					class="press mt-3 w-full rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
					disabled={busy || claiming.trim().length < 3}
					onclick={claim}
				>
					{$t('friends.claim')}
				</button>
			</div>
		</section>
	{:else}
		<section class="mb-4">
			<div class="rounded-xl border border-line bg-surface p-4">
				<p class="text-sm font-semibold">@{handle}</p>
				<!-- Two named choices rather than a box to tick: a profile is public or it is not, and a
					checkbox left the archer reading the label to guess which of the two it was showing.
					Nothing moves until the server has taken it, so what is lit is what is stored. -->
				<div class="mt-3 flex gap-2" role="group" aria-label={$t('friends.visibility')}>
					{#each [false, true] as wanted (wanted)}
						{@const on = isPublic === wanted}
						<button
							class="press flex-1 rounded-lg border py-2 text-sm
								{on ? 'border-brand bg-brand/10 font-semibold text-brand-text' : 'border-line text-muted'}"
							aria-pressed={on}
							disabled={busy || on}
							onclick={() => act(() => setProfilePublic(wanted))}
						>
							{wanted ? $t('friends.publicProfile') : $t('friends.privateProfile')}
						</button>
					{/each}
				</div>
				<p class="mt-2 text-xs text-muted">
					{isPublic ? $t('friends.publicHint') : $t('friends.privateHint')}
				</p>
			</div>
		</section>

		<section class="mb-4">
			<form class="flex gap-2" onsubmit={find}>
				<input
					class="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
					bind:value={search}
					autocomplete="off"
					placeholder={$t('friends.searchPlaceholder')}
				/>
				<button class="press rounded-lg border border-line px-4 text-sm font-medium disabled:opacity-50" disabled={busy}>
					{$t('friends.find')}
				</button>
			</form>

			{#if found}
				<!-- The whole card opens the archer, not just their name: everything here is about them,
					and the one thing that is not is the button, which is lifted over the link. -->
				<div class="relative mt-2 flex items-center justify-between rounded-xl border border-line bg-surface p-3">
					<a class="min-w-0" href="/friends/{found.handle}">
						<span class="absolute inset-0" aria-hidden="true"></span>
						<p class="truncate text-sm font-medium">{shownName(found)}</p>
						<p class="truncate text-xs text-muted">@{found.handle}</p>
					</a>
					{#if found.followStatus === 'none'}
						<button
							class="press relative rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink disabled:opacity-50"
							disabled={busy}
							onclick={() => act(() => follow(found!.userId))}
						>
							{found.isPublic ? $t('friends.follow') : $t('friends.askToFollow')}
						</button>
					{:else}
						<span class="relative text-xs text-muted">{$t(`friends.status.${found.followStatus}`)}</span>
					{/if}
				</div>
			{:else if searched}
				<p class="mt-2 text-sm text-muted">{$t('friends.noSuchHandle')}</p>
			{/if}
		</section>

		{#if waiting.length > 0}
			<section class="mb-4">
				<h2 class="mb-2 text-sm font-semibold text-muted">{$t('friends.requests')}</h2>
				<div class="space-y-2">
					{#each waiting as profile (profile.userId)}
						<div class="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
							<a class="min-w-0" href="/friends/{profile.handle}">
								<p class="truncate text-sm font-medium">{shownName(profile)}</p>
								<p class="truncate text-xs text-muted">@{profile.handle}</p>
							</a>
							<div class="flex gap-2">
								<button
									class="press rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink disabled:opacity-50"
									disabled={busy}
									onclick={() => act(() => approve(profile.userId))}
								>
									{$t('friends.approve')}
								</button>
								<button
									class="press rounded-lg border border-line px-3 py-1.5 text-xs disabled:opacity-50"
									disabled={busy}
									onclick={() => act(() => removeFollower(profile.userId))}
								>
									{$t('friends.refuse')}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<TabDeck tabs={TABS} bind:value={tab} paneClass="space-y-2 pt-4" swipeable={false}>
			{#snippet pane(key)}
				{#if key === 'feed'}
					<FriendFeed {feed} {known} />
				{:else if key === 'following'}
					{#if mine.length === 0}
						<EmptyState title={$t('friends.emptyFollowingTitle')} body={$t('friends.emptyFollowingBody')} />
					{:else}
						{#each mine as profile (profile.userId)}
							<a class="press flex items-center justify-between rounded-xl border border-line bg-surface p-3" href="/friends/{profile.handle}">
								<span class="min-w-0">
									<span class="block truncate text-sm font-medium">{shownName(profile)}</span>
									<span class="block truncate text-xs text-muted">@{profile.handle}</span>
								</span>
								{#if profile.followStatus === 'pending'}
									<span class="text-xs text-muted">{$t('friends.status.pending')}</span>
								{:else if profile.followsUs !== 'none'}
									<span class="text-xs text-muted">{$t('friends.followsYou')}</span>
								{/if}
							</a>
						{/each}
					{/if}
				{:else if theirs.length === 0}
					<EmptyState title={$t('friends.emptyFollowersTitle')} body={$t('friends.emptyFollowersBody')} />
				{:else}
					{#each theirs as profile (profile.userId)}
						<div class="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
							<a class="min-w-0" href="/friends/{profile.handle}">
								<p class="truncate text-sm font-medium">{shownName(profile)}</p>
								<p class="truncate text-xs text-muted">@{profile.handle}</p>
							</a>
							<button
								class="press rounded-lg border border-line px-3 py-1.5 text-xs disabled:opacity-50"
								disabled={busy}
								onclick={() => act(() => removeFollower(profile.userId))}
							>
								{$t('friends.remove')}
							</button>
						</div>
					{/each}
				{/if}
			{/snippet}
		</TabDeck>
	{/if}

	{#if error}
		<p class="mt-3 text-sm text-danger">{error}</p>
	{/if}
</div>
