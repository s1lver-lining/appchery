<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import { account, signIn, signUp, signOut, requestPasswordReset, AuthError, initAuth, unclaimedRowCount } from '$lib/sync/auth';
	import { hasBuiltInServer } from '$lib/sync/config';
	import { syncNow, syncStatus, refreshSyncStatus } from '$lib/sync';
	import { locale } from '$lib/i18n';

	/**
	 * The whole of sync as an archer meets it: an optional account, and a promise that signing out
	 * takes nothing away. Everything here is loaded on demand, so a device that never signs in never
	 * pays for the client library.
	 */

	let mode = $state<'signIn' | 'signUp'>('signIn');
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let notice = $state<string | null>(null);
	let error = $state<string | null>(null);
	let unclaimed = $state(0);

	const configured = hasBuiltInServer();

	onMount(async () => {
		if (!configured) return;
		// Restoring a session can try to refresh a token, which needs a network. Failing that must
		// still leave the card readable: what it mostly has to say offline is when the last sync was.
		try {
			await initAuth();
		} catch {
			error = $t('account.error.offline');
		}
		await refresh();
	});

	/**
	 * Read from the local database, never from the server. This card is looked at precisely when
	 * somebody suspects they have no signal, so it has to answer without one.
	 */
	async function refresh() {
		unclaimed = await unclaimedRowCount();
		await refreshSyncStatus();
	}

	const syncedLabel = $derived(
		$syncStatus.lastSyncAt === null
			? $t('account.neverSynced')
			: $t('account.lastSync', {
					at: new Date($syncStatus.lastSyncAt).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' })
				})
	);

	/**
	 * Supabase reports a wrong password and an unknown address with the same message, and repeating
	 * it verbatim would leak whichever it stops doing that for. Three outcomes, none of which says
	 * whether the address exists.
	 */
	function explain(e: unknown): string {
		if (!(e instanceof AuthError)) return $t('account.error.unknown');
		if (e.message === 'noServer') return $t('account.noServer');
		if (/fetch|network/i.test(e.message)) return $t('account.error.offline');
		if (/credential|password|email/i.test(e.message)) return $t('account.error.credentials');
		return $t('account.error.unknown');
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		notice = null;
		error = null;
		try {
			if (mode === 'signUp') {
				const outcome = await signUp(email, password);
				notice = outcome === 'confirm' ? $t('account.confirmEmail') : claimed();
			} else {
				await signIn(email, password);
				notice = claimed();
			}
			password = '';
			await refresh();
			// The point of signing in is the exchange, so it starts here rather than on the next resume.
			if ($account) void sync();
		} catch (e) {
			error = explain(e);
		}
		busy = false;
	}

	function claimed(): string {
		return unclaimed > 0 ? $t('account.adopted', { n: unclaimed }) : $t('account.adoptedNone');
	}

	async function sync() {
		await syncNow();
		await refresh();
	}

	async function leave() {
		busy = true;
		error = null;
		notice = null;
		try {
			await signOut();
		} catch (e) {
			error = explain(e);
		}
		busy = false;
	}

	async function reset() {
		busy = true;
		error = null;
		try {
			await requestPasswordReset(email);
			// Said whether or not the address has an account, or this becomes a way to ask which do.
			notice = $t('account.resetSent');
		} catch (e) {
			error = explain(e);
		}
		busy = false;
	}
</script>

<section>
	<h2 class="mb-2 text-sm font-semibold text-muted">{$t('account.title')}</h2>
	<div class="rounded-xl border border-line bg-surface p-4">
		{#if !configured}
			<p class="text-sm text-muted">{$t('account.noServer')}</p>
		{:else if $account}
			<p class="text-sm font-medium">{$t('account.signedInAs', { email: $account.email ?? '' })}</p>
			<p class="tabular mt-1 text-sm text-muted">
				{$syncStatus.phase === 'syncing' ? $t('account.syncing') : syncedLabel}
			</p>
			{#if $syncStatus.error === 'offline'}
				<p class="mt-1 text-sm text-muted">{$t('account.error.offline')}</p>
			{/if}
			{#if $syncStatus.pending > 0}
				<p class="mt-1 text-sm text-muted">{$t('account.waiting', { n: $syncStatus.pending })}</p>
			{/if}
			<button
				class="mt-3 w-full rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
				disabled={busy || $syncStatus.phase === 'syncing'}
				onclick={sync}
			>
				{$t('account.syncNow')}
			</button>
			<a
				class="mt-2 flex w-full items-center justify-center rounded-lg border border-line py-2 text-sm font-medium"
				href="/friends"
			>
				{$t('friends.title')}
			</a>
			<p class="mt-3 text-sm text-muted">{$t('account.signOutKeeps')}</p>
			<button
				class="mt-3 w-full rounded-lg border border-line py-2 text-sm font-medium disabled:opacity-50"
				disabled={busy}
				onclick={leave}
			>
				{$t('account.signOut')}
			</button>
		{:else}
			<p class="text-sm text-muted">{$t('account.hint')}</p>
			{#if unclaimed > 0}
				<p class="mt-1 text-sm text-muted">{$t('account.unclaimed', { n: unclaimed })}</p>
			{/if}

			<form class="mt-3 space-y-2" onsubmit={submit}>
				<label class="block">
					<span class="text-xs text-muted">{$t('account.email')}</span>
					<input
						class="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
						type="email"
						autocomplete="email"
						required
						bind:value={email}
					/>
				</label>
				<label class="block">
					<span class="text-xs text-muted">{$t('account.password')}</span>
					<input
						class="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
						type="password"
						autocomplete={mode === 'signUp' ? 'new-password' : 'current-password'}
						required
						minlength="8"
						bind:value={password}
					/>
				</label>
				<button
					class="w-full rounded-lg border border-line py-2 text-sm font-medium disabled:opacity-50"
					type="submit"
					disabled={busy}
				>
					{mode === 'signUp' ? $t('account.signUp') : $t('account.signIn')}
				</button>
			</form>

			<div class="mt-2 flex justify-between text-xs text-muted">
				<button onclick={() => (mode = mode === 'signUp' ? 'signIn' : 'signUp')}>
					{mode === 'signUp' ? $t('account.haveAccount') : $t('account.needAccount')}
				</button>
				<button disabled={busy || !email} onclick={reset}>{$t('account.forgot')}</button>
			</div>
		{/if}

		{#if notice}
			<p class="mt-3 flex items-center gap-1.5 text-sm text-brand-text">
				<Icon name="target" size={16} />
				{notice}
			</p>
		{/if}
		{#if error}
			<p class="mt-3 text-sm text-danger">{error}</p>
		{/if}
	</div>
</section>
