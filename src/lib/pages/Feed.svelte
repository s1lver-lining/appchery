<script lang="ts">
	import { dataVersion } from '$lib/db/changed';
	import { t } from '$lib/i18n';
	import { sharedFeed, following, followers, type Profile, type SharedActivity } from '$lib/sync/social';
	import { feedSeenAt } from '$lib/prefs';
	import { withOrigin } from '$lib/nav';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import FriendFeed from '$lib/ui/FriendFeed.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	let feed = $state<SharedActivity[]>([]);
	let friends = $state<Profile[]>([]);

	/** Whoever the device knows of, so a shared activity can name the archer who shared it. */
	const known = $derived(new Map(friends.map((profile) => [profile.userId, profile])));

	$effect(() => {
		void $dataVersion;
		refresh();
	});

	async function refresh() {
		/* The cache only: what is in it arrived through the sync, and this page never waits on it. */
		feed = await sharedFeed();
		friends = [...(await following()), ...(await followers())];
	}

	// Read is read: opening the page is the archer seeing everything on it, so the newest thing here
	// becomes the mark the home page counts from. Written after the list, or an empty first paint
	// would clear a mark that the arriving activities are about to be measured against.
	$effect(() => {
		const newest = feed.reduce((top, shared) => Math.max(top, shared.sharedAt), 0);
		if (newest > $feedSeenAt) feedSeenAt.set(newest);
	});
</script>

<PageHeader motif="feed" title={$t('friends.feedTab')} subtitle={$t('feed.subtitle')} />

<div class="mx-auto w-full max-w-page space-y-2 p-4">
	{#if feed.length === 0}
		<EmptyState
			title={$t('friends.emptyFeedTitle')}
			body={$t('friends.emptyFeedBody')}
			action={{ label: $t('friends.title'), href: withOrigin('/friends', '/feed') }}
		/>
	{:else}
		<FriendFeed {feed} {known} />
	{/if}
</div>
