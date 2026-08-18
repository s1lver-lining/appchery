<script lang="ts">
	import { LOCALES, LOCALE_NAMES, locale, t } from '$lib/i18n';

	/** Two languages, so a pair of buttons says which one you are reading better than a menu does. */
</script>

<div class="hidden rounded-full border border-line p-0.5 text-sm sm:flex" aria-label={$t('site.footer.language')}>
	{#each LOCALES as code (code)}
		<button
			class="rounded-full px-2.5 py-1 {$locale === code ? 'bg-sunk font-semibold' : 'text-muted'}"
			aria-pressed={$locale === code}
			onclick={() => locale.set(code)}
		>
			{LOCALE_NAMES[code]}
		</button>
	{/each}
</div>
