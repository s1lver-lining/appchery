<script lang="ts">
	import { t, locale, LOCALES, LOCALE_NAMES } from '$lib/i18n';
	import { theme, THEMES } from '$lib/theme';
	import { dbInfo } from '$lib/db';
	import { autoConditions, requestPosition, LocationDeniedError } from '$lib/conditions';

	const info = dbInfo();
	let error = $state<string | null>(null);

	/**
	 * Permission is requested at the moment the archer opts in, not silently at session start,
	 * and a refusal leaves the setting off rather than enabled but broken.
	 */
	async function toggleConditions(enabled: boolean) {
		error = null;
		if (!enabled) {
			autoConditions.set(false);
			return;
		}
		try {
			await requestPosition();
			autoConditions.set(true);
		} catch (e) {
			autoConditions.set(false);
			error = e instanceof LocationDeniedError ? $t('session.locationDenied') : String(e);
		}
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl space-y-6 p-4">
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

	<section>
		<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.conditions')}</h2>
		<p class="mb-2 text-sm text-muted">{$t('settings.conditionsHint')}</p>
		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				checked={$autoConditions}
				onchange={(e) => toggleConditions(e.currentTarget.checked)}
			/>
			{$t('settings.conditionsEnable')}
		</label>
		{#if error}
			<p class="mt-2 text-sm text-danger">{error}</p>
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
