<script lang="ts">
	import { page } from '$app/stores';
	import { t, locale } from '$lib/i18n';
	import { setPageUp } from '$lib/nav';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { account } from '$lib/sync/auth';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { readCard, type ProfileCard } from '$lib/sync/card';
	import {
		cachedProfile,
		lookup,
		refreshSharedFor,
		follow,
		unfollow,
		block,
		unblock,
		blockedAccounts,
		sharedBy,
		refreshSocial,
		SocialError,
		type Profile,
		type SharedActivity
	} from '$lib/sync/social';

	/**
	 * Somebody else's profile: their name, and whatever they chose to share. Rendered from the cache
	 * so it opens with no signal, and refreshed behind that when there is one.
	 *
	 * A private profile, and a profile that has blocked this archer, look exactly the same here. That
	 * is the point of the block, and nothing on this page may give it away.
	 */

	const handle = $derived($page.params.handle ?? '');
	$effect(() => setPageUp('/friends'));

	let profile = $state<Profile | null>(null);
	let shared = $state<SharedActivity[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let confirmingBlock = $state(false);
	let card = $state<ProfileCard | null>(null);
	// A block the archer cannot undo is a mistake they have to live with, and the profile itself never
	// says one is in place: it looks private, by design, so this is the only place that can ask.
	let blocked = $state(false);

	$effect(() => {
		void load(handle);
	});

	async function load(wanted: string) {
		profile = await cachedProfile(wanted);
		if (profile) shared = await sharedBy(profile.userId);

		// The cache answers first so the page is never blank; the server corrects it if it can.
		const fresh = await lookup(wanted).catch(() => null);
		if (fresh) {
			profile = fresh;
			// Asked for here rather than left to the background refresh, which only covers the accounts
			// this archer follows: a public profile shows what it shares to anybody browsing it.
			await refreshSharedFor(fresh.userId).catch(() => {});
			shared = await sharedBy(fresh.userId);
			// Read straight from the server and never stored: the card is somebody else's figures, and
			// keeping a copy would make them look like something this device knows.
			card = await readCard(fresh.userId).catch(() => null);
			blocked = (await blockedAccounts().catch((): string[] => [])).includes(fresh.userId);
		}
	}

	async function act(work: () => Promise<unknown>) {
		busy = true;
		error = null;
		try {
			await work();
			await refreshSocial().catch(() => {});
			await load(handle);
		} catch (e) {
			error = e instanceof SocialError && /fetch|network/i.test(e.message)
				? $t('account.error.offline')
				: $t('friends.actionFailed');
		}
		busy = false;
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

<PageHeader motif="sessions" title={profile?.displayName || `@${handle}`} subtitle={profile ? `@${profile.handle}` : undefined} />

<div class="mx-auto w-full max-w-2xl p-4">
	{#if !profile}
		<EmptyState title={$t('friends.noSuchHandle')} body={$t('friends.noSuchHandleBody')} action={{ label: $t('friends.title'), href: '/friends' }} />
	{:else}
		<section class="mb-4 rounded-xl border border-line bg-surface p-4">
			<p class="text-sm text-muted">
				{profile.isPublic ? $t('friends.publicProfile') : $t('friends.privateProfile')}
			</p>

			{#if card}
				<!-- Their own figures, as their last sync left them. Computed on their device, because
					badges and levels are worked out from the shooting record and never on the server. -->
				<dl class="mt-3 grid grid-cols-4 gap-2 text-center">
					{#each [[$t('friends.cardArrows'), card.arrows], [$t('friends.cardSessions'), card.sessions], [$t('friends.cardBadges'), card.badges], [$t('friends.cardLevel'), card.level]] as [label, value] (label)}
						<div class="rounded-lg bg-sunk p-2">
							<dt class="text-[11px] text-muted">{label}</dt>
							<dd class="tabular text-sm font-semibold">{value}</dd>
						</div>
					{/each}
				</dl>
				<p class="mt-1 text-[11px] text-muted">{$t('friends.cardStale')}</p>
			{/if}

			<!-- Your own profile offers neither: following yourself is refused by the server and blocking
				yourself is a question nobody meant to ask. -->
			{#if profile.userId !== $account?.id}
			<div class="mt-3 flex gap-2">
				{#if profile.followStatus === 'none'}
					<button
						class="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
						disabled={busy}
						onclick={() => act(() => follow(profile!.userId))}
					>
						{profile.isPublic ? $t('friends.follow') : $t('friends.askToFollow')}
					</button>
				{:else}
					<button
						class="flex-1 rounded-lg border border-line py-2 text-sm font-medium disabled:opacity-50"
						disabled={busy}
						onclick={() => act(() => unfollow(profile!.userId))}
					>
						{profile.followStatus === 'pending' ? $t('friends.cancelRequest') : $t('friends.unfollow')}
					</button>
				{/if}
				{#if !blocked}
					<button
						class="rounded-lg border border-line px-4 py-2 text-sm text-danger disabled:opacity-50"
						disabled={busy}
						onclick={() => (confirmingBlock = true)}
					>
						{$t('friends.block')}
					</button>
				{/if}
			</div>
			{/if}
		</section>

		{#if shared.length === 0}
			<EmptyState
				title={$t('friends.nothingSharedTitle')}
				body={profile.followStatus === 'approved' || profile.isPublic
					? $t('friends.nothingSharedBody')
					: $t('friends.nothingVisibleBody')}
			/>
		{:else}
			<div class="space-y-2">
				{#each shared as activity (activity.id)}
					<div class="rounded-xl border border-line bg-surface p-3">
						<div class="flex items-baseline justify-between gap-2">
							<p class="truncate text-sm font-medium">{roundName(activity)}</p>
							<p class="tabular text-sm font-semibold">{activity.activity.total_score}</p>
						</div>
						<p class="tabular mt-0.5 text-xs text-muted">
							{shownDate(Number(activity.activity.started_at ?? activity.sharedAt))}
							· {$t('friends.arrows', { n: Number(activity.activity.arrows_shot ?? 0) })}
						</p>

						<!-- Ends only, never the conditions: where and in what weather somebody shot stays
							theirs, see doc/sync.md section 6. -->
						{#if activity.ends.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each activity.ends as end (end.id)}
									<span class="tabular rounded bg-sunk px-1.5 py-0.5 text-xs">{end.subtotal}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	{#if error}
		<p class="mt-3 text-sm text-danger">{error}</p>
	{/if}
</div>

{#if confirmingBlock}
	<ConfirmDialog
		title={$t('friends.blockTitle')}
		message={$t('friends.blockBody')}
		confirmLabel={$t('friends.block')}
		onconfirm={() => {
			confirmingBlock = false;
			void act(() => block(profile!.userId));
		}}
		oncancel={() => (confirmingBlock = false)}
	/>
{/if}
