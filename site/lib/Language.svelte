<script lang="ts">
	import { LOCALES, LOCALE_NAMES, locale, t } from '$lib/i18n';
	import { path, type Page } from './routes';

	/** Two languages, so a pair of buttons says which one you are reading better than a menu does. */
	let { page }: { page: Page } = $props();
</script>

<div class="hidden rounded-full border border-line p-0.5 text-sm sm:flex" aria-label={$t('site.footer.language')}>
	<!-- Links rather than buttons: each language is its own address, so switching has to be a
		navigation a crawler can follow and a reader can bookmark, not a store the page keeps to itself. -->
	{#each LOCALES as code (code)}
		<a
			class="rounded-full px-2.5 py-1 {$locale === code ? 'bg-sunk font-semibold' : 'text-muted'}"
			href={path(code, page)}
			hreflang={code}
			aria-current={$locale === code ? 'true' : undefined}
		>
			{LOCALE_NAMES[code]}
		</a>
	{/each}
</div>
