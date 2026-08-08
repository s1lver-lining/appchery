<script lang="ts">
	import { t, locale, LOCALES, LOCALE_NAMES } from '$lib/i18n';
	import { theme, THEMES } from '$lib/theme';
	import { dbInfo } from '$lib/db';
	import { autoLocation, autoWeather, requestPosition, LocationDeniedError } from '$lib/conditions';
	import Toggle from '$lib/ui/Toggle.svelte';

	const info = dbInfo();
	let error = $state<string | null>(null);

	/**
	 * Permission is requested the moment the archer opts in, not silently at session start, and a
	 * refusal leaves the setting off rather than enabled but quietly broken.
	 */
	async function toggleLocation(enabled: boolean) {
		error = null;
		if (!enabled) {
			autoLocation.set(false);
			// Weather is looked up from coordinates, so it cannot outlive location being switched off.
			autoWeather.set(false);
			return;
		}
		try {
			await requestPosition();
			autoLocation.set(true);
		} catch (e) {
			autoLocation.set(false);
			error = e instanceof LocationDeniedError ? $t('session.locationDenied') : String(e);
		}
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl space-y-6 p-4 pt-6">
	<h1 class="text-2xl font-bold tracking-tight">{$t('settings.title')}</h1>

	<section>
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.language')}</h2>
		<div class="flex gap-2">
			{#each LOCALES as code (code)}
				<button
					class="rounded-lg border px-4 py-2 text-sm
						{$locale === code ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
					onclick={() => locale.set(code)}
				>
					{LOCALE_NAMES[code]}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.theme')}</h2>
		<div class="flex gap-2">
			{#each THEMES as option (option)}
				<button
					class="rounded-lg border px-4 py-2 text-sm
						{$theme === option ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
					onclick={() => theme.set(option)}
				>
					{$t(
						option === 'light'
							? 'settings.themeLight'
							: option === 'dark'
								? 'settings.themeDark'
								: 'settings.themeSystem'
					)}
				</button>
			{/each}
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-sm font-semibold text-muted">{$t('settings.conditions')}</h2>

		<div class="flex items-start justify-between gap-4">
			<div class="flex-1">
				<p class="font-medium">{$t('settings.locationTitle')}</p>
				<p class="mt-0.5 text-sm text-muted">{$t('settings.locationHint')}</p>
			</div>
			<Toggle
				checked={$autoLocation}
				label={$t('settings.locationTitle')}
				onchange={toggleLocation}
			/>
		</div>

		{#if $autoLocation}
			<div class="flex items-start justify-between gap-4 border-l-2 border-line pl-4">
				<div class="flex-1">
					<p class="font-medium">{$t('settings.weatherTitle')}</p>
					<p class="mt-0.5 text-sm text-muted">{$t('settings.weatherHint')}</p>
				</div>
				<Toggle
					checked={$autoWeather}
					label={$t('settings.weatherTitle')}
					onchange={(v) => autoWeather.set(v)}
				/>
			</div>
		{/if}

		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
	</section>

	<section>
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.storage')}</h2>
		<p class="text-sm">
			<code class="rounded bg-sunk px-1">{info.kind}</code>
			· {info.persistent ? $t('settings.persistent') : $t('settings.volatile')}
		</p>
	</section>
</div>
