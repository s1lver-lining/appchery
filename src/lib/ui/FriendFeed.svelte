<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import EmptyState from './EmptyState.svelte';
	import type { Profile, SharedActivity } from '$lib/sync/social';

	/**
	 * The shared activities, drawn the same way on the home page and on the friends page: two places
	 * read the same feed, and a card that changed shape between them would read as two features.
	 */
	let {
		feed,
		known,
		empty = true
	}: { feed: SharedActivity[]; known: Map<string, Profile>; empty?: boolean } = $props();

	function shownName(profile: Profile) {
		return profile.displayName || `@${profile.handle}`;
	}

	function shownDate(at: number) {
		return new Date(at).toLocaleDateString($locale, { dateStyle: 'medium' });
	}

	function roundName(activity: SharedActivity) {
		try {
			const definition = JSON.parse(String(activity.activity.round_definition ?? 'null'));
			return definition?.name ?? $t('friends.anActivity');
		} catch {
			return $t('friends.anActivity');
		}
	}
</script>

{#if feed.length === 0}
	{#if empty}
		<EmptyState title={$t('friends.emptyFeedTitle')} body={$t('friends.emptyFeedBody')} />
	{/if}
{:else}
	{#each feed as shared (shared.id)}
		{@const sharer = known.get(shared.ownerId)}
		<a
			class="block rounded-xl border border-line bg-surface p-3"
			href={sharer ? `/friends/${sharer.handle}` : '/friends'}
		>
			<p class="text-sm font-medium">
				{roundName(shared)}{sharer ? ` · ${shownName(sharer)}` : ''}
			</p>
			<p class="tabular mt-0.5 text-xs text-muted">
				{shownDate(Number(shared.activity.started_at ?? shared.sharedAt))}
				· {shared.activity.total_score}
			</p>
		</a>
	{/each}
{/if}
