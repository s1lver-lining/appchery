<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import { account } from '$lib/sync/auth';
	import { setActivityShared } from '$lib/db/repository';

	/**
	 * Shared or not shared, on one activity. Who can then see it is decided by the profile and the
	 * block list, so there is nothing to choose here beyond the flag itself.
	 *
	 * Absent entirely for an archer with no account: sharing is the one part of the app that cannot
	 * work alone, and an inert button would only ask a question the app cannot answer.
	 */

	let { activityId, sharedAt, isMatch = false, onchange }: {
		activityId: string;
		sharedAt: number | null;
		/**
		 * A match carries somebody else's name and somebody else's arrows, and they never agreed to
		 * either being published. Until sharing can ask them, a match is not offered for sharing.
		 */
		isMatch?: boolean;
		onchange?: (sharedAt: number | null) => void;
	} = $props();

	let busy = $state(false);

	async function toggle() {
		busy = true;
		const wanted = sharedAt === null;
		await setActivityShared(activityId, wanted);
		// Written locally and pushed on the next exchange, so this works with no signal like the rest
		// of the app: what is shared is a fact about the row, not a request to a server.
		onchange?.(wanted ? Date.now() : null);
		busy = false;
	}
</script>

{#if $account && !isMatch}
	<div class="rounded-xl border border-line bg-surface p-4">
		<div class="flex items-center justify-between gap-3">
			<span class="text-sm font-medium">{sharedAt === null ? $t('friends.share') : $t('friends.shared')}</span>
			<button
				class="rounded-lg border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-50"
				disabled={busy}
				onclick={toggle}
			>
				<span class="flex items-center gap-1.5">
					<Icon name="share" size={14} />
					{sharedAt === null ? $t('friends.share') : $t('friends.unshare')}
				</span>
			</button>
		</div>
		<p class="mt-1 text-xs text-muted">{$t('friends.shareHint')}</p>
	</div>
{/if}
