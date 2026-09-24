<script lang="ts">
	import { Capacitor } from '@capacitor/core';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import Icon from '$lib/ui/Icon.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { readCallback } from '$lib/strava/api';
	import { STRAVA_APP_CALLBACK } from '$lib/strava/config';
	import { clearSignInStarted, exchangeCode, signInStartedHere } from '$lib/strava/tokens';

	/**
	 * Where Strava sends the runner back to. It is one page doing two jobs, because Strava returns
	 * only to its registered domain and the code is worth nothing to whichever copy of the app did
	 * not ask for it: see doc/llm-memory/strava.md.
	 *
	 * In the app, or in the browser that started the sign in, the code is traded here. In a browser
	 * that did not, it is carried on to the app instead.
	 */
	let step = $state<'working' | 'done' | 'refused' | 'handing over'>('working');
	let why = $state<string | null>(null);
	/** The same query, on the app's own scheme, which is the one link that always reaches the app. */
	let toTheApp = $state(STRAVA_APP_CALLBACK);

	$effect(() => {
		const answer = readCallback($page.url.searchParams);
		if ('refused' in answer) {
			clearSignInStarted();
			step = 'refused';
			why = answer.refused;
			return;
		}

		if (!Capacitor.isNativePlatform() && !signInStartedHere()) {
			toTheApp = `${STRAVA_APP_CALLBACK}${$page.url.search}`;
			step = 'handing over';
			// Tried without asking, since it works on its own often enough to be worth not asking.
			// The button below is what catches the browsers that refuse a jump nobody tapped.
			window.location.href = toTheApp;
			return;
		}

		clearSignInStarted();
		exchangeCode(answer.code)
			.then(() => (step = 'done'))
			.catch((error) => {
				step = 'refused';
				why = String(error);
			});
	});
</script>

<PageHeader motif="running" title={$t('strava.title')} />

<div class="mx-auto w-full max-w-page space-y-4 p-4">
	<section class="rounded-xl border border-line bg-surface p-4 text-center">
		{#if step === 'working'}
			<span class="inline-flex animate-spin text-muted"><Icon name="refresh" size={22} /></span>
			<p class="mt-2 text-sm text-muted">{$t('strava.connecting')}</p>
		{:else if step === 'handing over'}
			<p class="font-semibold">{$t('strava.handOver')}</p>
			<p class="mt-0.5 text-sm text-muted">{$t('strava.handOverHint')}</p>
			<a
				class="press mt-3 inline-flex rounded-lg bg-brand px-4 py-2.5 font-semibold text-brand-ink"
				href={toTheApp}
			>
				{$t('strava.openApp')}
			</a>
		{:else if step === 'done'}
			<span class="inline-flex text-brand-text"><Icon name="check" size={26} /></span>
			<p class="mt-2 font-semibold">{$t('strava.connected')}</p>
			<p class="mt-0.5 text-sm text-muted">{$t('strava.connectedHint')}</p>
		{:else}
			<p class="font-semibold text-danger">{$t('strava.refused')}</p>
			<p class="mt-0.5 text-sm text-muted">{why}</p>
		{/if}
	</section>

	{#if step === 'done' || step === 'refused'}
		<button
			class="press w-full rounded-xl bg-brand py-2.5 font-semibold text-brand-ink"
			onclick={() => goto('/settings')}
		>
			{$t('common.done')}
		</button>
	{/if}
</div>
